'use client';

import { useEffect, useState } from 'react';
import { resolveOperationalFile } from '@/lib/r2/client';
import type { R2App } from '@/lib/r2/server';

export function OperationalR2Image({
  app,
  objectKey,
  fallbackSrc,
  alt,
}: {
  app: R2App;
  objectKey?: string;
  fallbackSrc: string;
  alt: string;
}) {
  const [src, setSrc] = useState(fallbackSrc);

  useEffect(() => {
    let cancelled = false;
    setSrc(fallbackSrc);
    if (!objectKey) return;

    void resolveOperationalFile(app, objectKey)
      .then(url => { if (!cancelled && url) setSrc(url); })
      .catch(() => { /* mantém a última URL/fallback local disponível */ });

    return () => { cancelled = true; };
  }, [app, objectKey, fallbackSrc]);

  return <img src={src} alt={alt} />;
}
