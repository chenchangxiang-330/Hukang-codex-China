import type { AiSnapshot } from "./service";
export type AiScope =
  | "meal-text"
  | "meal-image"
  | "package-image"
  | "profile"
  | "health-image";
type Context = Pick<AiSnapshot, "revision" | "endpoint" | "consent">;
/** Session-only acknowledgement of the most recent destination + sending scope. No key or payload. */
export function createDisclosure() {
  let accepted: { revision: number; endpoint: string; scope: AiScope } | null =
    null;
  let version = 0;
  let visited = "";
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => version,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    visit: (context: Context, scope: AiScope) => {
      const next = `${context.revision}|${context.endpoint}|${scope}`;
      if (visited !== next) {
        visited = next;
        accepted = null;
        version++;
        listeners.forEach((fn) => fn());
      }
    },
    allows: (context: Context, scope: AiScope) =>
      !!context.consent &&
      accepted?.revision === context.revision &&
      accepted.endpoint === context.endpoint &&
      accepted.scope === scope,
    accept: (context: Context, scope: AiScope, value: boolean) => {
      accepted = value
        ? { revision: context.revision, endpoint: context.endpoint, scope }
        : null;
      version++;
      listeners.forEach((fn) => fn());
    },
  };
}
export const aiDisclosure = createDisclosure();
