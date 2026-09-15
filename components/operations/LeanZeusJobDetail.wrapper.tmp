'use client';

import type { Workspace } from '@/lib/operations/storage';
import { LeanZeusJobDetail as LeanZeusJobDetailBase } from './LeanZeusJobDetailBase';
import { ZeusIdentificationChecklist } from './ZeusIdentificationChecklist';

export function LeanZeusJobDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  return <><LeanZeusJobDetailBase w={w} recordId={recordId} /><ZeusIdentificationChecklist w={w} jobId={recordId} /></>;
}
