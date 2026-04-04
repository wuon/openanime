import { exposeAniListContext } from "./anilist/anilist-context";
import { exposeAppContext } from "./app/app-context";
import { exposeExternalContext } from "./external/external-context";
import { exposeRecentlyWatchedContext } from "./recently-watched/recently-watched-context";
import { exposeStreamProviderContext } from "./stream-provider/stream-provider-context";
import { exposeThemeContext } from "./theme/theme-context";
import { exposeWindowControls } from "./window/window-context";

export default function exposeContexts() {
  exposeThemeContext();
  exposeStreamProviderContext();
  exposeAniListContext();
  exposeRecentlyWatchedContext();
  exposeExternalContext();
  exposeAppContext();
  exposeWindowControls();
}
