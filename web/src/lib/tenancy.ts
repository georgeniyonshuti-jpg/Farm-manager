import { API_BASE_URL, IS_FRAPPE_MODE } from "../api/config";
import { readAuthHeaders } from "./authHeaders";
import type { SessionUser } from "../auth/types";
import { frappeGetCompanyBySlug } from "../api/frappe.api";

/** Default workspace for legacy single-tenant DB rows (migration 044). */
export const DEFAULT_COMPANY_SLUG = "default-farm";

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

/** Slug for routing when API session omits companySlug (legacy in-memory users). */
export function resolveUserCompanySlug(user: Pick<SessionUser, "companySlug"> | null | undefined): string {
  const s = user?.companySlug?.trim();
  return s || DEFAULT_COMPANY_SLUG;
}

export function userMatchesTenant(
  user: SessionUser,
  tenant: ResolvedCompany
): boolean {
  if (user.role === "superuser") return true;
  if (user.companyId) return tenant.id === user.companyId;
  return tenant.slug === resolveUserCompanySlug(user);
}

export async function resolveCompanyBySlug(
  slug: string,
  token: string | null
): Promise<ResolvedCompany | null> {
  if (IS_FRAPPE_MODE) {
    try {
      const row = await frappeGetCompanyBySlug(slug);
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        plan: "native",
        is_active: true,
      };
    } catch {
      return null;
    }
  }
  const res = await fetch(`${API_BASE_URL}/api/companies/resolve/${encodeURIComponent(slug)}`, {
    headers: readAuthHeaders(token),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { company?: ResolvedCompany };
  return data.company ?? null;
}
