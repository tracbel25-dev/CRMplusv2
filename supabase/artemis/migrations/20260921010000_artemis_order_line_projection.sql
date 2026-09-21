alter table public.order_lines
  add column if not exists variant_id uuid;

create or replace function public.sync_artemis_public_orders_from_workspace()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  order_item jsonb;
  line_item jsonb;
  v_order_id uuid;
  v_line_id uuid;
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
            variant_id = excluded.variant_id,
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
  end loop;

  return new;
end;
$$;

create or replace function public.create_public_order(
  p_slug text,
  p_channel text,
  p_table_id uuid default null,
  p_customer_name text default '',
  p_phone text default '',
  p_address text default '',
  p_payment_method text default '',
  p_notes text default '',
  p_items jsonb default '[]'::jsonb,
  p_request_key uuid default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_settings public.tenant_settings%rowtype;
  v_table public.restaurant_tables%rowtype;
  v_product public.products%rowtype;
  v_existing public.orders%rowtype;
  v_item jsonb;
  v_variant jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity numeric;
  v_unit_price bigint;
  v_variant_name text;
  v_order_id uuid := gen_random_uuid();
  v_order_number bigint;
  v_fee bigint := 0;
  v_subtotal bigint := 0;
  v_total bigint := 0;
  v_table_session timestamptz := null;
  v_tenant text;
  v_any_reserved boolean := false;
  v_reserved numeric := 0;
  v_today date := (now() at time zone 'America/Belem')::date;
  v_stock record;
begin
  select * into v_settings
  from public.tenant_settings
  where public_slug = lower(trim(p_slug))
  limit 1;

  if not found then raise exception 'Restaurante não encontrado.'; end if;
  v_tenant := v_settings.tenant_key;

  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_tenant || ':' || p_request_key::text, 0));
    select * into v_existing
    from public.orders
    where tenant_key = v_tenant and request_key = p_request_key
    limit 1;

    if found then
      select coalesce(round(sum(price_cents * quantity))::bigint, 0)
        into v_subtotal
      from public.order_lines
      where tenant_key = v_tenant and order_id = v_existing.id;
      v_total := v_subtotal - v_existing.discount_cents + v_existing.fee_cents;
      return jsonb_build_object(
        'id', v_existing.id,
        'number', v_existing.number,
        'status', v_existing.status,
        'subtotal_cents', v_subtotal,
        'fee_cents', v_existing.fee_cents,
        'total_cents', v_total,
        'duplicate', true
      );
    end if;
  end if;

  if p_channel not in ('Mesa', 'Delivery', 'Retirada') then raise exception 'Canal público inválido.'; end if;

  if p_channel = 'Mesa' then
    if not v_settings.physical_enabled then raise exception 'Pedidos no salão estão desativados.'; end if;
    if p_table_id is null then raise exception 'Mesa não informada.'; end if;
    select * into v_table
      from public.restaurant_tables
      where tenant_key = v_tenant and id = p_table_id and opened_at is not null
      limit 1;
    if not found then raise exception 'Esta mesa não está com comanda aberta.'; end if;
    v_table_session := v_table.opened_at;
  elsif p_channel = 'Delivery' then
    if not v_settings.delivery_enabled then raise exception 'Delivery indisponível.'; end if;
    if v_settings.online_paused and (v_settings.online_paused_until is null or v_settings.online_paused_until > now()) then
      raise exception 'Pedidos online estão pausados.';
    end if;
    if trim(p_customer_name) = '' or trim(p_phone) = '' or trim(p_address) = '' then
      raise exception 'Nome, telefone e endereço são obrigatórios para delivery.';
    end if;
    v_fee := v_settings.delivery_fee_cents;
  else
    if not v_settings.pickup_enabled then raise exception 'Retirada indisponível.'; end if;
    if v_settings.online_paused and (v_settings.online_paused_until is null or v_settings.online_paused_until > now()) then
      raise exception 'Pedidos online estão pausados.';
    end if;
    if trim(p_customer_name) = '' or trim(p_phone) = '' then
      raise exception 'Nome e telefone são obrigatórios para retirada.';
    end if;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Pedido sem itens válidos.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::numeric;
      v_variant_id := case when nullif(v_item->>'variant_id','') is null then null else (v_item->>'variant_id')::uuid end;
    exception when others then
      raise exception 'Item do pedido inválido.';
    end;
    if v_quantity <= 0 or v_quantity > 99 or trunc(v_quantity) <> v_quantity then
      raise exception 'Quantidade inválida.';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant || ':inventory', 0));

  for v_stock in
    select
      (item->>'product_id')::uuid as product_id,
      sum((item->>'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) as item
    group by (item->>'product_id')::uuid
  loop
    select * into v_product
    from public.products
    where tenant_key = v_tenant and id = v_stock.product_id
    for update;

    if not found or not v_product.available then
      raise exception 'Um item do cardápio não está mais disponível.';
    end if;
    if v_product.sold_out_until is not null and v_product.sold_out_until >= v_today then
      raise exception '% está esgotado por hoje.', v_product.name;
    end if;

    if v_product.daily_limit is not null and v_product.daily_limit > 0 and v_product.daily_stock_date is distinct from v_today then
      update public.products
      set stock = daily_limit,
          daily_stock_date = v_today,
          updated_at = now()
      where tenant_key = v_tenant and id = v_product.id
      returning * into v_product;
    end if;

    if v_product.stock_controlled then
      select coalesce(sum(l.quantity), 0)
        into v_reserved
      from public.order_lines l
      join public.orders o
        on o.tenant_key = l.tenant_key
       and o.id = l.order_id
      where l.tenant_key = v_tenant
        and l.product_id = v_product.id
        and o.reserved = true
        and o.stock_consumed = false
        and o.status not in ('Cancelado', 'Concluído');

      if v_product.stock - v_reserved < v_stock.quantity then
        raise exception 'Estoque insuficiente: %.', v_product.name;
      end if;
      v_any_reserved := true;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := case when nullif(v_item->>'variant_id','') is null then null else (v_item->>'variant_id')::uuid end;

    select * into v_product
    from public.products
    where tenant_key = v_tenant and id = v_product_id and available = true
    limit 1;

    v_variant := null;
    v_unit_price := v_product.price_cents;
    if jsonb_array_length(coalesce(v_product.variants,'[]'::jsonb)) > 0 then
      if v_variant_id is null then raise exception 'Selecione uma opção para %.', v_product.name; end if;
      select value into v_variant
      from jsonb_array_elements(v_product.variants)
      where value->>'id' = v_variant_id::text
        and coalesce((value->>'available')::boolean, true) = true
        and (
          coalesce(value->>'soldOutUntil','') = ''
          or (
            (value->>'soldOutUntil') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            and (value->>'soldOutUntil')::date < v_today
          )
        )
      limit 1;
      if v_variant is null then raise exception 'Uma opção escolhida não está mais disponível.'; end if;
      v_unit_price := greatest(0, coalesce((v_variant->>'price')::bigint, v_product.price_cents));
    end if;
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity)::bigint;
  end loop;

  if p_channel = 'Delivery' and v_subtotal < v_settings.minimum_order_cents then
    raise exception 'Pedido abaixo do valor mínimo.';
  end if;
  v_total := v_subtotal + v_fee;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant, 0));
  select coalesce(max(number), 0) + 1 into v_order_number
  from public.orders
  where tenant_key = v_tenant;

  insert into public.orders (
    id, tenant_key, number, customer_name, phone, address, channel, table_id,
    table_session_started_at, notes, status, delivery_status, fee_cents,
    discount_cents, stock_consumed, reserved, requested_payment_method, request_key
  ) values (
    v_order_id, v_tenant, v_order_number, trim(p_customer_name), trim(p_phone), trim(p_address), p_channel,
    case when p_channel = 'Mesa' then p_table_id else null end,
    v_table_session, trim(p_notes), 'Novo', case when p_channel = 'Delivery' then 'Aguardando saída' else '' end,
    v_fee, 0, false, v_any_reserved, trim(p_payment_method), p_request_key
  );

  -- Reserva pública não baixa o estoque. A quantidade fica reservada pelo pedido
  -- e é liberada automaticamente em cancelamento. A baixa real ocorre no início do preparo.

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_variant_id := case when nullif(v_item->>'variant_id','') is null then null else (v_item->>'variant_id')::uuid end;
    select * into v_product from public.products where tenant_key = v_tenant and id = v_product_id limit 1;
    v_variant := null;
    v_unit_price := v_product.price_cents;
    v_variant_name := '';

    if v_variant_id is not null then
      select value into v_variant
      from jsonb_array_elements(coalesce(v_product.variants,'[]'::jsonb))
      where value->>'id' = v_variant_id::text
      limit 1;
      if v_variant is not null then
        v_unit_price := greatest(0, coalesce((v_variant->>'price')::bigint, v_product.price_cents));
        v_variant_name := left(trim(coalesce(v_variant->>'name','')),80);
      end if;
    end if;

    insert into public.order_lines (
      id, tenant_key, order_id, product_id, variant_id, position, description, quantity,
      price_cents, done, note, prep_minutes
    ) values (
      gen_random_uuid(), v_tenant, v_order_id, v_product.id, v_variant_id,
      (select count(*) from public.order_lines where tenant_key = v_tenant and order_id = v_order_id),
      case when v_variant_name <> '' then v_product.name || ' · ' || v_variant_name else v_product.name end,
      v_quantity, v_unit_price, false,
      left(coalesce(v_item->>'note', ''), 500), v_product.preparation_minutes
    );
  end loop;

  insert into public.order_events (tenant_key, order_id, text, event_type, metadata)
  values (
    v_tenant,
    v_order_id,
    'Pedido recebido pelo cardápio público',
    'public_order',
    jsonb_build_object('channel', p_channel, 'requested_payment_method', trim(p_payment_method), 'request_key', p_request_key)
  );

  return jsonb_build_object(
    'id', v_order_id,
    'number', v_order_number,
    'status', 'Novo',
    'subtotal_cents', v_subtotal,
    'fee_cents', v_fee,
    'total_cents', v_total,
    'duplicate', false
  );
end;
$$;

revoke execute on function public.create_public_order(text,text,uuid,text,text,text,text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.create_public_order(text,text,uuid,text,text,text,text,text,jsonb,uuid) to service_role;
