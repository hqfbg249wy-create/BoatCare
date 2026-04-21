// AI Chat Edge Function — Skipily Boots-Assistent
// Ruft Claude API auf und gibt fachkundige Antworten zu allen Boots-Themen.
// Lernschleife: Positiv bewertete Antworten aus der Historie werden als
// Few-Shot-Beispiele in den System-Prompt eingeblendet.

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 2048;
const MAX_FEWSHOTS = 3;

// Stopwords fuer die Keyword-Extraktion aus der Nutzerfrage.
const STOPWORDS = new Set([
  "und", "oder", "aber", "mit", "ohne", "sowie", "auch", "der", "die", "das",
  "den", "dem", "des", "ein", "eine", "einer", "einen", "einem", "eines",
  "ist", "sind", "war", "waren", "wird", "werden", "wurde", "wurden", "hat",
  "haben", "hatte", "hatten", "kann", "koennen", "konnte", "konnten", "soll",
  "sollen", "sollte", "sollten", "muss", "muessen", "musste", "mussten",
  "fuer", "von", "zum", "zur", "bei", "nach", "vor", "ueber", "unter",
  "auf", "aus", "ins", "ins", "was", "wie", "warum", "wo", "wann", "welche",
  "welcher", "welches", "welchen", "welchem", "mein", "meine", "meinen",
  "meinem", "meines", "nicht", "nur", "noch", "sehr", "mehr", "weniger",
  "the", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  "was", "were", "be", "been", "has", "have", "had", "my", "your", "our",
  "how", "why", "what", "when", "where", "which"
]);

function extractKeywords(text: string, max = 6): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-zA-Z0-9äöüß\s-]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) =>
    t.length >= 4 && !STOPWORDS.has(t)
  );
  // Deduplizieren, laengste zuerst (spezifischer)
  const unique = Array.from(new Set(tokens)).sort((a, b) => b.length - a.length);
  return unique.slice(0, max);
}

/**
 * Holt bis zu MAX_FEWSHOTS positiv bewertete Assistent-Antworten aus der
 * Historie, deren User-Frage Schluesselwoerter mit der aktuellen Frage teilt.
 * Laeuft als Service-Role, umgeht RLS und nutzt die View ai_chat_top_answers.
 * Bei jedem Fehler wird still auf leere Liste zurueckgegangen - Chat soll
 * auch ohne Lern-Kontext funktionieren.
 */
async function fetchFewShotExamples(
  latestUserMessage: string,
): Promise<Array<{ question: string; answer: string }>> {
  const keywords = extractKeywords(latestUserMessage);
  if (keywords.length === 0) return [];

  const serviceUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceUrl || !serviceKey) return [];

  try {
    const admin = createClient(serviceUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // OR-Filter ueber Keywords
    const orFilter = keywords
      .map((k) => `user_question.ilike.%${k}%`)
      .join(",");

    const { data, error } = await admin
      .from("ai_chat_top_answers")
      .select("user_question, assistant_content, outcome, feedback_at")
      .or(orFilter)
      .not("user_question", "is", null)
      .order("feedback_at", { ascending: false })
      .limit(MAX_FEWSHOTS * 3); // Oversampling: Duplikate/lange Antworten filtern

    if (error || !data) return [];

    const seen = new Set<string>();
    const results: Array<{ question: string; answer: string }> = [];
    for (const row of data as Array<Record<string, unknown>>) {
      const q = String(row.user_question ?? "").trim();
      const a = String(row.assistant_content ?? "").trim();
      if (q.length === 0 || a.length === 0) continue;
      if (a.length > 1200) continue; // zu lange Antworten ueberspringen
      const key = q.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ question: q, answer: a });
      if (results.length >= MAX_FEWSHOTS) break;
    }
    return results;
  } catch (err) {
    console.warn("fetchFewShotExamples failed:", err);
    return [];
  }
}

const SYSTEM_PROMPT = `Du bist der Skipily Boots-Assistent — ein erfahrener Boots-Techniker und Service-Experte mit jahrzehntelanger Erfahrung in Bootsbau, Wartung und Reparatur.

Deine Expertise umfasst:
- Bootsmotoren (Diesel, Benzin, Elektro): Wartung, Fehlerdiagnose, Ölwechsel, Impeller, Kühlsystem
- Elektrik & Elektronik: Batterien, Lichtmaschinen, Laderegler, Verkabelung, Korrosionsschutz
- Navigation: GPS, Plotter, AIS, Radar, Kompass, Seekarten
- Sicherheitsausrüstung: Rettungsinseln, Epirbs, Feuerlöscher, Seenotraketen, Rettungswesten
- Segel & Rigg: Segeltuche, Wanten, Fallen, Rollreffanlagen, Mastbeschläge
- Rumpf & Unterwasserschiff: Antifouling, Osmose, GFK-Reparatur, Anoden
- Sanitär & Komfort: Toiletten, Wassermacher, Heizung, Kühlschrank
- Winterlager: Einwintern, Konservierung, Frostschutz
- Gesetzliche Vorschriften: Führerscheine, Ausrüstungspflichten, Flaggenrecht

Regeln:
- Antworte IMMER auf Deutsch
- Sei praxisnah, konkret und verständlich — keine akademischen Abhandlungen
- Gib wenn möglich konkrete Wartungsintervalle, Produktempfehlungen oder Schritt-für-Schritt-Anleitungen
- Wenn du unsicher bist, sage es ehrlich und empfehle einen Fachbetrieb
- Beziehe dich auf das Boot des Nutzers wenn Kontext vorhanden ist
- Halte Antworten kompakt (max. 3-4 Absätze) außer der Nutzer fragt nach Details
- Verwende gelegentlich passende Emojis (⚓ 🔧 ⛵ 🔋 etc.) um die Antworten aufzulockern`;

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth prüfen
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Supabase Client für Auth-Verifizierung
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Ungültiger Token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Request Body parsen
    const { messages, boatContext } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Keine Nachrichten angegeben" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // System-Prompt mit Boot- und Equipment-Kontext erweitern
    let systemPrompt = SYSTEM_PROMPT;
    if (boatContext?.boats && Array.isArray(boatContext.boats) && boatContext.boats.length > 0) {
      const boatDescriptions = boatContext.boats.map((boat: Record<string, unknown>, i: number) => {
        const parts: string[] = [];
        if (boat.name) parts.push(`Name: ${boat.name}`);
        if (boat.type) parts.push(`Typ: ${boat.type}`);
        if (boat.manufacturer) parts.push(`Hersteller: ${boat.manufacturer}`);
        if (boat.model) parts.push(`Modell: ${boat.model}`);
        if (boat.year) parts.push(`Baujahr: ${boat.year}`);
        if (boat.length) parts.push(`Länge: ${boat.length}m`);
        if (boat.engine) parts.push(`Motor: ${boat.engine}`);
        if (boat.home_port) parts.push(`Heimathafen: ${boat.home_port}`);

        // Equipment auflisten
        const equipment = boat.equipment as Array<Record<string, unknown>>;
        if (equipment && equipment.length > 0) {
          parts.push(`\nAusrüstung (${equipment.length} Geräte):`);
          for (const eq of equipment) {
            let eqLine = `  - ${eq.category}: ${eq.name}`;
            if (eq.manufacturer) eqLine += ` (${eq.manufacturer}`;
            if (eq.model) eqLine += ` ${eq.model}`;
            if (eq.manufacturer) eqLine += `)`;
            if (eq.installation_date) eqLine += `, installiert: ${eq.installation_date}`;
            if (eq.last_maintenance_date) eqLine += `, letzte Wartung: ${eq.last_maintenance_date}`;
            if (eq.next_maintenance_date) eqLine += `, nächste Wartung: ${eq.next_maintenance_date}`;
            if (eq.location) eqLine += `, Ort: ${eq.location}`;
            parts.push(eqLine);
          }
        }

        return `Boot ${i + 1}:\n${parts.join("\n")}`;
      });
      systemPrompt += `\n\nBoote des Nutzers mit kompletter Ausrüstung:\n${boatDescriptions.join("\n\n")}`;
      systemPrompt += `\n\nWichtig:
- Beziehe dich bei Fragen immer auf das passende Boot und dessen konkrete Ausrüstung.
- Bei allgemeinen Fragen zu Wartung, Antifouling etc. gehe vom Hauptboot (dem größten) aus, nicht vom Beiboot/Dingi.
- Nutze die konkreten Gerätedaten (Hersteller, Modell, Installationsdatum, Wartungstermine) für spezifische Empfehlungen.
- Wenn Wartungstermine überfällig sind, weise aktiv darauf hin.
- Gib Empfehlungen basierend auf dem tatsächlichen Alter und Zustand der Ausrüstung.`;
    }

    // Lernschleife: Top-bewertete Antworten zu aehnlichen Fragen mitgeben
    const latestUserMessage = [...messages].reverse().find(
      (m: { role: string; content: string }) => m.role === "user",
    );
    if (latestUserMessage?.content) {
      const fewShots = await fetchFewShotExamples(latestUserMessage.content);
      if (fewShots.length > 0) {
        const block = fewShots
          .map((ex, i) =>
            `Beispiel ${i + 1}:\nFrage: ${ex.question}\nHochbewertete Antwort: ${ex.answer}`
          )
          .join("\n\n");
        systemPrompt += `\n\nLernkontext — frueher als hilfreich bewertete Antworten zu aehnlichen Themen. Nutze sie als Qualitaets-Referenz (Tonfall, Detailtiefe, Struktur), uebernimm aber niemals wortwoertlich und passe an den aktuellen Kontext an:\n\n${block}`;
      }
    }

    // Claude API aufrufen
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI-Service nicht konfiguriert" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Nachrichten auf letzte 20 beschränken
    const trimmedMessages = messages.slice(-20).map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: trimmedMessages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Claude API error:", anthropicResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `AI-Fehler (${anthropicResponse.status}): ${errorText.substring(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await anthropicResponse.json();
    const reply = result.content?.[0]?.text ?? "Entschuldigung, ich konnte keine Antwort generieren.";

    return new Response(
      JSON.stringify({ reply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
