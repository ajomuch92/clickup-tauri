/** Sliding-window rate limiter: resolves immediately under `limit` calls per `windowMs`, otherwise waits for the oldest call to age out. */
export function makeThrottle(limit: number, windowMs: number) {
  const stamps: number[] = [];
  return async function throttle(): Promise<void> {
    const now = Date.now();
    while (stamps.length && stamps[0] <= now - windowMs) stamps.shift();
    if (stamps.length >= limit) {
      await new Promise((r) => setTimeout(r, stamps[0] + windowMs - now + 5));
      return throttle();
    }
    stamps.push(now);
  };
}
