// HHG BI Suite — Cloudbeds admin/status Edge Function
// Diagnostic status endpoint only. No Cloudbeds calls or production sync.

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
  if (req.method !== "POST") return json({ stage: "method", error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Cloudbeds status: missing Supabase environment variable", {
      url: Boolean(supabaseUrl), anon: Boolean(anonKey), serviceRole: Boolean(serviceRoleKey),
    });
    return json({ stage: "environment", error: "Supabase function environment is incomplete." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ stage: "authentication", error: "Authentication required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    console.error("Cloudbeds status: user authentication failed", userError?.message);
    return json({ stage: "authentication", error: "Invalid or expired session." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Cloudbeds status: profile lookup failed", {
      message: profileError.message, code: profileError.code, details: profileError.details, hint: profileError.hint,
    });
    return json({ stage: "profile_lookup", error: "Unable to verify HHG access.", details: profileError.message, code: profileError.code }, 500);
  }
  if (profile?.role !== "admin") return json({ stage: "authorization", error: "Admin access required." }, 403);

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ stage: "request_body", error: "A JSON request body is required." }, 400);
  }
  if (body.action !== "status") {
    return json({ stage: "action", error: "Only status action is enabled." }, 400);
  }

  const { data: mappings, error: mappingError } = await adminClient
    .from("cloudbeds_property_map")
    .select("hhg_property_id, cloudbeds_property_id, cloudbeds_property_name, mapping_status")
    .order("hhg_property_id");

  if (mappingError) {
    console.error("Cloudbeds status: property mapping query failed", {
      message: mappingError.message, code: mappingError.code, details: mappingError.details, hint: mappingError.hint,
    });
    return json({
      stage: "property_mapping_query",
      error: "Unable to read Cloudbeds property mappings.",
      details: mappingError.message,
      code: mappingError.code,
      hint: mappingError.hint,
    }, 500);
  }

  const { data: latestSync, error: syncError } = await adminClient
    .from("cloudbeds_sync_log")
    .select("started_at, finished_at, status, message, sync_type")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (syncError) {
    console.error("Cloudbeds status: sync log query failed", {
      message: syncError.message, code: syncError.code, details: syncError.details, hint: syncError.hint,
    });
    return json({
      stage: "sync_log_query",
      error: "Unable to read Cloudbeds sync log.",
      details: syncError.message,
      code: syncError.code,
      hint: syncError.hint,
    }, 500);
  }

  return json({
    ok: true,
    phase: "preparation",
    cloudbeds_credentials_configured: Boolean(Deno.env.get("CLOUDBEDS_API_KEY")),
    cloudbeds_api_tested: false,
    production_sync_enabled: false,
    mappings: mappings ?? [],
    latest_sync: latestSync ?? null,
    note: "Status only. No Cloudbeds API request or production data synchronization.",
  });
});
