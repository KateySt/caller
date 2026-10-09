import { createHash, timingSafeEqual } from 'node:crypto';

/** Hashing first gives equal-length buffers, so the comparison is constant-time overall. */
export function constantTimeEquals(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();

  return timingSafeEqual(digest(a), digest(b));
}
