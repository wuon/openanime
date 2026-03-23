import { exposeAniCliContext } from "./ani-cli/ani-cli-context";
import { exposeAppContext } from "./app/app-context";
import { exposeExternalContext } from "./external/external-context";
import { exposeRecentlyWatchedContext } from "./recently-watched/recently-watched-context";
import { exposeThemeContext } from "./theme/theme-context";

export default function exposeContexts() {
  exposeThemeContext();
  exposeAniCliContext();
  exposeRecentlyWatchedContext();
  exposeExternalContext();
  exposeAppContext();
}
