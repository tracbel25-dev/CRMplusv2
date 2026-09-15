import { ExternalRouter } from '@/components/external/ExternalRouter';
import '../external.css';

export default async function ExternalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ExternalRouter token={token} />;
}
