'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function useRecordRoute(initialRecordId: string, basePath: string) {
  const router = useRouter();
  const [selected, setSelectedState] = useState(initialRecordId);

  useEffect(() => setSelectedState(initialRecordId), [initialRecordId]);

  const select = (recordId: string) => {
    setSelectedState(recordId);
    router.push(recordId ? `${basePath}/${encodeURIComponent(recordId)}` : basePath, { scroll: false });
  };

  return [selected, select] as const;
}
