import type { Metadata } from 'next';
import { ArtemisDigitalPreview } from '@/components/artemis/ArtemisDigitalPreview';
import { OperationAccessGate } from '@/components/operations/OperationAccessGate';

export const metadata: Metadata = {
  title: 'Cardápio digital | Artemis',
  robots: { index: false, follow: false },
};

export default function ArtemisDigitalPreviewPage() {
  return <OperationAccessGate app="artemis"><ArtemisDigitalPreview /></OperationAccessGate>;
}
