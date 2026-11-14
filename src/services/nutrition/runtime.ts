import { db } from "../../features/simple/store";
import { sqlDriver } from "../../infrastructure/food/SQLiteChinaFoodRepository";
import { createNutritionStore } from "./store";
import { createNutritionAdapter } from "./adapter";
import { nutritionPhotos } from "./photos";
export const productionNutrition = createNutritionAdapter(async () =>
  createNutritionStore(sqlDriver(await db()), nutritionPhotos),
);
