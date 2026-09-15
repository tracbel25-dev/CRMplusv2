alter table public.products
  add column if not exists variants jsonb not null default '[]'::jsonb;

alter table public.products
  drop constraint if exists products_variants_array;

alter table public.products
  add constraint products_variants_array
  check (jsonb_typeof(variants) = 'array');

create or replace function public.sanitize_artemis_variants(p_variants jsonb)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', elem->>'id',
        'name', left(trim(elem->>'name'), 80),
        'price', greatest(0, least(100000000, (elem->>'price')::bigint)),
        'available', case when elem->>'available' in ('true','false') then (elem->>'available')::boolean else true end
      ) order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(
    case when jsonb_typeof(p_variants) = 'array' then p_variants else '[]'::jsonb end
  ) with ordinality as source(elem, ord)
  where coalesce(elem->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and trim(coalesce(elem->>'name','')) <> ''
    and coalesce(elem->>'price','') ~ '^[0-9]+$';
$$;

create or replace function public.sync_artemis_product_variants_from_workspace()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  item jsonb;
  v_id uuid;
begin
  for item in select value from jsonb_array_elements(coalesce(new.data->'products','[]'::jsonb))
  loop
    begin
      v_id := (item->>'id')::uuid;
    exception when others then
      continue;
    end;

    update public.products
      set variants = public.sanitize_artemis_variants(item->'variants'),
          updated_at = now()
    where tenant_key = new.tenant_key
      and id = v_id;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_sync_artemis_product_variants_from_workspace on public.workspace_state;
create trigger trg_sync_artemis_product_variants_from_workspace
after insert or update of data on public.workspace_state
for each row execute function public.sync_artemis_product_variants_from_workspace();

do $$
declare
  row_state record;
  item jsonb;
  v_id uuid;
begin
  for row_state in select tenant_key, data from public.workspace_state
  loop
    for item in select value from jsonb_array_elements(coalesce(row_state.data->'products','[]'::jsonb))
    loop
      begin
        v_id := (item->>'id')::uuid;
      exception when others then
        continue;
      end;
      update public.products
        set variants = public.sanitize_artemis_variants(item->'variants')
      where tenant_key = row_state.tenant_key and id = v_id;
    end loop;
  end loop;
end $$;

create or replace function public.create_public_order(
  p_slug text,
  p_channel text,
  p_table_id uuid default null,
  p_customer_name text default '',
  p_phone text default '',
  p_address text default '',
  p_payment_method text default '',
  p_notes text default '',
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_settings public.tenant_settings%rowtype;
  v_table public.restaurant_tables%rowtype;
  v_product public.products%rowtype;
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
begin
  select * into v_settings
  from public.tenant_settings
  where public_slug = lower(trim(p_slug))
  limit 1;

  if not found then raise exception 'Restaurante não encontrado.'; end if;
  v_tenant := v_settings.tenant_key;

  if p_channel not in ('Mesa', 'Delivery', 'Retirada') then raise exception 'Canal público inválido.'; end if;

  if p_channel = 'Mesa' then
    if not v_settings.physical_enabled then raise exception 'Pedidos no salão estão desativados.'; end if;
    if p_table_id is null then raise exception 'Mesa não informada.'; end if;
    select * into v_table from public.restaurant_tables
      where tenant_key = v_tenant and id = p_table_id and opened_at is not null limit 1;
    if not found then raise exception 'Esta mesa não está com comanda aberta.'; end if;
    v_table_session := v_table.opened_at;
  elsif p_channel = 'Delivery' then
    if not v_settings.delivery_enabled then raise exception 'Delivery indisponível.'; end if;
    if v_settings.online_paused then raise exception 'Pedidos online estão pausados.'; end if;
    if trim(p_customer_name) = '' or trim(p_phone) = '' or trim(p_address) = '' then raise exception 'Nome, telefone e endereço são obrigatórios para delivery.'; end if;
    v_fee := v_settings.delivery_fee_cents;
  else
    if not v_settings.pickup_enabled then raise exception 'Retirada indisponível.'; end if;
    if v_settings.online_paused then raise exception 'Pedidos online estão pausados.'; end if;
    if trim(p_customer_name) = '' or trim(p_phone) = '' then raise exception 'Nome e telefone são obrigatórios para retirada.'; end if;
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

    if v_quantity <= 0 or v_quantity > 99 or trunc(v_quantity) <> v_quantity then raise exception 'Quantidade inválida.'; end if;

    select * into v_product from public.products
      where tenant_key = v_tenant and id = v_product_id and available = true limit 1;
    if not found then raise exception 'Um item do cardápio não está mais disponível.'; end if;

    v_variant := null;
    v_unit_price := v_product.price_cents;
    if jsonb_array_length(coalesce(v_product.variants,'[]'::jsonb)) > 0 then
      if v_variant_id is null then raise exception 'Selecione uma opção para %.', v_product.name; end if;
      select value into v_variant
      from jsonb_array_elements(v_product.variants)
      where value->>'id' = v_variant_id::text
        and coalesce((value->>'available')::boolean, true) = true
      limit 1;
      if v_variant is null then raise exception 'Uma opção escolhida não está mais disponível.'; end if;
      v_unit_price := greatest(0, coalesce((v_variant->>'price')::bigint, v_product.price_cents));
    end if;

    v_subtotal := v_subtotal + round(v_unit_price * v_quantity)::bigint;
  end loop;

  if p_channel = 'Delivery' and v_subtotal < v_settings.minimum_order_cents then raise exception 'Pedido abaixo do valor mínimo.'; end if;
  v_total := v_subtotal + v_fee;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant, 0));
  select coalesce(max(number), 0) + 1 into v_order_number from public.orders where tenant_key = v_tenant;

  insert into public.orders (
    id, tenant_key, number, customer_name, phone, address, channel, table_id,
    table_session_started_at, notes, status, delivery_status, fee_cents,
    discount_cents, stock_consumed, reserved, requested_payment_method
  ) values (
    v_order_id, v_tenant, v_order_number, trim(p_customer_name), trim(p_phone), trim(p_address), p_channel,
    case when p_channel = 'Mesa' then p_table_id else null end,
    v_table_session, trim(p_notes), 'Novo', case when p_channel = 'Delivery' then 'Aguardando saída' else '' end,
    v_fee, 0, false, false, trim(p_payment_method)
  );

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
      select value into v_variant from jsonb_array_elements(coalesce(v_product.variants,'[]'::jsonb)) where value->>'id' = v_variant_id::text limit 1;
      if v_variant is not null then
        v_unit_price := greatest(0, coalesce((v_variant->>'price')::bigint, v_product.price_cents));
        v_variant_name := left(trim(coalesce(v_variant->>'name','')),80);
      end if;
    end if;

    insert into public.order_lines (
      id, tenant_key, order_id, product_id, position, description, quantity,
      price_cents, done, note, prep_minutes
    ) values (
      gen_random_uuid(), v_tenant, v_order_id, v_product.id,
      (select count(*) from public.order_lines where tenant_key = v_tenant and order_id = v_order_id),
      case when v_variant_name <> '' then v_product.name || ' · ' || v_variant_name else v_product.name end,
      v_quantity, v_unit_price, false,
      left(coalesce(v_item->>'note', ''), 500), v_product.preparation_minutes
    );
  end loop;

  insert into public.order_events (tenant_key, order_id, text, event_type, metadata)
  values (v_tenant, v_order_id, 'Pedido recebido pelo cardápio público', 'public_order', jsonb_build_object('channel', p_channel, 'requested_payment_method', trim(p_payment_method)));

  return jsonb_build_object('id', v_order_id, 'number', v_order_number, 'status', 'Novo', 'subtotal_cents', v_subtotal, 'fee_cents', v_fee, 'total_cents', v_total);
end;
$$;
