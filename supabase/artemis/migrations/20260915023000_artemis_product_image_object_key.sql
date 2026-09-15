alter table public.products
  add column if not exists image_object_key text;

alter table public.products
  drop constraint if exists products_image_object_key_tenant_scope;

alter table public.products
  add constraint products_image_object_key_tenant_scope
  check (
    image_object_key is null
    or (
      image_object_key like ('accounts/' || tenant_key || '/cardapio/%')
      and position('..' in image_object_key) = 0
    )
  );

comment on column public.products.image_object_key is 'Private Cloudflare R2 object key for the Artemis product image. Must remain inside the owning tenant cardapio prefix.';
