'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveOperationalFile } from '@/lib/r2/client';
import type { R2App } from '@/lib/r2/server';

function parseStoredData(value: string) {
  if (!value.startsWith('r2:')) return { key: '', fallback: value };
  const separator = value.indexOf('|', 3);
  if (separator < 0) return { key: value.slice(3), fallback: '' };
  return { key: value.slice(3, separator), fallback: value.slice(separator + 1) };
}

export function OperationalR2Image({ app, storedData, alt }: { app: R2App; storedData: string; alt: string }) {
  const parsed = useMemo(() => parseStoredData(storedData), [storedData]);
  const [src, setSrc] = useState(parsed.fallback);

  useEffect(() => {
    let cancelled = false;
    setSrc(parsed.fallback);
    if (!parsed.key) return;

    void resolveOperationalFile(app, parsed.key)
      .then(url => { if (!cancelled && url) setSrc(url); })
      .catch(() => { /* mantém a última URL local ou assinada disponível */ });

    return () => { cancelled = true; };
  }, [app, parsed.key, parsed.fallback]);

  if (!src) return <span className="op-muted">Imagem protegida</span>;
  return <img src={src} alt={alt} />;
}

export function r2KeyFromStoredData(value: string) {
  return parseStoredData(value).key;
}
