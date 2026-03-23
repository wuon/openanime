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
}

const FILENAME = "recently-watched.txt";
const SEPARATOR = "\t";
const MAX_ENTRIES = 100;

function getFilePath(): string {
  return path.join(app.getPath("userData"), FILENAME);
}

function parseLine(line: string): RecentlyWatchedEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(SEPARATOR);
  if (parts.length < 2) return null;
  const [animeId, episode, modeRaw] = parts;
  const mode = modeRaw === "dub" ? "dub" : "sub";
  return { animeId, episode, mode };
}

export function addRecentlyWatchedListeners() {
  ipcMain.handle(
    RECENTLY_WATCHED_RECORD_CHANNEL,
    async (_event, animeId: string, episode: string, mode: "sub" | "dub") => {
      if (typeof animeId !== "string" || typeof episode !== "string") return;
      const filePath = getFilePath();
      const line = `${animeId}${SEPARATOR}${episode}${SEPARATOR}${mode ?? "sub"}\n`;
      try {
        await fs.promises.appendFile(filePath, line);
      } catch {
        // Ignore write errors (e.g. disk full)
      }
    }
  );

  ipcMain.handle(RECENTLY_WATCHED_READ_CHANNEL, async (): Promise<RecentlyWatchedEntry[]> => {
    const filePath = getFilePath();
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      const entries: RecentlyWatchedEntry[] = [];
      for (const line of lines) {
        const entry = parseLine(line);
        if (entry) entries.push(entry);
      }
      // Return most recent last (chronological order). Reverse so newest is first for display.
      return entries.reverse().slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
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
