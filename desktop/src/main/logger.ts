import { app, shell } from "electron";
import log from "electron-log/main";
import fs from "node:fs";
import path from "node:path";

/** Keep log files for at most 30 days. */
export const LOG_RETENTION_DAYS = 30;
const LOG_RETENTION_MS = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let retentionStarted = false;
let sessionLogFileName: string | null = null;

function createSessionLogFileName(): string {
  // Filesystem-safe ISO stamp, unique per app launch.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}.log`;
}

function ensureLogsDirectory(): string {
  const logsDir = path.dirname(log.transports.file.getFile().path);
  fs.mkdirSync(logsDir, { recursive: true });
  return logsDir;
}

/**
 * If a single session log grows past maxSize, archive it with a part suffix
 * and continue writing under the same session name.
 */
function archiveOversizedSessionLog(file: { path: string }): void {
  const oldPath = file.path;
  const parsed = path.parse(oldPath);
  let part = 1;
  let target = path.join(parsed.dir, `${parsed.name}.part${part}${parsed.ext}`);
  while (fs.existsSync(target)) {
    part += 1;
    target = path.join(parsed.dir, `${parsed.name}.part${part}${parsed.ext}`);
  }
  try {
    fs.renameSync(oldPath, target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[logger] could not archive log file", message);
  }
}

export function getLogsDirectory(): string {
  return ensureLogsDirectory();
}

export function getSessionLogFileName(): string | null {
  return sessionLogFileName;
}

/** Delete log files older than {@link LOG_RETENTION_DAYS}. Keeps the active session log. */
export function cleanOldLogs(): { deleted: string[] } {
  const logsDir = ensureLogsDirectory();
  const activeLogPath = log.transports.file.getFile().path;
  const deleted: string[] = [];
  const cutoff = Date.now() - LOG_RETENTION_MS;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(logsDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("[logger] could not read logs directory for cleanup", message);
    return { deleted };
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".log")) continue;

    const filePath = path.join(logsDir, entry.name);
    if (path.resolve(filePath) === path.resolve(activeLogPath)) continue;

    try {
      const { mtimeMs } = fs.statSync(filePath);
      if (mtimeMs >= cutoff) continue;
      fs.unlinkSync(filePath);
      deleted.push(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("[logger] could not delete old log file", { filePath, message });
    }
  }

  if (deleted.length > 0) {
    log.info("[logger] cleaned old log files", {
      count: deleted.length,
      retentionDays: LOG_RETENTION_DAYS,
    });
  }

  return { deleted };
}

export async function openLogsDirectory(): Promise<void> {
  const logsDir = ensureLogsDirectory();
  const errorMessage = await shell.openPath(logsDir);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
}

function startLogRetentionCleanup(): void {
  if (retentionStarted) return;
  retentionStarted = true;

  cleanOldLogs();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }
  cleanupTimer = setInterval(() => {
    cleanOldLogs();
  }, CLEANUP_INTERVAL_MS);
  // Do not keep the process alive solely for log cleanup.
  cleanupTimer.unref?.();
}

/**
 * Configure electron-log early in the main process.
 * Each app launch gets a new session log file. Retention cleanup runs once ready.
 */
export function initLogger(): typeof log {
  sessionLogFileName = createSessionLogFileName();

  log.initialize({
    // Forward renderer console.* into the session log file for shared debugging.
    spyRendererConsole: true,
  });

  log.transports.file.level = "info";
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
  log.transports.file.fileName = sessionLogFileName;
  log.transports.file.archiveLogFn = archiveOversizedSessionLog;

  // Dev: noisy console. Production: keep console quieter; files still capture info+.
  log.transports.console.level = process.env.NODE_ENV === "production" ? "warn" : "silly";

  Object.assign(console, log.functions);

  log.errorHandler.startCatching({
    showDialog: false,
  });

  const startRetention = () => {
    startLogRetentionCleanup();
    log.info("[logger] initialized", {
      logsDir: getLogsDirectory(),
      logFile: sessionLogFileName,
      retentionDays: LOG_RETENTION_DAYS,
    });
  };

  if (app.isReady()) {
    startRetention();
  } else {
    app
      .whenReady()
      .then(startRetention)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        log.error("[logger] failed to start retention cleanup", message);
      });
  }

  return log;
}

export { log };
