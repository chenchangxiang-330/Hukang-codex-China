import {
  chatEndpoint,
  providerDefaults,
  providerLabels,
  supportsMealImage,
  validateAiConfiguration,
  type AiConfiguration,
} from "./config";
import { AiError, httpError, redact, type AiErrorCode } from "./errors";
import {
  parseCompletion,
  parseMeal,
  requestBody,
  type ChatTransport,
  type MealImage,
} from "./protocol";
import type {
  MealEstimate,
  MealRequest,
} from "../../features/nutrition-v2/model";

export type ConnectionResult = {
  endpoint: string;
  requestedModel: string;
  responseModel: string;
  response: string;
  testedAt: string;
};
export type AiSnapshot = {
  provider: AiConfiguration["provider"];
  baseUrl: string;
  model: string;
  endpoint: string;
  hasKey: boolean;
  revision: number;
  consent: boolean;
  supportsImage: boolean;
  operation: "connection" | "meal" | null;
  connection: ConnectionResult | null;
};
type ImageReader = (uri: string) => Promise<MealImage>;
/** Credentials stay in this session only. Public snapshots/results never contain them.
 * No storage, exports, telemetry, retries, automatic health checks, or background uploads. */
export class AiService {
  #config: AiConfiguration = {
    provider: "custom",
    ...providerDefaults.custom,
    apiKey: "",
  };
  #revision = 0;
  #listeners = new Set<() => void>();
  #active: {
    controller: AbortController;
    reason: AiErrorCode;
    reject: (e: AiError) => void;
  } | null = null;
  #transport: ChatTransport;
  #readImage: ImageReader;
  #testTimeout: number;
  #mealTimeout: number;
  #snapshot: AiSnapshot = {
    provider: "custom",
    baseUrl: "",
    model: "",
    endpoint: "",
    hasKey: false,
    revision: 0,
    consent: false,
    supportsImage: false,
    operation: null,
    connection: null,
  };
  constructor(
    transport: ChatTransport,
    readImage: ImageReader = async () => {
      throw new AiError("image_invalid");
    },
    timeouts = { connection: 30_000, meal: 60_000 },
  ) {
    this.#transport = transport;
    this.#readImage = readImage;
    this.#testTimeout = timeouts.connection;
    this.#mealTimeout = timeouts.meal;
  }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #publish(patch: Partial<AiSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const f of this.#listeners) f();
  }
  issues = () => validateAiConfiguration(this.#config);
  update = (patch: Partial<AiConfiguration>) => {
    this.cancel("changed");
    const changedDestination =
      (patch.provider !== undefined &&
        patch.provider !== this.#config.provider) ||
      (patch.baseUrl !== undefined && patch.baseUrl !== this.#config.baseUrl);
    this.#config = {
      ...this.#config,
      ...(changedDestination ? { apiKey: "" } : {}),
      ...patch,
    };
    this.#revision++;
    let endpoint = "";
    try {
      endpoint = chatEndpoint(this.#config);
    } catch {
      /* form still editable */
    }
    this.#publish({
      provider: this.#config.provider,
      baseUrl: this.#config.baseUrl,
      model: this.#config.model,
      endpoint,
      hasKey: !!this.#config.apiKey.trim(),
      revision: this.#revision,
      consent: false,
      supportsImage: supportsMealImage(this.#config),
      connection: null,
    });
  };
  clear = () => {
    this.update({ provider: "custom", baseUrl: "", model: "", apiKey: "" });
  };
  consent = (accepted: boolean) => {
    if (!accepted) this.cancel();
    this.#publish({ consent: accepted });
  };
  cancel = (reason: AiErrorCode = "cancelled") => {
    const active = this.#active;
    if (!active) return;
    active.reason = reason;
    active.controller.abort();
    active.reject(new AiError(reason));
    this.#active = null;
    this.#publish({ operation: null });
  };
  async #run<T>(
    operation: "connection" | "meal",
    signal: AbortSignal | undefined,
    action: (
      config: AiConfiguration,
      signal: AbortSignal,
      timeoutMs: number,
    ) => Promise<T>,
  ): Promise<T> {
    if (this.#active) throw new AiError("busy");
    if (Object.keys(this.issues()).length) throw new AiError("configuration");
    if (!this.#snapshot.consent) throw new AiError("consent");
    if (signal?.aborted) throw new AiError("cancelled");
    const config = {
      ...this.#config,
      baseUrl: this.#config.baseUrl.trim(),
      apiKey: this.#config.apiKey.trim(),
      model: this.#config.model.trim(),
    };
    const revision = this.#revision,
      controller = new AbortController();
    let reject!: (e: AiError) => void;
    const stopped = new Promise<never>((_, r) => {
      reject = r;
    });
    const active = { controller, reason: "cancelled" as AiErrorCode, reject };
    this.#active = active;
    const timeoutMs =
      operation === "connection" ? this.#testTimeout : this.#mealTimeout;
    const stop = () => {
      if (this.#active === active) this.cancel();
    };
    signal?.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(() => {
      if (this.#active === active) this.cancel("timeout");
    }, timeoutMs);
    this.#publish({
      operation,
      ...(operation === "connection" ? { connection: null } : {}),
    });
    try {
      const result = await Promise.race([
        action(config, controller.signal, timeoutMs),
        stopped,
      ]);
      if (revision !== this.#revision) throw new AiError("changed");
      if (controller.signal.aborted) throw new AiError(active.reason);
      return result;
    } catch (error) {
      if (revision !== this.#revision) throw new AiError("changed");
      if (controller.signal.aborted) throw new AiError(active.reason);
      throw error instanceof AiError ? error : new AiError("network");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      // A cancelled slow response must not reset a newer request's loading state.
      if (this.#active === active) {
        this.#active = null;
        this.#publish({ operation: null });
      }
    }
  }
  async #completion(
    config: AiConfiguration,
    text: string,
    meal: boolean,
    signal: AbortSignal,
    timeoutMs: number,
    image?: MealImage,
  ) {
    if (signal.aborted) throw new AiError("cancelled");
    const endpoint = chatEndpoint(config);
    const response = await this.#transport({
      endpoint,
      apiKey: config.apiKey,
      body: JSON.stringify(requestBody(config, text, meal, image)),
      signal,
      timeoutMs,
    });
    if (signal.aborted) throw new AiError("cancelled");
    if (response.url !== endpoint) throw new AiError("redirect");
    if (response.status < 200 || response.status >= 300)
      throw httpError(response.status, response.body);
    return { ...parseCompletion(response.body, config.apiKey), endpoint };
  }
  testConnection = async (signal?: AbortSignal): Promise<ConnectionResult> => {
    const revision = this.#revision;
    const result = await this.#run(
      "connection",
      signal,
      async (config, abort, ms) => {
        const response = await this.#completion(
          config,
          "请只回复 OK。",
          false,
          abort,
          ms,
        );
        return {
          endpoint: response.endpoint,
          requestedModel: redact(config.model, config.apiKey),
          responseModel: response.model,
          response: response.text.slice(0, 160),
          testedAt: new Date().toISOString(),
        };
      },
    );
    if (revision !== this.#revision) throw new AiError("changed");
    this.#publish({ connection: result });
    return result;
  };
  estimateMeal = (
    request: MealRequest,
    signal?: AbortSignal,
  ): Promise<MealEstimate> =>
    this.#run("meal", signal, async (config, abort, ms) => {
      const includeImage = request.includeImage === true;
      if (includeImage && !supportsMealImage(config))
        throw new AiError("image_unsupported");
      if (
        (!request.description.trim() && !includeImage) ||
        request.description.length > 4000
      )
        throw new AiError("request");
      let image: MealImage | undefined;
      if (includeImage) {
        if (!request.imageUri) throw new AiError("image_invalid");
        try {
          image = await this.#readImage(request.imageUri);
        } catch {
          throw new AiError("image_invalid");
        }
        if (
          !image.base64 ||
          image.base64.length > 5_592_408 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64) ||
          !["image/jpeg", "image/png"].includes(image.mime)
        )
          throw new AiError("image_invalid");
      }
      const response = await this.#completion(
        config,
        request.description.trim() ||
          "请估算照片中这一餐，份量未知时明确说明。",
        true,
        abort,
        ms,
        image,
      );
      const source = `AI 估算 · ${providerLabels[config.provider]} · ${response.model}`;
      const result = parseMeal(
        response.text,
        source,
        request.imageUri || undefined,
      );
      return {
        ...result,
        ai: {
          endpoint: response.endpoint,
          requestedModel: redact(config.model, config.apiKey),
          responseModel: response.model,
          imageSent: includeImage,
        },
      };
    });
}
