import Store from "electron-store";

interface AppStoreSchema {
  "anilist.accessToken"?: string;
}

type StoreApi = {
  get: (key: string) => unknown;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
};

export const appStore: StoreApi = new Store<AppStoreSchema>({
  name: "openanime",
}) as unknown as StoreApi;
