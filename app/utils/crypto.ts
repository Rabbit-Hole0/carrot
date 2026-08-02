/**
 * SHA-256 기반 해시 생성 (Web Crypto API 사용).
 * SHA-256 PK 기반 조회: crypto.subtle.digest('SHA-256', encoder.encode(text))
 */
export async function generateSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
