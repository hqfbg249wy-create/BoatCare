// Edge Function: make-rope-offer
//
// Anbieter gibt auf eine Tauwerk-Anfrage ein strukturiertes Angebot mit bis zu
// 3 Varianten ab (Positionen: Material aus dem Shop, Enden, Zusatz; Rabatt;
// Versand fest oder Engine). Der Kunde waehlt spaeter EINE Variante und bezahlt
// ueber accept-offer (Deferred-Order).
//
// Body: { inquiry_id, cover_letter?, variants: [ {
//   title?, length_m?, diameter_mm?, material?, end1?, end2?,
//   material_product_id?, material_variant_id?,
//   items: [ { kind, label, qty, unit_price, product_id?, product_variant_id? } ],
//   discount_type?, discount_value?, discount_label?,
//   shipping_mode?, shipping_cost? } ] }
// Auth: Bearer <user-jwt> eines Provider-Mitglieds.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { pushToUser, emailTo, emailShell } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_SMARTLINK = Deno.env.get("APP_SMARTLINK_URL") ?? "https://app.skipily.app/inquiries";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n: number, cur = "EUR") => r2(n).toFixed(2).replace(".", ",") + " " + cur;

// Platzhalter im Anschreiben fuellen (fuer E-Mail/Notify; Rohtext bleibt gespeichert).
function renderLetter(tpl: string, provider: string, fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "";
  const first = parts.join(" ");
  return (tpl || "")
    .replaceAll("#Anbieter", provider || "")
    .replaceAll("#Vorname", first)
    .replaceAll("#Nachname", last)
    .replaceAll("#Anrede", "")
    .replace(/[ \t]{2,}/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const svc = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await svc.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const body = await req.json();
    const inquiryId = body?.inquiry_id as string;
    const coverLetter = body?.cover_letter ? String(body.cover_letter).slice(0, 4000) : null;
    const variants = Array.isArray(body?.variants) ? body.variants : [];
    const draft = body?.draft === true; // Entwurf speichern (nicht an den Kunden senden)
    if (!inquiryId) return json({ error: "inquiry_id fehlt" }, 400);
    if (variants.length < 1 || variants.length > 3) return json({ error: "1 bis 3 Varianten erforderlich" }, 400);

    const { data: inq } = await svc.from("service_inquiries")
      .select("id, provider_id, owner_id, subject").eq("id", inquiryId).maybeSingle();
    if (!inq) return json({ error: "Anfrage nicht gefunden" }, 404);

    const { data: isMember } = await userClient.rpc("provider_is_member", { pid: inq.provider_id });
    if (isMember !== true) return json({ error: "Keine Berechtigung fuer diese Anfrage" }, 403);

    // Bestehende Varianten der Anfrage ersetzen.
    await svc.from("inquiry_offer_variants").delete().eq("inquiry_id", inquiryId);

    let minTotal = Infinity;
    const currency = "EUR";

    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      const items = Array.isArray(v.items) ? v.items : [];
      const rows = items.map((it: Record<string, unknown>, i: number) => {
        const qty = r2(Number(it.qty) || 0);
        const unit = r2(Number(it.unit_price) || 0);
        return {
          kind: ["material", "end1", "end2", "custom"].includes(String(it.kind)) ? String(it.kind) : "custom",
          label: String(it.label ?? "").slice(0, 300),
          qty, unit_price: unit, line_total: r2(qty * unit),
          product_id: it.product_id ?? null,
          product_variant_id: it.product_variant_id ?? null,
          sort_order: i,
        };
      });
      const subtotal = r2(rows.reduce((s, it) => s + it.line_total, 0));
      const dType = v.discount_type === "percent" || v.discount_type === "amount" ? v.discount_type : null;
      const dVal = r2(Number(v.discount_value) || 0);
      const discountAmt = dType === "percent" ? r2(subtotal * dVal / 100) : (dType === "amount" ? dVal : 0);
      const shippingMode = v.shipping_mode === "engine" ? "engine" : "fixed";
      const shippingCost = shippingMode === "fixed" ? r2(Number(v.shipping_cost) || 0) : 0;
      const total = r2(Math.max(0, subtotal - discountAmt) + shippingCost);
      minTotal = Math.min(minTotal, total);

      const { data: varRow, error: vErr } = await svc.from("inquiry_offer_variants").insert({
        inquiry_id: inquiryId, provider_id: inq.provider_id,
        title: String(v.title ?? `Variante ${vi + 1}`).slice(0, 120), sort_order: vi,
        length_m: v.length_m ?? null, diameter_mm: v.diameter_mm ?? null,
        material: v.material ?? null, end1: v.end1 ?? null, end2: v.end2 ?? null,
        material_product_id: v.material_product_id ?? null, material_variant_id: v.material_variant_id ?? null,
        currency, discount_label: v.discount_label ? String(v.discount_label).slice(0, 200) : null,
        discount_type: dType, discount_value: dVal,
        shipping_mode: shippingMode, shipping_cost: shippingCost,
        subtotal, total,
      }).select("id").single();
      if (vErr || !varRow) return json({ error: "Variante speichern fehlgeschlagen: " + (vErr?.message ?? "") }, 500);

      if (rows.length) {
        const { error: iErr } = await svc.from("inquiry_offer_items")
          .insert(rows.map((r) => ({ ...r, variant_id: varRow.id })));
        if (iErr) return json({ error: "Positionen speichern fehlgeschlagen: " + iErr.message }, 500);
      }
    }

    const nowIso = new Date().toISOString();
    const summary = `${variants.length} Angebotsvariante(n)` +
      (minTotal < Infinity ? `, ab ${money(minTotal, currency)}` : "");
    const inqUpdate: Record<string, unknown> = {
      offer_status: draft ? "draft" : "offered",
      offer_cover_letter: coverLetter,
      offer_amount: minTotal < Infinity ? minTotal : 0,
      offer_shipping: 0,
      offer_currency: currency,
      offer_description: summary,
      offer_created_at: nowIso,
      offer_selected_variant_id: null,
    };
    // Nur beim echten Senden auf "replied" setzen (Entwurf bleibt still).
    if (!draft) { inqUpdate.status = "replied"; inqUpdate.replied_at = nowIso; }
    await svc.from("service_inquiries").update(inqUpdate).eq("id", inquiryId);

    // Entwurf: NICHT an den Kunden spiegeln/benachrichtigen.
    if (draft) {
      return json({ ok: true, draft: true, variants: variants.length, min_total: minTotal < Infinity ? minTotal : 0 });
    }

    // Provider-Name + Kaeufer fuer Platzhalter/Notify.
    const { data: prov } = await svc.from("service_providers").select("name").eq("id", inq.provider_id).maybeSingle();
    const { data: buyer } = await svc.from("profiles").select("email, full_name").eq("id", inq.owner_id).maybeSingle();
    const letter = renderLetter(coverLetter ?? "", prov?.name ?? "", buyer?.full_name ?? "");

    // Thread-Spiegelung (Anfrage -> Angebot -> Rueckfragen an einem Ort).
    try {
      const { data: convRows } = await svc.from("conversations")
        .select("id").eq("user_id", inq.owner_id).eq("provider_id", inq.provider_id).limit(1);
      let convId = convRows?.[0]?.id as string | undefined;
      if (!convId) {
        const { data: newConv } = await svc.from("conversations")
          .insert({ user_id: inq.owner_id, provider_id: inq.provider_id }).select("id").single();
        convId = newConv?.id;
      }
      if (convId) {
        const msg = `Angebot (${summary})` + (letter ? `\n\n${letter}` : "") +
          `\n\nOeffne „Anfragen", um die Varianten zu sehen und eine anzunehmen.`;
        await svc.from("messages").insert({
          conversation_id: convId, sender_id: inq.provider_id, sender_type: "provider",
          content: msg, related_inquiry_id: inquiryId,
        });
        await svc.from("conversations").update({ last_message_at: nowIso }).eq("id", convId);
      }
    } catch (e) {
      console.error("make-rope-offer thread mirror failed:", (e as Error).message);
    }

    await pushToUser(inq.owner_id, "Neues Angebot erhalten",
      `Du hast ${summary} erhalten. Jetzt in der App ansehen und eine Variante annehmen.`);
    if (buyer?.email) {
      const bodyText = `${letter || "Hallo,"}\n\nDu hast ${summary} erhalten. ` +
        `Oeffne Skipily (Bereich Anfragen), um die Varianten zu vergleichen, eine anzunehmen und sicher zu bezahlen.`;
      await emailTo(buyer.email, "Neues Angebot zu deiner Anfrage", bodyText,
        emailShell({
          heading: "Neues Angebot",
          bodyText,
          ctaLabel: "Angebot ansehen",
          ctaUrl: APP_SMARTLINK,
          footnote: "Der Button oeffnet deine Anfragen in Skipily. In der iPhone-App findest du das Angebot ebenfalls unter Anfragen.",
        }));
    }

    return json({ ok: true, variants: variants.length, min_total: minTotal < Infinity ? minTotal : 0 });
  } catch (err) {
    console.error("make-rope-offer FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
