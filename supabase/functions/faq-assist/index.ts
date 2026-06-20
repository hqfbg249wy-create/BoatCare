// =====================================================================
// faq-assist — KI-Hilfe fürs Pflegen der Provider-Portal-FAQs (Admin)
//
// Entwirft oder verbessert eine FAQ-Antwort (Deutsch) aus Stichpunkten,
// Kunden-Rückmeldungen und/oder einer bestehenden Antwort.
//
// Aufruf:
//   POST /functions/v1/faq-assist
//   {
//     category?: string,        // z.B. "csv", "payment" (Kontext)
//     question?: string,        // die Frage (optional)
//     notes?: string,           // Stichpunkte / Rückmeldungen / Fakten
//     current_answer?: string,  // bestehende Antwort zum Verbessern
//     mode?: "answer" | "question"  // default "answer"
//   }
// Antwort: { text: "…" }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

const CATEGORY_LABELS: Record<string, string> = {
  csv: "CSV-Produktimport",
  api: "API / Schnittstelle / Webhook",
  team: "Teammitglieder",
  offering: "Was Skipily bietet",
  payment: "Zahlungen, Rechnung & Abrechnung (Stripe)",
  orders_shipping: "Bestellung & Versand",
  market_analysis: "Marktanalyse nutzen",
  advantages: "Marktvorteile Skipily",
  commission: "Provisions-Staffelung & Pakete",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server-Konfiguration fehlt" }, 500);

    const body = await req.json().catch(() => ({}));
    const {
      category = "",
      question = "",
      notes = "",
      current_answer = "",
      mode = "answer",
    } = body ?? {};

    if (!notes.trim() && !current_answer.trim() && !question.trim()) {
      return json({ error: "Bitte question, notes oder current_answer angeben." }, 400);
    }

    const catLabel = CATEGORY_LABELS[category] || category || "Provider-Portal";

    const system =
      `Du schreibst FAQ-Texte für das Anbieter-Portal von Skipily, einem ` +
      `europäischen Marktplatz für Boots- und Yacht-Services und -Ersatzteile. ` +
      `Zielgruppe sind Händler/Betriebe (Anbieter), nicht Endkunden. ` +
      `Schreibe auf Deutsch, in der Du-Form, klar, freundlich und präzise. ` +
      `Kurz halten (2–5 Sätze), keine Marketing-Floskeln, keine erfundenen ` +
      `Fakten oder Zahlen — nur das, was aus den Vorgaben hervorgeht. ` +
      `Gib ausschließlich den reinen Text zurück (keine Anrede, keine ` +
      `Überschrift, kein Markdown, keine Anführungszeichen).`;

    let userPrompt: string;
    if (mode === "question") {
      userPrompt =
        `Formuliere aus den folgenden Stichpunkten EINE prägnante FAQ-Frage ` +
        `(Thema: ${catLabel}). Nur die Frage, ein Satz mit Fragezeichen.\n\n` +
        `Stichpunkte/Rückmeldung:\n${notes}`;
    } else {
      userPrompt =
        `Thema: ${catLabel}\n` +
        (question ? `Frage: ${question}\n` : "") +
        (current_answer ? `\nBestehende Antwort (verbessern/präzisieren):\n${current_answer}\n` : "") +
        (notes ? `\nStichpunkte / Kunden-Rückmeldung / Fakten:\n${notes}\n` : "") +
        `\nSchreibe die finale FAQ-Antwort.`;
    }

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude-API ${resp.status}: ${errText}`);
    }
    const data = await resp.json();
    const text: string = (data?.content?.[0]?.text ?? "").trim();
    return json({ text });
  } catch (err) {
    console.error("faq-assist error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
