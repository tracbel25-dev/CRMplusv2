const configuredBase = process.env.NEXT_PUBLIC_LANDING_R2_BASE_URL?.trim() || '';

export const landingR2BaseUrl = configuredBase.replace(/\/+$/, '');

function cleanPath(path: string) {
  return path.trim().replace(/^\/+/, '');
}

export function landingR2AssetUrl(path: string) {
  if (!landingR2BaseUrl) return null;
  const clean = cleanPath(path);
  return clean ? `${landingR2BaseUrl}/${clean}` : landingR2BaseUrl;
}

export function landingAssetUrl(path: string, fallback: string) {
  return landingR2AssetUrl(path) || fallback;
}
