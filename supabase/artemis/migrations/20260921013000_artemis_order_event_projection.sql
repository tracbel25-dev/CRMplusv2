create or replace function public.sync_artemis_public_orders_from_workspace()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  order_item jsonb;
  line_item jsonb;
  event_item jsonb;
  v_order_id uuid;
  v_line_id uuid;
  v_event_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_status text;
  v_delivery text;
  v_current_status text;
  v_current_delivery text;
  v_position integer;
  v_quantity numeric;
  v_price bigint;
  v_prep integer;
  v_description text;
  v_note text;
  v_done boolean;
  v_event_at timestamptz;
  v_event_text text;
begin
  for order_item in
    select value from jsonb_array_elements(
      case when jsonb_typeof(new.data->'orders') = 'array' then new.data->'orders' else '[]'::jsonb end
    )
  loop
    begin
      v_order_id := (order_item->>'id')::uuid;
    exception when others then
      continue;
    end;

    select status, delivery_status
      into v_current_status, v_current_delivery
    from public.orders
    where tenant_key = new.tenant_key and id = v_order_id
    for update;

    if not found then
      continue;
    end if;

    v_status := coalesce(nullif(order_item->>'status', ''), v_current_status);
    if v_status not in ('Novo','Aceito','Em preparo','Pronto','Concluído','Cancelado') then
      raise exception 'Situação de pedido inválida.';
    end if;

    if v_status <> v_current_status and not (
      (v_current_status = 'Novo' and v_status in ('Aceito','Cancelado')) or
      (v_current_status = 'Aceito' and v_status in ('Em preparo','Cancelado')) or
      (v_current_status = 'Em preparo' and v_status in ('Pronto','Cancelado')) or
      (v_current_status = 'Pronto' and v_status in ('Concluído','Cancelado'))
    ) then
      raise exception 'Transição de pedido inválida: % -> %.', v_current_status, v_status;
    end if;

    v_delivery := coalesce(order_item->>'delivery', v_current_delivery, '');
    if v_delivery not in ('','Aguardando saída','Saiu para entrega','Entregue') then
      raise exception 'Situação de entrega inválida.';
    end if;

    if v_delivery <> coalesce(v_current_delivery, '') and not (
      (coalesce(v_current_delivery, '') = '' and v_delivery = 'Aguardando saída') or
      (v_current_delivery = 'Aguardando saída' and v_delivery = 'Saiu para entrega') or
      (v_current_delivery = 'Saiu para entrega' and v_delivery = 'Entregue')
    ) then
      raise exception 'Transição de entrega inválida: % -> %.', coalesce(v_current_delivery, ''), v_delivery;
    end if;

    update public.orders
      set status = v_status,
          delivery_status = v_delivery,
          stock_consumed = case
            when jsonb_typeof(order_item->'stockConsumed') = 'boolean' then (order_item->>'stockConsumed')::boolean
            else stock_consumed
          end,
          reserved = case
            when jsonb_typeof(order_item->'reserved') = 'boolean' then (order_item->>'reserved')::boolean
            else reserved
          end,
          cancel_reason = case
            when v_status = 'Cancelado' then left(coalesce(order_item->>'cancelReason', cancel_reason, ''), 500)
            else cancel_reason
          end,
          updated_at = now()
    where tenant_key = new.tenant_key and id = v_order_id;

    v_position := 0;
    for line_item in
      select value from jsonb_array_elements(
        case when jsonb_typeof(order_item->'lines') = 'array' then order_item->'lines' else '[]'::jsonb end
      )
    loop
      begin
        v_line_id := (line_item->>'id')::uuid;
        v_product_id := case when nullif(line_item->>'productId','') is null then null else (line_item->>'productId')::uuid end;
        v_variant_id := case when nullif(line_item->>'variantId','') is null then null else (line_item->>'variantId')::uuid end;
        v_quantity := (line_item->>'quantity')::numeric;
        v_price := (line_item->>'price')::bigint;
        v_prep := greatest(0, coalesce((line_item->>'prepMinutes')::integer, 0));
      exception when others then
        raise exception 'Linha inválida no pedido %.', v_order_id;
      end;

      v_description := left(trim(coalesce(line_item->>'description','')), 500);
      v_note := left(coalesce(line_item->>'note',''), 500);
      v_done := coalesce((line_item->>'done')::boolean, false);

      if v_description = '' or v_quantity <= 0 or v_price < 0 then
        raise exception 'Linha inválida no pedido %.', v_order_id;
      end if;

      if v_product_id is not null and not exists (
        select 1 from public.products
        where tenant_key = new.tenant_key and id = v_product_id
      ) then
        raise exception 'Produto da linha não pertence a esta conta.';
      end if;

      insert into public.order_lines (
        id, tenant_key, order_id, product_id, variant_id, position, description,
        quantity, price_cents, done, note, prep_minutes
      ) values (
        v_line_id, new.tenant_key, v_order_id, v_product_id, v_variant_id, v_position, v_description,
        v_quantity, v_price, v_done, v_note, v_prep
      )
      on conflict (id) do update
        set product_id = excluded.product_id,
            variant_id = coalesce(excluded.variant_id, public.order_lines.variant_id),
            position = excluded.position,
            description = excluded.description,
            quantity = excluded.quantity,
            price_cents = excluded.price_cents,
            done = excluded.done,
            note = excluded.note,
            prep_minutes = excluded.prep_minutes
      where public.order_lines.tenant_key = new.tenant_key
        and public.order_lines.order_id = v_order_id;

      if not found then
        raise exception 'Conflito ao sincronizar linha do pedido.';
      end if;

      v_position := v_position + 1;
    end loop;

    for event_item in
      select value from jsonb_array_elements(
        case when jsonb_typeof(order_item->'events') = 'array' then order_item->'events' else '[]'::jsonb end
      )
    loop
      begin
        v_event_id := (event_item->>'id')::uuid;
        v_event_at := coalesce((event_item->>'at')::timestamptz, now());
      exception when others then
        continue;
      end;

      v_event_text := left(trim(coalesce(event_item->>'text','')), 1000);
      if v_event_text = '' then
        continue;
      end if;

      insert into public.order_events (
        id, tenant_key, order_id, at, text, event_type, metadata
      ) values (
        v_event_id, new.tenant_key, v_order_id, v_event_at, v_event_text, 'workspace',
        case when nullif(event_item->>'code','') is null
          then jsonb_build_object('source','workspace')
          else jsonb_build_object('source','workspace','code',left(event_item->>'code',120))
        end
      )
      on conflict (id) do update
        set at = excluded.at,
            text = excluded.text
      where public.order_events.tenant_key = new.tenant_key
        and public.order_events.order_id = v_order_id;

      if not found then
        raise exception 'Conflito ao sincronizar evento do pedido.';
      end if;
    end loop;
  end loop;

  return new;
end;
$$;
