'use client';

import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';

export type AppAssetKind = 'icon' | 'cover' | 'card';

type Props = {
  app: string;
  kind: AppAssetKind;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  fallback?: string;
};

const extensions: Record<AppAssetKind, string[]> = {
  icon: ['svg', 'png', 'jpg', 'jpeg'],
  cover: ['jpg', 'png', 'svg', 'jpeg'],
  card: ['jpg', 'png', 'svg', 'jpeg'],
};

export function AppAsset({ app, kind, alt = '', className, style, fallback }: Props) {
  const sources = useMemo(
    () => extensions[kind].map((ext) => `/app-assets/${app}/${kind}.${ext}`),
    [app, kind],
  );
  const [index, setIndex] = useState(0);

  if (index >= sources.length) {
    if (!fallback) return null;
    return <span className={className} style={style} aria-hidden="true">{fallback}</span>;
  }

  return (
    <img
      src={sources[index]}
      alt={alt}
      className={className}
      style={style}
      draggable={false}
      onError={() => setIndex((value) => value + 1)}
    />
  );
}
