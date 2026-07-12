// moderate-review — Skipily Bewertungs-Moderation
// Prüft per Claude API ob eine Bewertung Hate-Speech oder unangemessene
// Inhalte enthält und markiert sie ggf. zur Admin-Prüfung.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5"; // Haiku: schnell + günstig für Klassifikation

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Interner Endpoint: NUR per Shared-Secret aufrufbar (DB-Trigger nach
    // Review-INSERT), nicht von Clients. Verhindert das Verstecken fremder
    // Reviews (Zensur) und den Moderations-Bypass über sauberen Client-Text.
    const providedSecret = req.headers.get("x-moderation-secret") ?? "";
    const expectedSecret = Deno.env.get("MODERATION_SECRET") ?? "";
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { review_id } = await req.json();

    if (!review_id) {
      return new Response(JSON.stringify({ error: "review_id fehlt" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Supabase Admin-Client (Service Role Key — darf RLS umgehen)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Inhalt AUTORITATIV aus der DB lesen — niemals dem Aufrufer vertrauen.
    const { data: review, error: revErr } = await supabase
      .from("reviews")
      .select("comment, rating")
      .eq("id", review_id)
      .single();
    if (revErr || !review) {
      return new Response(JSON.stringify({ error: "review not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    const comment: string = review.comment ?? "";
    const rating = review.rating;

    // Nur wenn ein Kommentar vorhanden ist, prüfen
    // Reine Sternebewertungen ohne Text werden automatisch freigegeben
    if (!comment || comment.trim().length === 0) {
      return new Response(JSON.stringify({ flagged: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ── Claude-Aufruf ──────────────────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt");

    const prompt = `Du bist ein Moderations-System für Bewertungen auf einer Boots-Service-Plattform.

Analysiere folgende Bewertung und entscheide, ob sie zur manuellen Prüfung vorgelegt werden soll.

Kriterien für eine Flaggung (Wert: true):
- Hate-Speech, Beleidigungen, rassistische oder diskriminierende Aussagen
- Persönliche Angriffe auf Mitarbeiter oder Inhaber
- Obszöne oder vulgäre Sprache
- Offensichtlich gefälschte oder manipulative Bewertung (z.B. 5 Sterne + irrelevanter Text)
- Spam, Werbung, Links

Kriterien für KEINE Flaggung (Wert: false):
- Sachliche Kritik, auch wenn hart oder negativ
- Neutrale oder positive Beschreibungen
- Verbesserungsvorschläge

Sterne: ${rating}/5
Text: "${comment}"

Antworte NUR mit einem JSON-Objekt, ohne Erklärung:
{"flagged": true/false, "reason": "kurze Begründung auf Deutsch (max. 80 Zeichen) oder null"}`;

    const claudeResp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResp.ok) {
      const errText = await claudeResp.text();
      throw new Error(`Claude API Fehler: ${claudeResp.status} — ${errText}`);
    }

    const claudeData = await claudeResp.json();
    const rawText = claudeData.content?.[0]?.text?.trim() || '{"flagged":false,"reason":null}';

    let result: { flagged: boolean; reason: string | null } = { flagged: false, reason: null };
    try {
      // JSON aus der Antwort extrahieren (Claude könnte Markdown-Fences nutzen)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn("JSON-Parse fehlgeschlagen:", rawText);
    }

    // ── DB aktualisieren wenn geflaggt ─────────────────────────────────────
    if (result.flagged) {
      const { error: updateErr } = await supabase
        .from("reviews")
        .update({
          is_approved: false,
          is_reported: true,
          moderation_reason: result.reason || "KI-Moderation: unangemessener Inhalt",
        })
        .eq("id", review_id);

      if (updateErr) {
        console.error("Review-Update Fehler:", updateErr.message);
      } else {
        console.log(`Review ${review_id} zur Moderation markiert: ${result.reason}`);
      }
    }

    return new Response(JSON.stringify({ flagged: result.flagged, reason: result.reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("moderate-review Fehler:", err);
    // Fehler in der Moderation → Bewertung trotzdem sichtbar lassen (fail-open)
    return new Response(JSON.stringify({ flagged: false, error: err.message }), {
      status: 200, // 200 damit die App nicht abbricht
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
