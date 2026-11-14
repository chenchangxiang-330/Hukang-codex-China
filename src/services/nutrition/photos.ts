import { Directory, File, Paths } from "expo-file-system";
import type { NutritionPhotos } from "./store";
import { safeId } from "./validation";

const directory = (id: string) =>
  new Directory(Paths.document, "nutrition-photos", safeId(id));

export const nutritionPhotos: NutritionPhotos = {
  async copy(id, source) {
    const dir = directory(id);
    if (dir.exists) dir.delete(); // Only an uncommitted, uniquely owned ID.
    dir.create({ intermediates: true });
    const target = new File(dir, "photo.source"),
      original = new File(source);
    if (!original.exists || original.size <= 0)
      throw Error("本机照片已失效，请重新选择后保存。");
    const expectedSize = original.size;
    // Expo 57 copies asynchronously. Do not validate or commit before it settles;
    // otherwise cleanup can race the still-running copy and leave an orphan.
    await original.copy(target);
    if (!target.exists || target.size !== expectedSize)
      throw Error("照片转存不完整，本次未保存。");
    return target.uri;
  },
  async remove(id) {
    const dir = directory(id);
    if (dir.exists) dir.delete();
  },
  async exists(uri) {
    const file = new File(uri);
    return file.exists && file.size > 0;
  },
};
