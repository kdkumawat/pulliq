/**
 * Global concurrency control for heavy external processes (yt-dlp, ffmpeg).
 *
 * The app runs on small instances (512 MB - 2 GB RAM). Without limits, a few
 * concurrent yt-dlp/ffmpeg subprocesses can exhaust memory and crash the
 * server. Every process-spawning helper in the codebase acquires this
 * semaphore before spawning, so at most PROCESS_LIMIT external processes run
 * at any moment. Extra requests queue (with a bounded wait) instead of
 * crashing the box.
 */

export class Semaphore {
  private active = 0;
  private readonly queue: Array<{ step: () => void; timer: NodeJS.Timeout }> = [];

  constructor(private readonly max: number) {}

  /** Number of waiters currently queued. */
  get pending(): number {
    return this.queue.length;
  }

  /** Number of slots currently in use. */
  get running(): number {
    return this.active;
  }

  /**
   * Acquire a slot, waiting up to `timeoutMs` for one to free up.
   * Throws a busy error if the wait times out.
   */
  async acquire(timeoutMs: number): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.queue.findIndex((q) => q.step === step);
        if (i >= 0) this.queue.splice(i, 1);
        reject(new Error("Server is busy, please try again in a moment."));
      }, timeoutMs);
      const step = () => {
        clearTimeout(timer);
        resolve();
      };
      this.queue.push({ step, timer });
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next.step();
    }
  }

  /** Run `fn` while holding a slot. */
  async run<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Maximum number of concurrent external media processes.
 * 2 keeps a 1 GB instance healthy while still feeling responsive.
 * Override with PULLIQ_PROCESS_LIMIT.
 */
const PROCESS_LIMIT = Math.max(
  1,
  Math.min(4, Number(process.env.PULLIQ_PROCESS_LIMIT) || 2)
);

/** Gate for ALL heavy subprocesses (yt-dlp, ffmpeg). */
export const PROCESS_SEM = new Semaphore(PROCESS_LIMIT);

/** Snapshot for the /api/health endpoint. */
export function processQueueStats(): { running: number; pending: number; limit: number } {
  return {
    running: PROCESS_SEM.running,
    pending: PROCESS_SEM.pending,
    limit: PROCESS_LIMIT,
  };
}
