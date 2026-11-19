// HHG BI Suite — Cloudbeds admin/status and property mapping
// No Cloudbeds API calls or production synchronization are enabled.

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

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ stage: "environment", error: "Supabase function environment is incomplete." }, 500);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ stage: "authentication", error: "Authentication required." }, 401);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ stage: "authentication", error: "Invalid or expired session." }, 401);

  const adminClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();

  if (profileError) return json({ stage: "profile_lookup", error: "Unable to verify HHG access.", details: profileError.message, code: profileError.code }, 500);
  if (profile?.role !== "admin") return json({ stage: "authorization", error: "Admin access required." }, 403);

  let body: { action?: string; hhg_property_id?: number; cloudbeds_property_id?: string; cloudbeds_property_name?: string };
  try { body = await req.json(); }
  catch { return json({ stage: "request_body", error: "A JSON request body is required." }, 400); }

  if (body.action === "save_mapping") {
    const propertyId = Number(body.hhg_property_id);
    const cloudbedsId = String(body.cloudbeds_property_id ?? "").trim();
    const cloudbedsName = String(body.cloudbeds_property_name ?? "").trim() || null;

    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return json({ stage: "mapping_validation", error: "A valid HHG property ID is required." }, 400);
    }

    const { data: property, error: propertyError } = await adminClient
      .from("properties").select("id").eq("id", propertyId).maybeSingle();
    if (propertyError) return json({ stage: "property_validation", error: "Unable to validate HHG property.", details: propertyError.message, code: propertyError.code }, 500);
    if (!property) return json({ stage: "mapping_validation", error: "The selected HHG property does not exist." }, 404);

    if (!cloudbedsId) {
      const { error: deleteError } = await adminClient
        .from("cloudbeds_property_map").delete().eq("hhg_property_id", propertyId);
      if (deleteError) return json({ stage: "mapping_delete", error: "Unable to clear property mapping.", details: deleteError.message, code: deleteError.code }, 500);
      return json({ ok: true, action: "mapping_cleared", hhg_property_id: propertyId });
    }

    const { data: saved, error: saveError } = await adminClient
      .from("cloudbeds_property_map")
      .upsert({
        hhg_property_id: propertyId,
        cloudbeds_property_id: cloudbedsId,
        cloudbeds_property_name: cloudbedsName,
        mapping_status: "pending",
        verified_at: null,
        verified_by: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "hhg_property_id" })
      .select("hhg_property_id, cloudbeds_property_id, cloudbeds_property_name, mapping_status")
      .single();

    if (saveError) {
      const duplicate = saveError.code === "23505";
      return json({
        stage: "mapping_save",
        error: duplicate ? "That Cloudbeds property ID is already assigned to another HHG property." : "Unable to save property mapping.",
        details: saveError.message,
        code: saveError.code,
      }, duplicate ? 409 : 500);
    }
    return json({ ok: true, action: "mapping_saved", mapping: saved, note: "Saved as pending. It is not verified until confirmed against Cloudbeds API property data." });
  }

  if (body.action !== "status") {
    return json({ stage: "action", error: "Supported actions are status and save_mapping." }, 400);
  }

  const { data: mappings, error: mappingError } = await adminClient
    .from("cloudbeds_property_map")
    .select("hhg_property_id, cloudbeds_property_id, cloudbeds_property_name, mapping_status")
    .order("hhg_property_id");
  if (mappingError) return json({ stage: "property_mapping_query", error: "Unable to read Cloudbeds property mappings.", details: mappingError.message, code: mappingError.code, hint: mappingError.hint }, 500);

  const { data: latestSync, error: syncError } = await adminClient
    .from("cloudbeds_sync_log")
    .select("started_at, finished_at, status, message, sync_type")
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (syncError) return json({ stage: "sync_log_query", error: "Unable to read Cloudbeds sync log.", details: syncError.message, code: syncError.code, hint: syncError.hint }, 500);

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
