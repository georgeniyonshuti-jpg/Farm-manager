import { API_BASE_URL } from "../api/config";
import { readAuthHeaders } from "./authHeaders";

export type ResolvedCompany = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
};

/** Extract company slug from URL: /app/:slug/... */
export function getSlugFromPath(pathname: string = window.location.pathname): string | null {
  const match = pathname.match(/^\/app\/([^/]+)/);
  return match ? match[1] : null;
}

/** Strip /app/:slug prefix; returns app-relative path (e.g. /farm/flocks). */
export function stripTenantPrefix(pathname: string): string {
  const match = pathname.match(/^\/app\/[^/]+(\/.*)?$/);
  if (!match) return pathname;
  return match[1] ?? "/";
}

/** Build tenant-scoped path: /app/{slug}/farm/flocks */
export function tenantPath(slug: string, path: string): string {
  const normalized = path.replace(/^\//, "");
  return `/app/${slug}/${normalized}`;
}

export function userBelongsToCompany(userCompanyId: string, urlCompanyId: string): boolean {
  return userCompanyId === urlCompanyId;
}

export async function resolveCompanyBySlug(
  slug: string,
  token: string | null
): Promise<ResolvedCompany | null> {
  const res = await fetch(`${API_BASE_URL}/api/companies/resolve/${encodeURIComponent(slug)}`, {
    headers: readAuthHeaders(token),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { company?: ResolvedCompany };
  return data.company ?? null;
}
