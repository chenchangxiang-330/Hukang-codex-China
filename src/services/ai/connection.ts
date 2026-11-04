import { AiService, type ConnectionResult } from "./service";
import { validateAiConfiguration, type AiConfiguration } from "./config";
import { AiError } from "./errors";
export interface ConnectionStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  delete(): Promise<void>;
}
type State = { ready: boolean; saving: boolean; saved: boolean; error: string };
type Stored = { config: AiConfiguration; result: ConnectionResult };
/** Draft tests use their own service: no draft endpoint can inherit the active key. */
export class SavedConnection {
  #stored: Stored | null = null;
  #revision = 0;
  #pending: AiService | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  #listeners = new Set<() => void>();
  #state = { ready: false, saving: false, saved: false, error: "" };
  private active: AiService;
  private storage: ConnectionStorage;
  private create: () => AiService;
  constructor(
    active: AiService,
    storage: ConnectionStorage,
    create: () => AiService,
  ) {
    this.active = active;
    this.storage = storage;
    this.create = create;
  }
  getSnapshot = () => this.#state;
  subscribe = (fn: () => void) => {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  };
  #publish(patch: Partial<State>) {
    this.#state = { ...this.#state, ...patch };
    this.#listeners.forEach((f) => f());
  }
  #serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(fn, fn);
    this.#queue = next.catch(() => {});
    return next;
  }
  restore = () =>
    this.#serial(async () => {
      if (this.#state.ready) return;
      try {
        const raw = await this.storage.read();
        const saved = raw ? (JSON.parse(raw) as Stored | null) : null;
        if (saved) {
          if (
            !saved.config ||
            Object.keys(validateAiConfiguration(saved.config)).length ||
            !saved.result?.testedAt
          )
            throw Error();
          this.#stored = saved;
          this.active.activate(saved.config, saved.result);
        }
        this.#publish({ ready: true, saved: !!saved, error: "" });
      } catch {
        this.#publish({
          ready: true,
          saved: false,
          error: "安全连接暂时无法恢复，可重新保存连接；本机饮食仍可使用。",
        });
      }
    });
  #resolve(draft: AiConfiguration): AiConfiguration {
    return {
      ...draft,
      apiKey:
        draft.apiKey.trim() ||
        (this.#stored &&
        draft.provider === this.#stored.config.provider &&
        draft.baseUrl.trim() === this.#stored.config.baseUrl.trim()
          ? this.#stored.config.apiKey
          : ""),
    };
  }
  issues = (draft: AiConfiguration) =>
    validateAiConfiguration(this.#resolve(draft));
  save = async (draft: AiConfiguration, consent: boolean) => {
    await this.restore();
    if (this.#state.saving) throw new AiError("busy");
    draft = this.#resolve(draft);
    if (Object.keys(validateAiConfiguration(draft)).length)
      throw new AiError("configuration");
    if (!consent) throw new AiError("consent");
    const revision = ++this.#revision;
    const tester = this.create();
    this.#pending = tester;
    tester.update({ ...draft });
    tester.consent(true);
    this.#publish({ saving: true, error: "" });
    try {
      const result = await tester.testConnection();
      await this.#serial(async () => {
        if (revision !== this.#revision) throw new AiError("changed");
        const next = { config: { ...draft }, result };
        try {
          await this.storage.write(JSON.stringify(next));
        } catch {
          throw Error("连接已验证，但安全保存失败；旧连接仍保留，请重试。");
        }
        if (revision !== this.#revision) {
          // Cancellation during atomic write restores the prior record before
          // any queued delete/save. It never activates an unapproved version.
          if (this.#stored)
            await this.storage.write(JSON.stringify(this.#stored));
          else await this.storage.delete();
          throw new AiError("changed");
        }
        this.#stored = next;
        this.active.activate(next.config, result);
        this.#publish({ saved: true });
      });
      return result;
    } finally {
      if (this.#pending === tester) this.#pending = null;
      this.#publish({ saving: false });
    }
  };
  cancel = () => {
    ++this.#revision;
    this.#pending?.cancel();
  };
  delete = async () => {
    this.cancel();
    this.active.clear();
    // A failed device deletion must not leave an in-memory credential that
    // a later blank-key draft can silently reuse. Disk failure is reported.
    this.#stored = null;
    this.#publish({ saved: false });
    await this.#serial(async () => {
      try {
        await this.storage.delete();
        this.#stored = null;
        this.#publish({ saved: false, error: "" });
      } catch {
        this.#publish({
          error: "安全存储删除失败，当前会话已停用；请重试删除。",
        });
        throw Error("连接删除未完成，请重试。");
      }
    });
  };
}
