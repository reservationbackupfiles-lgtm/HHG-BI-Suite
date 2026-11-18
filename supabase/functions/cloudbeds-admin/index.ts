// HHG BI Suite — Cloudbeds admin/status Edge Function
// Status-only preparation endpoint. No Cloudbeds calls or production sync.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Supabase function environment is incomplete." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid or expired session." }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) return json({ error: "Unable to verify HHG access." }, 500);
  if (profile?.role !== "admin") return json({ error: "Admin access required." }, 403);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "A JSON request body is required." }, 400);
  }
  if (body.action !== "status") {
    return json({ error: "Unsupported action. Only status is enabled in this preparation phase." }, 400);
  }

  const cloudbedsSecretPresent = Boolean(Deno.env.get("CLOUDBEDS_API_KEY"));
  const { data: mappings, error: mappingError } = await adminClient
    .from("cloudbeds_property_map")
    .select("hhg_property_id, cloudbeds_property_id, cloudbeds_property_name, mapping_status")
    .order("hhg_property_id");

  if (mappingError) {
    return json({
      error: "Cloudbeds integration migration has not been applied or mapping table is unavailable.",
      setup_complete: false,
    }, 503);
  }

  const { data: latestSync, error: syncError } = await adminClient
    .from("cloudbeds_sync_log")
    .select("started_at, finished_at, status, message, sync_type")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (syncError) return json({ error: "Unable to read Cloudbeds sync status." }, 500);

  return json({
    ok: true,
    phase: "preparation",
    cloudbeds_credentials_configured: cloudbedsSecretPresent,
    cloudbeds_api_tested: false,
    production_sync_enabled: false,
    mappings: mappings ?? [],
    latest_sync: latestSync ?? null,
    note: "Status only. No Cloudbeds API request or production data synchronization is performed.",
  });
});
