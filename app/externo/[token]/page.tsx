import { ExternalPublic } from '@/components/external/ExternalPublic';
import '../external.css';

export default async function ExternalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ExternalPublic token={token} />;
}
