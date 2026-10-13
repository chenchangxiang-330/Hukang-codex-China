import type { SupportedBarcodeFormat } from '../../../domain/barcode/types';
import { normalizeBarcode } from '../../../domain/barcode/normalize';
import type {
  ChinaFoodIdentityProvider,
  FoodIdentity,
  IdentityQuery,
  IdentityResult,
  ProviderStatus,
} from '../../../application/ports/ChinaFoodIdentityProvider';

export interface ConfiguredChinaFoodProviderOptions {
  /** Compile-time/deployment configuration for a Hukang-owned HTTPS service. */
  readonly baseUrl?: string | null | undefined;
  readonly enabled?: boolean;
  readonly timeoutMs?: number;
  readonly sourceId?: string;
  readonly sourceName?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => string;
}

const LOOKUP_PATH = '/v1/food-identity/lookup';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SOURCE_ID = 'hukang-china-food-service';
const DEFAULT_SOURCE_NAME = 'Hukang 国内商品身份服务';
const formats: readonly SupportedBarcodeFormat[] = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'];

interface ErrorPayload { readonly ok?: false; readonly error?: { readonly code?: unknown; readonly message?: unknown; readonly retryAfterSeconds?: unknown } }
interface SuccessPayload {
  readonly ok: true;
  readonly data?: unknown;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function parseBaseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    // The application is not an arbitrary proxy. Only a deployment-owned HTTPS
    // origin is accepted, and paths/query strings cannot be supplied by callers.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url;
  } catch {
    return null;
  }
}

function validQuery(query: IdentityQuery): boolean {
  if (!query || typeof query.rawValue !== 'string' || typeof query.gtin !== 'string' ||
      typeof query.lookupKey !== 'string' || !formats.includes(query.format)) return false;
  const normalized = normalizeBarcode({ rawValue: query.rawValue, format: query.format, decodedAt: '1970-01-01T00:00:00.000Z' });
  return normalized.validity === 'valid' && normalized.gtin === query.gtin && normalized.lookupKey === query.lookupKey;
}

function safeStatus(code: unknown): Exclude<ProviderStatus, 'found'> | null {
  if (typeof code !== 'string') return null;
  switch (code.toUpperCase()) {
    case 'NOT_FOUND': return 'not_found';
    case 'UNSUPPORTED_FORMAT': return 'unsupported_format';
    case 'UNAUTHORIZED':
    case 'INVALID_KEY': return 'unauthorized';
    case 'RATE_LIMITED':
    case 'QUOTA_EXCEEDED': return 'rate_limited';
    case 'SERVICE_UNAVAILABLE': return 'unavailable';
    case 'IDENTITY_CONFLICT': return 'identity_conflict';
    default: return null;
  }
}

function result(status: Exclude<ProviderStatus, 'found'>, message: string, retryAfterSeconds?: number): IdentityResult {
  return retryAfterSeconds === undefined ? { status, message } : { status, message, retryAfterSeconds };
}

function parseIdentity(payload: unknown, query: IdentityQuery, sourceId: string, sourceName: string, now: () => string): FoodIdentity | null {
  const root = object(payload);
  const data = object(root?.data);
  if (!data) return null;
  const name = text(data.name);
  if (!name) return null;
  const responseLookupKey = text(data.lookupKey, 14);
  if (responseLookupKey !== null && responseLookupKey !== query.lookupKey) return null;
  const responseGtin = text(data.gtin, 13);
  if (responseGtin !== null && responseGtin !== query.gtin) return null;
  const sourceRecordId = text(data.sourceRecordId, 160);
  const sourceUpdatedAt = text(data.sourceUpdatedAt, 80);
  return {
    name,
    brand: text(data.brand),
    specification: text(data.specification),
    category: text(data.category),
    manufacturer: text(data.manufacturer),
    sourceRecordId,
    sourceId,
    sourceName,
    obtainedAt: now(),
    sourceUpdatedAt,
  };
}

/**
 * Client for the Hukang-controlled domestic service. It never contains a
 * vendor API key and never sends package images/OCR/food records. With no
 * configured endpoint it fails closed as `not_configured`.
 */
export class ConfiguredChinaFoodProvider implements ChinaFoodIdentityProvider {
  readonly kind = 'CHINA_SERVICE' as const;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly enabled: boolean;
  private readonly endpoint: string | null;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => string;
  private readonly pending = new Map<string, Promise<IdentityResult>>();

  constructor(options: ConfiguredChinaFoodProviderOptions = {}) {
    this.sourceId = options.sourceId ?? DEFAULT_SOURCE_ID;
    this.sourceName = options.sourceName ?? DEFAULT_SOURCE_NAME;
    this.endpoint = parseBaseUrl(options.baseUrl)?.toString().replace(/\/$/, '') ?? null;
    this.enabled = options.enabled ?? true;
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
      ? Math.min(Math.floor(options.timeoutMs as number), 30_000) : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  lookup(query: IdentityQuery, options: { readonly signal?: AbortSignal } = {}): Promise<IdentityResult> {
    if (!validQuery(query)) return Promise.resolve(result('invalid_request', '条码参数无效，未发送网络请求。'));
    if (!this.enabled) return Promise.resolve(result('disabled', '国内商品查询已关闭。'));
    if (!this.endpoint) return Promise.resolve(result('not_configured', '国内商品查询服务尚未配置。'));
    const key = `${query.lookupKey}:${query.format}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.fetchLookup(query, options.signal).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }

  private async fetchLookup(query: IdentityQuery, callerSignal?: AbortSignal): Promise<IdentityResult> {
    const controller = new AbortController();
    let timedOut = false;
    let cancelled = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const abort = () => { cancelled = true; controller.abort(); };
    if (callerSignal?.aborted) return result('cancelled', '商品查询已取消。');
    callerSignal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetchImpl(`${this.endpoint}${LOOKUP_PATH}`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ gtin: query.gtin, lookupKey: query.lookupKey, format: query.format }),
        signal: controller.signal,
      });
      let payload: unknown;
      try { payload = await response.json(); } catch { return result('invalid_response', '商品服务返回了无法解析的数据。'); }
      if (!response.ok) {
        const error = object(payload)?.error as Record<string, unknown> | undefined;
        const mapped = safeStatus(error?.code) ?? (response.status === 429 ? 'rate_limited' : response.status === 401 || response.status === 403 ? 'unauthorized' : response.status >= 500 ? 'unavailable' : null);
        const retry = typeof error?.retryAfterSeconds === 'number' && Number.isFinite(error.retryAfterSeconds) ? Math.max(0, Math.floor(error.retryAfterSeconds)) : undefined;
        return mapped ? result(mapped, '国内商品服务暂时无法完成查询。', retry) : result('unavailable', '国内商品服务返回了错误。');
      }
      const root = object(payload) as SuccessPayload | ErrorPayload | null;
      if (!root || root.ok !== true) {
        const error = object(root?.error);
        const mapped = safeStatus(error?.code);
        return mapped ? result(mapped, '国内商品服务未返回可用商品信息。') : result('invalid_response', '商品服务响应格式无效。');
      }
      const identity = parseIdentity(payload, query, this.sourceId, this.sourceName, this.now);
      if (!identity) {
        // A valid response with no item is distinct from malformed/partial data.
        const data = object(root.data);
        if (data && data.found === false) return result('not_found', '国内商品服务未收录此条码。');
        return result('invalid_response', '商品服务未返回完整的商品身份。');
      }
      return { status: 'found', identity };
    } catch (error) {
      if (cancelled) return result('cancelled', '商品查询已取消。');
      if (timedOut || (error instanceof Error && error.name === 'AbortError')) return result('timeout', '国内商品服务查询超时。');
      return result('offline', '无法连接国内商品服务，可继续手动建档。');
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abort);
    }
  }
}

export function createConfiguredChinaFoodProvider(options: ConfiguredChinaFoodProviderOptions = {}): ConfiguredChinaFoodProvider {
  return new ConfiguredChinaFoodProvider(options);
}
