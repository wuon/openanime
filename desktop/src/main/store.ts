import Store from "electron-store";

interface AppStoreSchema {
  "anilist.accessToken"?: string;
  "privacy.incognito"?: boolean;
  "stream.provider"?:
    | "allanime"
    | "anidb"
    | "animepahe"
    | "animeparadise"
    | "reanime"
    | "senshi";
}

type StoreApi = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  delete: (key: string) => void;
};

export const appStore: StoreApi = new Store<AppStoreSchema>({
  name: "openanime",
}) as unknown as StoreApi;
