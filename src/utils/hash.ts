/**
 * FNV-1a (64 бита в виде двух 32-битных половин) — детерминированный, быстрый и
 * синхронный. Это важно: отпечатки считаются в content-скриптах и в тестах, где
 * SubtleCrypto доступен не всегда.
 */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 ^ ((c << 3) + i)) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
