// Lightweight, Zero-Dependency JWT Utility for Next.js Edge & Node Runtimes
// Uses standard Web Crypto API (supported natively in Next.js Middleware and Node.js 18+)

const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mana-pms-saas-secure-jwt-key-2026';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecodeToBytes(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface SessionPayload {
  sub: string; // user id
  username: string;
  role: string;
  hotel_id: string;
  hotel_slug: string;
  exp: number;
}

async function getKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Tạo Signed Session Token (JWT) chứa thông tin xác thực và hotel_id
 */
export async function signSessionJwt(payload: Omit<SessionPayload, 'exp'>, expiresInDays = 7): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60;
  const fullPayload: SessionPayload = { ...payload, exp };

  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const key = await getKey();
  const signatureBytes = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  const sigB64 = base64UrlEncode(new Uint8Array(signatureBytes));

  return `${dataToSign}.${sigB64}`;
}

/**
 * Giải mã và xác thực chữ ký số HMAC-SHA256 của Session Token (JWT)
 * Trả về null nếu token bị sửa đổi hoặc hết hạn.
 */
export async function verifySessionJwt(token: string): Promise<SessionPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const dataToVerify = `${headerB64}.${payloadB64}`;
    const enc = new TextEncoder();

    const key = await getKey();
    const signatureBytes = base64UrlDecodeToBytes(sigB64);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes as unknown as BufferSource,
      enc.encode(dataToVerify) as unknown as BufferSource
    );
    if (!isValid) return null;

    const payloadBytes = base64UrlDecodeToBytes(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    const payload: SessionPayload = JSON.parse(payloadStr);

    // Kiểm tra thời hạn hết hạn
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
