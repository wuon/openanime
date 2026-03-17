/**
 * Resolve stream URL by running ani-cli in debug mode (prints URL instead of playing).
 * Uses the same logic as pystardust/ani-cli for consistency.
 */
import { spawn } from "child_process";
import { app } from "electron";
import path from "path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

const DEFAULT_REFERER = "https://allmanga.to";

function getAniCliPath(): string {
  if (process.env.ANI_CLI_PATH) return process.env.ANI_CLI_PATH;

  // In packaged builds, ani-cli is shipped as an external resource next to app.asar
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "ani-cli");
  }

  // In development, assume ani-cli is in ./bin
  return path.resolve(process.cwd(), "bin", "ani-cli");
}

export interface StreamUrlResult {
  url: string;
  referer: string;
}

const ffmpegPath = (ffmpeg as unknown as { path: string }).path.replace(
  "app.asar",
  "app.asar.unpacked"
);

/**
 * Build env for the ani-cli child so it behaves like when run from a real terminal.
 * - PATH: when the app is launched from Dock/Finder, PATH can be minimal and miss
 *   Homebrew paths (/opt/homebrew/bin, /usr/local/bin) where curl/fzf live.
 * - ANI_CLI_EXTERNAL_MENU=0: script does [ -t 0 ] || use_external_menu=1, so without
 *   a TTY it tries to use rofi; we pass all args so no menu is needed — force fzf path.
 * - TERM: some tools expect TERM to be set.
 */
function buildAniCliEnv(quality: string): NodeJS.ProcessEnv {
  const base = { ...process.env };
  const extraPathEntries: string[] = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    process.platform === "win32" && process.env.ProgramFiles
      ? `${process.env.ProgramFiles}\\curl\\bin`
      : "",
    // Directory of the bundled ffmpeg binary from @ffmpeg-installer/ffmpeg
    path.dirname(ffmpegPath),
  ];

  // When running unpackaged, prefer the local ./bin directory where ani-cli
  // and ffmpeg are bundled.
  if (!app.isPackaged) {
    extraPathEntries.push(path.resolve(process.cwd(), "bin"));
  }

  // When running from a packaged build, extra resources (ani-cli, ffmpeg)
  // are placed directly in `process.resourcesPath`.
  if (app.isPackaged) {
    extraPathEntries.push(process.resourcesPath);
  }

  const extraPath = extraPathEntries.filter(Boolean).join(path.delimiter);

  return {
    ...base,
    PATH: base.PATH ? `${base.PATH}${path.delimiter}${extraPath}` : extraPath,
    TERM: base.TERM ?? "xterm-256color",
    ANI_CLI_PLAYER: "debug",
    ANI_CLI_QUALITY: quality,
    ANI_CLI_EXTERNAL_MENU: "0",
  };
}

/**
 * Run ani-cli in debug mode with the given quality env. Returns the stream URL or null.
 */
function runAniCliForStream(
  aniCliPath: string,
  args: string[],
  quality: string
): Promise<StreamUrlResult | null> {
  return new Promise((resolve) => {
    const child = spawn("sh", [aniCliPath, ...args], {
      env: buildAniCliEnv(quality),
      cwd: path.dirname(aniCliPath),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += (chunk as Buffer).toString();
    });
    child.stderr?.on("data", () => {
      /* empty */
    });

    child.on("error", () => resolve(null));

    child.on("close", () => {
      const lines = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const urlLine = lines.find(
        (line) => line.startsWith("http://") || line.startsWith("https://")
      );
      if (urlLine) {
        resolve({ url: urlLine, referer: DEFAULT_REFERER });
      } else {
        resolve(null);
      }
    });
  });
}

export async function getStreamUrl(
  animeName: string,
  episode: string,
  mode: "sub" | "dub" = "sub",
  selectIndex?: number
): Promise<StreamUrlResult> {
  const aniCliPath = getAniCliPath();
  const index = selectIndex && selectIndex > 0 ? selectIndex : 1;
  const args = [animeName.trim(), "-S", String(index), "-e", episode];
  if (mode === "dub") args.push("--dub");

  // Try "best" first (highest available). For older anime where max is 720p, the
  // first link in the list can sometimes be invalid (e.g. 1080p placeholder).
  // Then try "720" so we get a known-good 720p link when it exists.
  for (const quality of ["best", "720", "480"]) {
    const result = await runAniCliForStream(aniCliPath, args, quality);
    if (result) return result;
  }

  throw new Error(
    "ani-cli did not return a stream URL. Tried qualities: best, 720, 480. The episode may have no valid sources."
  );
}
