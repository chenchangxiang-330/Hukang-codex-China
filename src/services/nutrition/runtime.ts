import { Directory, File, Paths } from "expo-file-system";
import { db } from "../../features/simple/store";
import { sqlDriver } from "../../infrastructure/food/SQLiteChinaFoodRepository";
import { createNutritionStore, type NutritionPhotos } from "./store";
import { createNutritionAdapter } from "./adapter";
import { safeId } from "./validation";

const directory = (id: string) =>
  new Directory(Paths.document, "nutrition-photos", safeId(id));
const photos: NutritionPhotos = {
  async copy(id, source) {
    const dir = directory(id);
    if (dir.exists) dir.delete(); // only uncommitted, uniquely owned ID; repository checked no entry exists
    dir.create({ intermediates: true });
    const target = new File(dir, "photo.source"),
      original = new File(source);
    if (!original.exists || original.size <= 0)
      throw Error("本机照片已失效，请重新选择后保存。");
    original.copy(target);
    if (!target.exists || target.size !== original.size)
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
export const productionNutrition = createNutritionAdapter(async () =>
  createNutritionStore(sqlDriver(await db()), photos),
);
