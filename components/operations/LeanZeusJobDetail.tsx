'use client';

import type { Workspace } from '@/lib/operations/storage';
import { zeusViewHasFeature } from '@/lib/operations/zeusPlans';
import { LeanZeusJobDetail as LeanZeusJobDetailBase } from './LeanZeusJobDetailBase';
import { ZeusIdentificationChecklist } from './ZeusIdentificationChecklist';
import { ZeusAttachmentMetadataBridge, ZeusJobOperationalRecord } from './ZeusJobBindings';
import { ZeusOperatorFeedback } from './ZeusOperatorFeedback';

export function LeanZeusJobDetail({ w, recordId }: { w: Workspace; recordId: string }) {
  return <ZeusOperatorFeedback w={w} jobId={recordId}>
    <LeanZeusJobDetailBase w={w} recordId={recordId} />
    {zeusViewHasFeature(w.data.settings, 'checklist') && <ZeusIdentificationChecklist w={w} jobId={recordId} />}
    <ZeusAttachmentMetadataBridge w={w} jobId={recordId} />
    <ZeusJobOperationalRecord w={w} jobId={recordId} />
  </ZeusOperatorFeedback>;
}
