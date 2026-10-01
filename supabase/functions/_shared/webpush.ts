// Web Push (RFC 8291, Content-Encoding: aes128gcm) + VAPID (RFC 8292).
// Selbststaendige WebCrypto-Implementierung ohne externe Abhaengigkeit.
//
// Secrets:
//   VAPID_PUBLIC_KEY   - base64url des 65-Byte P-256-Punkts (auch im Web-Client)
//   VAPID_PRIVATE_KEY  - base64 der PKCS8-DER des VAPID-Private-Keys (ES256)
//   VAPID_SUBJECT      - mailto:... oder https:... Kontakt

export interface WebPushSub {
  endpoint: string;
  p256dh: string; // base64url
  auth: string;   // base64url
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// ── VAPID-JWT (ES256) ──
async function vapidJwt(aud: string, privatePkcs8B64: string, subject: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud, exp: now + 12 * 60 * 60, sub: subject };
  const enc = (o: unknown) => bytesToB64url(utf8(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(claims)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", b64ToBytes(privatePkcs8B64),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, utf8(signingInput)));
  return `${signingInput}.${bytesToB64url(sig)}`;
}

// ── Payload verschluesseln (aes128gcm) ──
async function encrypt(payload: Uint8Array, sub: WebPushSub): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh);  // 65
  const authSecret = b64urlToBytes(sub.auth);  // 16

  const asKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey)); // 65
  const uaKey = await crypto.subtle.importKey(
    "raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaKey }, asKeys.privateKey, 256)); // 32

  // RFC 8291: IKM aus auth_secret + ECDH-Secret ableiten.
  const keyInfo = concat(utf8("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // Ein Record: Payload + Delimiter 0x02 (kein weiteres Padding).
  const record = concat(payload, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce }, aesKey, record));

  // Header: salt(16) | rs(uint32=4096) | idlen(1=65) | as_public(65) | ciphertext
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

export interface WebPushResult { ok: boolean; status: number; gone: boolean; }

// Sendet eine Web-Push-Nachricht. gone=true => Abo ist tot (404/410) und
// sollte vom Aufrufer entfernt werden.
export async function sendWebPush(
  sub: WebPushSub,
  payload: Record<string, unknown>,
  opts: { publicKey: string; privateKey: string; subject: string; ttl?: number },
): Promise<WebPushResult> {
  const body = await encrypt(utf8(JSON.stringify(payload)), sub);
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(aud, opts.privateKey, opts.subject);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${opts.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": String(opts.ttl ?? 2419200),
      "Urgency": "normal",
    },
    body,
  });
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
