import { exposeAniCliContext } from "./ani-cli/ani-cli-context";
import { exposeExternalContext } from "./external/external-context";
import { exposeThemeContext } from "./theme/theme-context";

export default function exposeContexts() {
  exposeThemeContext();
  exposeAniCliContext();
  exposeExternalContext();
}
