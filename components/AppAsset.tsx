'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { landingR2AssetUrl } from '@/lib/landingAssets';
import styles from './AppAsset.module.css';

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
  icon: ['png', 'svg', 'webp', 'jpg', 'jpeg'],
  cover: ['png', 'webp', 'jpg', 'jpeg', 'svg'],
  card: ['png', 'webp', 'jpg', 'jpeg', 'svg'],
};

const fixedAssets: Record<string, Partial<Record<AppAssetKind, string>>> = {
  zeus: {
    cover: '/app-assets/zeus/cover.png?v=aa095467',
    card: '/app-assets/zeus/card.png?v=01296881',
    icon: '/app-assets/zeus/icon.png?v=3f49c05b',
  },
  artemis: {
    cover: '/app-assets/artemis/cover.png?v=9f1c5c6b',
    card: '/app-assets/artemis/card.png?v=653602cf',
    icon: '/app-assets/artemis/icon.png?v=3c908d7b',
  },
};

function candidateSources(app: string, kind: AppAssetKind) {
  const remote = extensions[kind]
    .map((ext) => landingR2AssetUrl(`apps/${app}/${kind}.${ext}`))
    .filter((source): source is string => Boolean(source));
  const fixed = fixedAssets[app]?.[kind];
  const local = extensions[kind].map((ext) => `/app-assets/${app}/${kind}.${ext}`);
  return [...remote, ...(fixed ? [fixed] : []), ...local.filter((source) => source !== fixed)];
}

export function AppAsset({ app, kind, alt = '', className, style, fallback }: Props) {
  const sources = useMemo(() => candidateSources(app, kind), [app, kind]);
  const [resolvedSource, setResolvedSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolvedSource(null);
    setFailed(false);

    const trySource = (index: number) => {
      if (cancelled) return;
      if (index >= sources.length) {
        setFailed(true);
        return;
      }

      const probe = new window.Image();
      probe.onload = () => {
        if (!cancelled) setResolvedSource(sources[index]);
      };
      probe.onerror = () => trySource(index + 1);
      probe.src = sources[index];
    };

    trySource(0);
    return () => { cancelled = true; };
  }, [sources]);

  const combinedClassName = (...names: Array<string | undefined | false>) => names.filter(Boolean).join(' ');

  if (!resolvedSource && !failed) {
    return (
      <span
        className={combinedClassName(className, styles.loading)}
        style={style}
        aria-hidden="true"
      />
    );
  }

  if (failed) {
    const label = fallback || app.replaceAll('-', ' ');
    return (
      <span
        className={combinedClassName(className, styles.fallback)}
        style={style}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      >
        {label}
      </span>
    );
  }

  return (
    <img
      src={resolvedSource || undefined}
      alt={alt}
      className={combinedClassName(className, styles.ready)}
      style={style}
      draggable={false}
    />
  );
}
