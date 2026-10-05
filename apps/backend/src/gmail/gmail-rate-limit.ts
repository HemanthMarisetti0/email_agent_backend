import { HttpException, HttpStatus } from "@nestjs/common";

// Gmail enforces its per-user quota over short windows (~250 units/s;
// messages.get costs 5), so fan-out fetches must be throttled per user.
const MAX_CONCURRENT_PER_USER = 4;

/**
 * Limits concurrent Gmail calls per user (keyed by access token),
 * shared across all requests that user has in flight.
 */
export class PerUserLimiter {
  private readonly queues = new Map<
    string,
    { active: number; waiting: (() => void)[] }
  >();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    let queue = this.queues.get(key);
    if (!queue) {
      queue = { active: 0, waiting: [] };
      this.queues.set(key, queue);
    }

    if (queue.active >= MAX_CONCURRENT_PER_USER) {
      await new Promise<void>((resolve) => queue.waiting.push(resolve));
    }
    queue.active++;

    try {
      return await task();
    } finally {
      queue.active--;
      const next = queue.waiting.shift();
      if (next) {
        next();
      } else if (queue.active === 0) {
        this.queues.delete(key);
      }
    }
  }
}

const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
]);

export function isGmailRateLimit(error: unknown): boolean {
  const err = error as {
    status?: number;
    errors?: { reason?: string }[];
    message?: string;
  };

  if (err?.status === 429) return true;
  if (err?.status !== 403) return false;

  return (
    err.errors?.some((e) => RATE_LIMIT_REASONS.has(e.reason ?? "")) ||
    /quota exceeded|rate limit/i.test(err.message ?? "")
  );
}

export const gmailRateLimitException = () =>
  new HttpException(
    "Gmail is rate limiting requests right now. Please wait a minute and try again.",
    HttpStatus.TOO_MANY_REQUESTS,
  );
