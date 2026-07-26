// AES-GCM encryption for tokens at rest. TOKEN_ENC_KEY is base64 of 32 bytes:
//   openssl rand -base64 32
// Ciphertext format: base64( iv[12] || ciphertext+tag ).

// Return a plain ArrayBuffer view so Web Crypto's BufferSource type is satisfied.
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

async function aesKey(b64key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64key), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("TOKEN_ENC_KEY must be base64 of 32 bytes");
  return await crypto.subtle.importKey("raw", ab(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function encrypt(plaintext: string | null, b64key: string): Promise<string | null> {
  if (plaintext == null) return null;
  const key = await aesKey(b64key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ab(new TextEncoder().encode(plaintext))),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function decrypt(b64: string | null, b64key: string): Promise<string | null> {
  if (b64 == null) return null;
  const key = await aesKey(b64key);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(ct));
  return new TextDecoder().decode(pt);
}
