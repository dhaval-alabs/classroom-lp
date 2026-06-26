import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Accept either the legacy service_role key (SUPABASE_SERVICE_KEY) or the new
// `sb_secret_…` key (SUPABASE_SECRET_KEY). Both bypass RLS server-side.
function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
}

// This app lives in its own schema in the shared Supabase project (isolated
// from excel-to-ai etc.). Expose this schema in Supabase → Settings → API.
function schema(): string {
  return process.env.SUPABASE_SCHEMA || "classroom_lp";
}

/**
 * Server-only secret/service-role client (bypasses RLS). Never import into
 * client code. Returns null when env is not configured so the lead route can
 * degrade gracefully (log instead of crash) during local UI previews.
 */
export function db(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serviceKey();
  if (!url || !key) return null;
  // Cast: a runtime (env-driven) schema string isn't a literal, so the typed
  // client generic can't be inferred. Tables are untyped here anyway (we use
  // string table names), so the public-schema client type is fine.
  cached = createClient(url, key, {
    auth: { persistSession: false },
    db: { schema: schema() },
  }) as unknown as SupabaseClient;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && serviceKey());
}
