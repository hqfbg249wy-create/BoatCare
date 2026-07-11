// Edge Function: validate-vat
//
// Prüft eine USt-IdNr offiziell über das EU-VIES-System.
//
// Zwei Modi:
//   (A) Pre-Check (Signup-Formular): POST { vat_id }  → { valid, name, country, checkable }
//       kein DB-Schreibzugriff, nur Rückmeldung.
//   (B) Server (DB-Trigger, Migration 106): POST { provider_id } + Header
//       x-vat-secret == VAT_VERIFY_SECRET  → lädt tax_id, prüft VIES,
//       schreibt vat_verified / vat_status / vat_verified_name / vat_checked_at.
//
// VIES deckt nur EU-Mitgliedstaaten ab. Nicht-EU (CH, GB, NO, …) → "review".
// Hinweis: Deutschland (DE) gibt über VIES KEINEN Firmennamen zurück ("---"),
// nur die Gültigkeit — das ist normal.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// EU-VIES-Ländercodes (Griechenland nutzt in VIES "EL", nicht "GR").
const VIES_COUNTRIES = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","EL","ES","FI","FR","HR","HU","IE",
  "IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]);

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Zerlegt eine USt-IdNr in Länder-Code + Nummer (bereinigt, Großbuchstaben). */
function splitVat(raw: string): { country: string; number: string } {
  const s = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  let country = s.slice(0, 2);
  if (country === "GR") country = "EL"; // Griechenland-Sonderfall
  return { country, number: s.slice(2) };
}

/** Fragt VIES ab. Liefert Gültigkeit + (falls Land liefert) Name. */
async function checkVies(rawVat: string): Promise<{
  checkable: boolean; valid: boolean; name: string | null; country: string; error?: string;
}> {
  const { country, number } = splitVat(rawVat);
  if (!VIES_COUNTRIES.has(country) || !number) {
    return { checkable: false, valid: false, name: null, country };
  }
  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${country}/vat/${number}`;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) return { checkable: true, valid: false, name: null, country, error: `VIES HTTP ${res.status}` };
    const d = await res.json();
    const name = (d.name && d.name !== "---") ? d.name : null;
    return { checkable: true, valid: !!d.valid, name, country };
  } catch (e) {
    return { checkable: true, valid: false, name: null, country, error: (e as Error)?.message ?? "VIES error" };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const providerId: string | undefined = body.provider_id;
    const vatInput: string | undefined = body.vat_id;

    // ── Modus B: Server (Trigger) ──────────────────────────────────────────
    if (providerId) {
      const expected = Deno.env.get("VAT_VERIFY_SECRET") ?? "";
      const provided = req.headers.get("x-vat-secret") ?? "";
      if (!expected || provided !== expected) return json({ error: "Forbidden" }, 403);

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: p, error } = await supabase
        .from("service_providers")
        .select("id, tax_id, name")
        .eq("id", providerId).single();
      if (error || !p) return json({ error: "Provider nicht gefunden" }, 404);
      if (!p.tax_id) return json({ status: "no_tax_id" }, 200);

      const r = await checkVies(p.tax_id);
      let status: string;
      if (!r.checkable) status = "review";        // Nicht-EU → manuell
      else if (r.error) status = "review";        // VIES-Fehler/Timeout → manuell
      else status = r.valid ? "verified" : "invalid";

      await supabase.from("service_providers").update({
        vat_verified:      r.checkable && !r.error ? r.valid : null,
        vat_verified_name: r.name,
        vat_checked_at:    new Date().toISOString(),
        vat_status:        status,
      }).eq("id", p.id);

      console.log(`VAT ${p.tax_id} → ${status} (valid=${r.valid}, name=${r.name ?? "-"})`);
      return json({ status, valid: r.valid, name: r.name }, 200);
    }

    // ── Modus A: Pre-Check (Formular) ──────────────────────────────────────
    if (vatInput) {
      const r = await checkVies(vatInput);
      return json({
        checkable: r.checkable,
        valid: r.checkable && !r.error ? r.valid : null,
        name: r.name,
        country: r.country,
        error: r.error ?? null,
      }, 200);
    }

    return json({ error: "provider_id oder vat_id erforderlich" }, 400);
  } catch (err) {
    console.error("validate-vat error:", err);
    return json({ error: (err as Error)?.message ?? String(err) }, 500);
  }
});
