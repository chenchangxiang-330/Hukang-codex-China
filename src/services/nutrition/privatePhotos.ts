import { Directory, File, Paths } from "expo-file-system";
import { safeId } from "./validation";
/** Separate directories; health originals are never referenced by foods or ordinary exports. */
export async function keepOriginal(
  source: string,
  kind: "meal-drafts" | "health-private",
  id: string,
) {
  const dir = new Directory(Paths.document, kind, safeId(id));
  dir.create({ intermediates: true, idempotent: true });
  const from = new File(source),
    to = new File(dir, "original.source");
  if (!from.exists || from.size <= 0) throw Error("原图无法读取，请重新选择。");
  await from.copy(to);
  if (!to.exists || to.size !== from.size) throw Error("原图保存不完整。");
  return to.uri;
}
export function deletePrivatePhoto(uri: string) {
  const root = new Directory(Paths.document).uri;
  if (
    !uri.startsWith(root + "health-private/") &&
    !uri.startsWith(root + "meal-drafts/")
  )
    throw Error("无法删除此路径。");
  const file = new File(uri);
  if (file.exists) file.delete();
}
