'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useStoreAccess } from '@/lib/account/storeAccess';
import { useOperationPreferences } from '@/lib/operations/configuration';
import { useWorkspace } from '@/lib/operations/storage';
import { PublicMenu, type PublicMenuPayload, type PublicMenuProduct } from './PublicMenu';

export function ArtemisDigitalPreview() {
  const access = useStoreAccess();
  const scope = access.ready ? (access.account?.id || 'guest') : undefined;
  const workspace = useWorkspace('artemis', scope);
  const operation = useOperationPreferences('artemis', workspace);

  const payload = useMemo<PublicMenuPayload>(() => ({
    restaurant: {
      name: workspace.data.settings.business || 'Artemis',
      phone: workspace.data.settings.phone || '',
      address: workspace.data.settings.address || '',
      onlinePaused: workspace.data.settings.onlinePaused,
      onlinePausedUntil: workspace.data.settings.onlinePausedUntil || '',
      display: {
        description: operation.fieldVisible('productDescription'),
        preparation: operation.fieldVisible('prepTime'),
        ingredients: operation.fieldVisible('ingredients'),
      },
      deliveryFee: workspace.data.settings.deliveryFee,
      minimumOrder: workspace.data.settings.minimumOrder,
      deliveryAreas: workspace.data.settings.deliveryAreas,
      hours: workspace.data.settings.hours,
      physicalEnabled: operation.actionVisible('dineIn') || operation.actionVisible('counter'),
      deliveryEnabled: operation.actionVisible('delivery'),
      pickupEnabled: operation.actionVisible('pickup'),
    },
    table: { id: 'preview', name: 'Prévia do pedido' },
    products: workspace.data.products.filter(product => product.available).map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      price_cents: product.price,
      allergens: product.allergens,
      preparation_minutes: product.preparation,
      variants: product.variants || [],
      imageObjectKey: (product as typeof product & { imageObjectKey?: string }).imageObjectKey,
    } satisfies PublicMenuProduct)),
  }), [workspace.data.settings, workspace.data.products, operation.preferences]);

  if (!access.ready || !workspace.ready) {
    return <main className="artemis-public"><div className="public-state">Abrindo prévia do cardápio…</div></main>;
  }

  return <>
    <div className="artemis-preview-toolbar">
      <Link href="/artemis/cardapio"><ArrowLeft size={17} />Voltar ao cardápio</Link>
      <span>Prévia segura: você pode testar o carrinho e o fechamento sem gravar pedidos, vendas ou estoque.</span>
    </div>
    <PublicMenu slug="preview" mode="menu" preview previewPayload={payload} />
    <style jsx>{`
      .artemis-preview-toolbar{position:sticky;top:0;z-index:90;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:10px 18px;border-bottom:1px solid rgba(148,163,184,.2);background:#0b1018;color:#e5e7eb;font:13px/1.4 Inter,Arial,sans-serif}
      .artemis-preview-toolbar a{display:inline-flex;align-items:center;gap:7px;font-weight:650}
      .artemis-preview-toolbar span{color:#aeb8c6}
      @media(max-width:720px){.artemis-preview-toolbar{align-items:flex-start;flex-direction:column;gap:5px}}
    `}</style>
  </>;
}
