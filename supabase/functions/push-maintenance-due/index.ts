// Edge Function: push-maintenance-due
//
// Taeglicher Cron. Findet Equipment-Wartungen, die HEUTE oder in genau 7 Tagen
// faellig sind, und schickt dem jeweiligen Bootseigner einen Push (ueber
// send-push). Ergaenzt die lokalen Erinnerungen (Plan A) fuer Nutzer, die die
// App selten oeffnen.
//
// Absicherung: Aufruf nur mit Service-Role-Key als Bearer (Cron / intern).
// Empfohlener Trigger: pg_cron -> net.http_post, oder GitHub-Actions-Cron.
//
// Hinweis: Text ist aktuell Deutsch (App ist DE-first). Mehrsprachig spaeter
// ueber ein gespeichertes Sprach-Preference-Feld pro User.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    const targetDays = [isoDay(0), isoDay(7)];

    // Equipment mit Faelligkeit heute/in 7 Tagen + zugehoeriges Boot (Owner).
    const { data: items, error } = await supabase
      .from("equipment")
      .select("id, name, next_maintenance_date, boats(name, owner_id)")
      .in("next_maintenance_date", targetDays);
    if (error) return json({ error: error.message }, 500);
    if (!items || items.length === 0) return json({ status: "none", sent: 0 });

    let sent = 0;
    for (const it of items as Array<Record<string, any>>) {
      const boat = it.boats;
      const ownerId = boat?.owner_id as string | undefined;
      if (!ownerId) continue;

      const boatName = boat?.name ? ` (${boat.name})` : "";
      const dateStr = new Date(it.next_maintenance_date + "T00:00:00Z")
        .toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

      const res = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: ownerId,
          title: "Wartung fällig",
          body: `${it.name}${boatName} ist am ${dateStr} fällig.`,
          data: { type: "maintenance", equipment_id: String(it.id) },
        }),
      });
      if (res.ok) sent++;
    }

    return json({ status: "ok", checked: items.length, sent });
  } catch (err) {
    console.error("push-maintenance-due error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
