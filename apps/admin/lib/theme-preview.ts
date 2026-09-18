import type { DomainSummary } from "@ocean/types";

import { api } from "./api";

// Dev domains are `*.localhost`, which browsers resolve to loopback natively (no /etc/hosts
// edit needed) — the storefront app just isn't reachable on the standard port there. A real
// custom domain in production serves the storefront app directly, no port needed.
function previewBase(hostname: string): string {
  return hostname.endsWith(".localhost") ? `http://${hostname}:3002` : `https://${hostname}`;
}

// The storefront origin to preview against, or null if the store has no domain configured yet.
export async function resolveStorefrontBase(storeId: string): Promise<string | null> {
  const domains = await api<{ data: DomainSummary[] }>(`/stores/${storeId}/domains`).then((r) => r.data);
  const domain = domains.find((d) => d.isPrimary) ?? domains[0];
  return domain ? previewBase(domain.hostname) : null;
}

export async function mintPreviewToken(storeId: string, storeThemeId: string, versionId: string): Promise<string> {
  const res = await api<{ data: { token: string } }>(
    `/stores/${storeId}/themes/${storeThemeId}/versions/${versionId}/preview-token`,
    { method: "POST" },
  );
  return res.data.token;
}

// A one-shot shareable preview URL (mints its own token) — for a "copy link" action, as opposed
// to the editor's own iframe, which keeps the base and token separate to rebuild the URL as the
// selected template/viewport changes without re-minting each time.
export async function buildPreviewUrl(
  storeId: string,
  storeThemeId: string,
  versionId: string,
  path = "/",
): Promise<string | null> {
  const [token, base] = await Promise.all([
    mintPreviewToken(storeId, storeThemeId, versionId),
    resolveStorefrontBase(storeId),
  ]);
  if (!base) return null;
  return `${base}${path}?preview_token=${token}`;
}
