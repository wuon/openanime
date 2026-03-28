import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

import {
  RECENTLY_WATCHED_CLEAR_CHANNEL,
  RECENTLY_WATCHED_READ_CHANNEL,
  RECENTLY_WATCHED_RECORD_CHANNEL,
} from "./recently-watched-channels";

export interface RecentlyWatchedEntry {
  animeId: string;
  episode: string;
  mode: "sub" | "dub";
  /** Present on rows written after timestamp support; ms since epoch. */
  timestamp?: number;
}

const FILENAME = "recently-watched.txt";
const SEPARATOR = "\t";
/** Max rows shown in the recently watched section (newest unique series first). */
const READ_UNIQUE_LIMIT = 12;

function getFilePath(): string {
  return path.join(app.getPath("userData"), FILENAME);
}

function parseLine(line: string): RecentlyWatchedEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(SEPARATOR);
  if (parts.length < 3) return null;
  const last = parts[parts.length - 1];
  const tsNum = Number(last);
  const hasTimestamp =
    parts.length >= 4 && Number.isFinite(tsNum) && /^\d+$/.test(last.trim());
  if (hasTimestamp) {
    const modeRaw = parts[parts.length - 2];
    const mode = modeRaw === "dub" ? "dub" : "sub";
    const animeId = parts[0];
    const episode = parts.slice(1, -2).join(SEPARATOR);
    return { animeId, episode, mode, timestamp: tsNum };
  }
  const [animeId, episode, modeRaw] = parts;
  const mode = modeRaw === "dub" ? "dub" : "sub";
  return { animeId, episode, mode };
}

async function readEntriesOldestFirst(filePath: string): Promise<RecentlyWatchedEntry[]> {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const entries: RecentlyWatchedEntry[] = [];
    for (const line of lines) {
      const entry = parseLine(line);
      if (entry) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

function sortKeyMs(e: RecentlyWatchedEntry, lineIndex: number): number {
  if (e.timestamp !== undefined) return e.timestamp;
  // Legacy rows: preserve append order (newer line = larger index).
  return lineIndex;
}

export function addRecentlyWatchedListeners() {
  ipcMain.handle(
    RECENTLY_WATCHED_RECORD_CHANNEL,
    async (_event, animeId: string, episode: string, mode: "sub" | "dub") => {
      if (typeof animeId !== "string" || typeof episode !== "string") return;
      const filePath = getFilePath();
      const ts = Date.now();
      const line = `${animeId}${SEPARATOR}${episode}${SEPARATOR}${mode ?? "sub"}${SEPARATOR}${ts}\n`;
      try {
        await fs.promises.appendFile(filePath, line);
      } catch {
        // Ignore write errors (e.g. disk full)
      }
    }
  );

  ipcMain.handle(RECENTLY_WATCHED_READ_CHANNEL, async (): Promise<RecentlyWatchedEntry[]> => {
    const filePath = getFilePath();
    const entries = await readEntriesOldestFirst(filePath);
    const indexed = entries.map((e, lineIndex) => ({ e, lineIndex }));
    indexed.sort((a, b) => sortKeyMs(b.e, b.lineIndex) - sortKeyMs(a.e, a.lineIndex));
    const seen = new Set<string>();
    const newestUniqueFirst: RecentlyWatchedEntry[] = [];
    for (const { e } of indexed) {
      if (seen.has(e.animeId)) continue;
      seen.add(e.animeId);
      newestUniqueFirst.push(e);
      if (newestUniqueFirst.length >= READ_UNIQUE_LIMIT) break;
    }
    return newestUniqueFirst;
  });

  ipcMain.handle(RECENTLY_WATCHED_CLEAR_CHANNEL, async (): Promise<void> => {
    const filePath = getFilePath();
    try {
      await fs.promises.writeFile(filePath, "", "utf-8");
    } catch {
      // Ignore write errors
    }
  });
}
