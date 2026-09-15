-- Mantém a chave privada da imagem do produto sincronizada entre workspace_state e products.
-- O arquivo continua no R2 privado; o Supabase armazena somente a object key.

create or replace function public.sync_artemis_product_image_keys_from_workspace()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  item jsonb;
  v_product_id uuid;
  v_key text;
  v_prefix text;
begin
  for item in select value from jsonb_array_elements(coalesce(new.data->'products','[]'::jsonb)) loop
    begin
      v_product_id := (item->>'id')::uuid;
    exception when others then
      continue;
    end;

    v_key := nullif(trim(coalesce(item->>'imageObjectKey','')), '');
    v_prefix := 'accounts/' || new.tenant_key || '/cardapio/' || v_product_id::text || '/';

    if v_key is null then
      update public.products
         set image_object_key = null,
             updated_at = now()
       where tenant_key = new.tenant_key
         and id = v_product_id
         and image_object_key is not null;
    elsif v_key like v_prefix || '%'
       and position('..' in v_key) = 0 then
      update public.products
         set image_object_key = v_key,
             updated_at = now()
       where tenant_key = new.tenant_key
         and id = v_product_id
         and image_object_key is distinct from v_key;
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_sync_artemis_product_image_keys on public.workspace_state;
create trigger trg_sync_artemis_product_image_keys
after insert or update of data on public.workspace_state
for each row execute function public.sync_artemis_product_image_keys_from_workspace();

-- Corrige produtos já salvos antes desta migration sem exigir novo upload.
with source as (
  select ws.tenant_key,
         (item->>'id')::uuid as product_id,
         nullif(trim(coalesce(item->>'imageObjectKey','')), '') as image_object_key
    from public.workspace_state ws
    cross join lateral jsonb_array_elements(coalesce(ws.data->'products','[]'::jsonb)) item
   where coalesce(item->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
update public.products p
   set image_object_key = s.image_object_key,
       updated_at = now()
  from source s
 where p.tenant_key = s.tenant_key
   and p.id = s.product_id
   and (
     s.image_object_key is null
     or (
       s.image_object_key like ('accounts/' || s.tenant_key || '/cardapio/' || s.product_id::text || '/%')
       and position('..' in s.image_object_key) = 0
     )
   )
   and p.image_object_key is distinct from s.image_object_key;
