'use client';

import type { Workspace } from '@/lib/operations/storage';
import { LeanZeusJobDetail as LeanZeusJobDetailBase } from './LeanZeusJobDetailBase';
import { ZeusIdentificationChecklist } from './ZeusIdentificationChecklist';
import { ZeusAttachmentMetadataBridge, ZeusJobOperationalRecord } from './ZeusJobBindings';

export function LeanZeusJobDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  return <>
    <LeanZeusJobDetailBase w={w} recordId={recordId} />
    <ZeusIdentificationChecklist w={w} jobId={recordId} />
    <ZeusAttachmentMetadataBridge w={w} jobId={recordId} />
    <ZeusJobOperationalRecord w={w} jobId={recordId} />
  </>;
}
