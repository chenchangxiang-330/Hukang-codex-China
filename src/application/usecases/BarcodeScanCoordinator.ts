import type { ValidatedBarcode } from '../../domain/barcode/types';

export type BarcodeScanRejection = 'invalid' | 'busy' | 'duplicate';

export type BarcodeScanDecision =
  | {
      readonly accepted: true;
      readonly token: number;
      readonly lookupKey: string;
      /** Release the single in-flight scan task. Safe to call more than once. */
      readonly release: () => void;
    }
  | {
      readonly accepted: false;
      readonly reason: BarcodeScanRejection;
      readonly lookupKey: string | null;
    };

/**
 * Serializes camera-frame decoding work and suppresses repeated results.
 *
 * A camera adapter should call `begin` when it has a decoded result, await its
 * lookup/OCR work, and call `decision.release()` in `finally`. While that work
 * is in flight every other frame is rejected as `busy`; after completion the
 * same query key remains suppressed for `cooldownMs` milliseconds.
 */
export class BarcodeScanGate {
  private readonly cooldownMs: number;
  private readonly clock: () => number;
  private sequence = 0;
  private activeToken: number | null = null;
  private readonly recent = new Map<string, number>();

  constructor(cooldownMs = 1200, clock: () => number = () => Date.now()) {
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('条码去重时间必须是非负有限数。');
    this.cooldownMs = cooldownMs;
    this.clock = clock;
  }

  begin(barcode: ValidatedBarcode): BarcodeScanDecision {
    if (barcode.validity !== 'valid' || !barcode.lookupKey) {
      return { accepted: false, reason: 'invalid', lookupKey: barcode.lookupKey };
    }
    if (this.activeToken !== null) {
      return { accepted: false, reason: 'busy', lookupKey: barcode.lookupKey };
    }
    const now = this.clock();
    const previous = this.recent.get(barcode.lookupKey);
    if (previous !== undefined && now - previous < this.cooldownMs) {
      return { accepted: false, reason: 'duplicate', lookupKey: barcode.lookupKey };
    }
    // Keep this map bounded even when a camera scans many different products.
    for (const [key, acceptedAt] of this.recent) {
      if (now - acceptedAt >= this.cooldownMs) this.recent.delete(key);
    }
    const token = ++this.sequence;
    this.activeToken = token;
    this.recent.set(barcode.lookupKey, now);
    let released = false;
    return {
      accepted: true,
      token,
      lookupKey: barcode.lookupKey,
      release: () => {
        if (released) return;
        released = true;
        if (this.activeToken === token) this.activeToken = null;
      },
    };
  }

  /** Cancel a task when the scanner screen unmounts. */
  cancel(token?: number): void {
    if (token === undefined || this.activeToken === token) this.activeToken = null;
  }

  /** Reset recent-result suppression after an explicit user request to scan again. */
  reset(): void {
    this.activeToken = null;
    this.recent.clear();
  }
}

/**
 * Makes asynchronous local lookups latest-only. If the user scans product B
 * before product A's SQLite query resolves, A's result is returned as
 * `undefined` and cannot overwrite B's screen.
 */
export class LatestBarcodeLookup {
  private sequence = 0;

  async run<T>(lookupKey: string, task: () => Promise<T>): Promise<T | undefined> {
    if (!lookupKey) throw new Error('条码查询键不能为空。');
    const token = ++this.sequence;
    try {
      const result = await task();
      return token === this.sequence ? result : undefined;
    } catch (error) {
      // A stale request must not surface an error after the user has already
      // moved to another product. The current request still receives errors.
      if (token === this.sequence) throw error;
      return undefined;
    }
  }

  /** Invalidate every outstanding query, e.g. when leaving the scanner route. */
  cancel(): void {
    this.sequence += 1;
  }
}

