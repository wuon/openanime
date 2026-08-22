import { appStore } from "@/main/store";

export function isIncognitoEnabled(): boolean {
  return appStore.get("privacy.incognito") === true;
}

export function setIncognitoEnabled(enabled: boolean): boolean {
  const next = Boolean(enabled);
  appStore.set("privacy.incognito", next);
  return next;
}
