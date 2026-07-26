// Signed, time-limited CSRF `state`. It carries the user id and platform so the
// callback (which arrives without a session cookie) can attribute the connection
// securely. HMAC-SHA256 with STATE_SECRET — tamper-evident and stateless.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Return a plain ArrayBuffer view so Web Crypto's BufferSource type is satisfied
// regardless of ArrayBuffer vs SharedArrayBuffer backing.
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

export interface StatePayload { uid: string; platform: string; ts: number; nonce: string; }

export async function signState(
  data: { uid: string; platform: string }, secret: string,
): Promise<string> {
  const payload: StatePayload = { ...data, ts: Date.now(), nonce: crypto.randomUUID() };
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, ab(encoder.encode(body))));
  return `${body}.${b64urlEncode(sig)}`;
}

export async function verifyState(
  token: string, secret: string, maxAgeMs = 600_000,
): Promise<StatePayload> {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("malformed state");
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, ab(b64urlDecode(sig)), ab(encoder.encode(body)));
  if (!ok) throw new Error("bad signature");
  const payload = JSON.parse(decoder.decode(b64urlDecode(body))) as StatePayload;
  if (Date.now() - payload.ts > maxAgeMs) throw new Error("state expired");
  return payload;
}
