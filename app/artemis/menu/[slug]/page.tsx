import type { Metadata } from 'next';
import { PublicMenu } from '@/components/artemis/PublicMenu';

export const metadata: Metadata = {
  title: 'Cardápio | Artemis',
  description: 'Cardápio digital do restaurante.',
  robots: { index: false, follow: false },
};

export default async function ArtemisPublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicMenu slug={slug} mode="menu" />;
}
