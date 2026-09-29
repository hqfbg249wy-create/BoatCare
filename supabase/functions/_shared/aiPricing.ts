// Shared Helper: Claude-API-Preise (USD pro 1 Mio. Token) + Kostenberechnung.
// Quelle: offizielle Anthropic-Preisliste. Bei neuen Modellen hier ergaenzen.
// Wird von recordAiUsage genutzt, um cost_usd je KI-Call zu speichern
// (Admin-Kostenanzeige pro Nutzer/gesamt).

type Price = { in: number; out: number }; // USD / 1M Token

const PRICES: Record<string, Price> = {
  "claude-haiku-4-5":  { in: 1.0,  out: 5.0 },
  "claude-sonnet-5":   { in: 2.0,  out: 10.0 },
  "claude-sonnet-5-5": { in: 2.0,  out: 10.0 },
  "claude-sonnet-4-6": { in: 3.0,  out: 15.0 },
  "claude-opus-5":     { in: 5.0,  out: 25.0 },
  "claude-opus-5-5":   { in: 4.0,  out: 20.0 },
};

// Fallback, wenn das Modell nicht in der Tabelle steht (konservativ = Sonnet).
const DEFAULT_PRICE: Price = { in: 2.0, out: 10.0 };

export function priceFor(model?: string | null): Price {
  if (!model) return DEFAULT_PRICE;
  return PRICES[model] ?? DEFAULT_PRICE;
}

/** Kosten eines Calls in USD aus Modell + Token. */
export function costUsd(model: string | null | undefined, inputTokens = 0, outputTokens = 0): number {
  const p = priceFor(model);
  const c = (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
  return Math.round(c * 1_000_000) / 1_000_000; // 6 Nachkommastellen
}
