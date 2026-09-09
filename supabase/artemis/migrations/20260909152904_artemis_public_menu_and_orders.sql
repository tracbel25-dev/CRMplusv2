alter table public.tenant_settings
  add column if not exists public_slug text,
  add column if not exists physical_enabled boolean not null default true,
  add column if not exists delivery_enabled boolean not null default false,
  add column if not exists pickup_enabled boolean not null default false,
  add column if not exists loyalty_enabled boolean not null default false,
  add column if not exists new_order_sound_enabled boolean not null default true;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_public_slug_check;
alter table public.tenant_settings
  add constraint tenant_settings_public_slug_check
  check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{2,49}$');

create unique index if not exists tenant_settings_public_slug_key
  on public.tenant_settings (public_slug)
  where public_slug is not null;

alter table public.orders
  add column if not exists requested_payment_method text not null default '';

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
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_settings public.tenant_settings%rowtype;
  v_table public.restaurant_tables%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric;
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

  if not found then
    raise exception 'Restaurante não encontrado.';
  end if;

  v_tenant := v_settings.tenant_key;

  if p_channel not in ('Mesa', 'Delivery', 'Retirada') then
    raise exception 'Canal público inválido.';
  end if;

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
    if v_settings.online_paused then raise exception 'Pedidos online estão pausados.'; end if;
    if trim(p_customer_name) = '' or trim(p_phone) = '' or trim(p_address) = '' then
      raise exception 'Nome, telefone e endereço são obrigatórios para delivery.';
    end if;
    v_fee := v_settings.delivery_fee_cents;
  elsif p_channel = 'Retirada' then
    if not v_settings.pickup_enabled then raise exception 'Retirada indisponível.'; end if;
    if v_settings.online_paused then raise exception 'Pedidos online estão pausados.'; end if;
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
    exception when others then
      raise exception 'Item do pedido inválido.';
    end;

    if v_quantity <= 0 or v_quantity > 99 or trunc(v_quantity) <> v_quantity then
      raise exception 'Quantidade inválida.';
    end if;

    select * into v_product
    from public.products
    where tenant_key = v_tenant and id = v_product_id and available = true
    limit 1;

    if not found then raise exception 'Um item do cardápio não está mais disponível.'; end if;
    v_subtotal := v_subtotal + round(v_product.price_cents * v_quantity)::bigint;
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
    select * into v_product
    from public.products
    where tenant_key = v_tenant and id = v_product_id
    limit 1;

    insert into public.order_lines (
      id, tenant_key, order_id, product_id, position, description, quantity,
      price_cents, done, note, prep_minutes
    ) values (
      gen_random_uuid(), v_tenant, v_order_id, v_product.id,
      (select count(*) from public.order_lines where tenant_key = v_tenant and order_id = v_order_id),
      v_product.name, v_quantity, v_product.price_cents, false,
      left(coalesce(v_item->>'note', ''), 500), v_product.preparation_minutes
    );
  end loop;

  insert into public.order_events (tenant_key, order_id, text, event_type, metadata)
  values (
    v_tenant,
    v_order_id,
    'Pedido recebido pelo cardápio público',
    'public_order',
    jsonb_build_object('channel', p_channel, 'requested_payment_method', trim(p_payment_method))
  );

  return jsonb_build_object(
    'id', v_order_id,
    'number', v_order_number,
    'status', 'Novo',
    'subtotal_cents', v_subtotal,
    'fee_cents', v_fee,
    'total_cents', v_total
  );
end;
$$;

revoke execute on function public.create_public_order(text,text,uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_public_order(text,text,uuid,text,text,text,text,text,jsonb) to service_role;

grant select, insert, update on public.tenants, public.tenant_settings, public.products, public.restaurant_tables,
  public.orders, public.order_lines, public.order_events to service_role;
