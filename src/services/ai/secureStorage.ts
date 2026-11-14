import { requireNativeModule } from "expo-modules-core";
import type { ConnectionStorage } from "./connection";
type Native = {
  readConnection(): Promise<string | null>;
  writeConnection(value: string): Promise<void>;
  deleteConnection(): Promise<void>;
};
const native = () => requireNativeModule<Native>("HukangAi");
export const secureConnectionStorage: ConnectionStorage = {
  read: () => native().readConnection(),
  write: (value) => native().writeConnection(value),
  delete: () => native().deleteConnection(),
};
