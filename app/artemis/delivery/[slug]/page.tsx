import type { Metadata } from 'next';
import { PublicMenu } from '@/components/artemis/PublicMenu';

export const metadata: Metadata = {
  title: 'Pedido online | Artemis',
  description: 'Cardápio para delivery e retirada.',
  robots: { index: false, follow: false },
};

export default async function ArtemisDeliveryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicMenu slug={slug} mode="delivery" />;
}
