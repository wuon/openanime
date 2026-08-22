import { ipcMain } from "electron";

import {
  PRIVACY_INCOGNITO_GET_CHANNEL,
  PRIVACY_INCOGNITO_SET_CHANNEL,
} from "./privacy-channels";
import { isIncognitoEnabled, setIncognitoEnabled } from "./privacy-store";

export function addPrivacyListeners() {
  ipcMain.handle(PRIVACY_INCOGNITO_GET_CHANNEL, () => isIncognitoEnabled());
  ipcMain.handle(PRIVACY_INCOGNITO_SET_CHANNEL, (_event, enabled: unknown) =>
    setIncognitoEnabled(Boolean(enabled))
  );
}
