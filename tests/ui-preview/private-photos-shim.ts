/** Browser isolation only; not proof of native original retention. */
export async function keepOriginal(uri: string, kind?: string, id?: string) {
  return kind === "health-private" ? uri + "&id=" + id : uri;
}
export function deletePrivatePhoto(_uri: string) {}
