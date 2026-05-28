/**
 * SaaS migration flags (Phase 2).
 * This deployment uses PostgreSQL via the Render API — Notion/Supabase client flags stay off.
 */
export const FLAGS = {
  USE_SUPABASE_AUTH: false,
  USE_SUPABASE_FLOCKS: false,
  USE_SUPABASE_CHECKINS: false,
  USE_SUPABASE_PERFORMANCE: false,
} as const;
