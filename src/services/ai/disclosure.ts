import type { AiSnapshot } from "./service";
export const aiScopes = [
  "label-image",
  "meal-text",
  "meal-image",
  "package-image",
  "profile",
  "health-image",
] as const;
export type AiScope = (typeof aiScopes)[number];
export function validScopes(value: unknown): AiScope[] {
  return Array.isArray(value) ? aiScopes.filter((s) => value.includes(s)) : [];
}
/** Grants belong to a verified endpoint and are restored with its secure connection.
 * A connection test never grants business-data access. */
export const aiDisclosure = {
  allows: (
    context: Pick<AiSnapshot, "consent" | "authorizedScopes">,
    scope: AiScope,
  ) =>
    context.consent &&
    context.authorizedScopes.includes(scope) &&
    (scope !== "health-image" || context.authorizedScopes.includes("profile")),
};
