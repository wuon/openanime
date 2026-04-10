import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";

import type { HistoryEntry } from "@/shared/types";

import {
  RECENTLY_WATCHED_CLEAR_CHANNEL,
  RECENTLY_WATCHED_READ_CHANNEL,
  RECENTLY_WATCHED_REMOVE_CHANNEL,
  RECENTLY_WATCHED_UPSERT_CHANNEL,
} from "./recently-watched-channels";

const FILENAME = "watch-history.json";

function getFilePath(): string {
  return path.join(app.getPath("userData"), FILENAME);
}

function isValidHistoryEntry(x: unknown): x is HistoryEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== "string") return false;
  if (typeof e.provider !== "string") return false;
  if (typeof e.currentDurationMs !== "number" || !Number.isFinite(e.currentDurationMs))
    return false;
  if (typeof e.totalDurationMs !== "number" || !Number.isFinite(e.totalDurationMs)) return false;
  if (typeof e.timestamp !== "number" || !Number.isFinite(e.timestamp)) return false;
  const ep = e.episode;
  if (!ep || typeof ep !== "object") return false;
  const epObj = ep as Record<string, unknown>;
  if (typeof epObj.id !== "string" || typeof epObj.providerId !== "string") return false;
  if (typeof epObj.index !== "number" || !Number.isFinite(epObj.index)) return false;
  if (epObj.mode !== "sub" && epObj.mode !== "dub") return false;
  if (epObj.thumbnail !== null && typeof epObj.thumbnail !== "string") return false;
  const title = epObj.title;
  if (!title || typeof title !== "object") return false;
  return true;
}

async function readAllEntries(filePath: string): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidHistoryEntry);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "ENOENT") return [];
    return [];
  }
}

async function writeAllEntries(filePath: string, entries: HistoryEntry[]): Promise<void> {
  await fs.promises.writeFile(filePath, JSON.stringify(entries), "utf-8");
}

export function addRecentlyWatchedListeners() {
  ipcMain.handle(RECENTLY_WATCHED_UPSERT_CHANNEL, async (_event, entry: unknown): Promise<void> => {
    if (!isValidHistoryEntry(entry)) return;
    const filePath = getFilePath();
    try {
      const existing = await readAllEntries(filePath);
      const next = existing.filter((e) => e.id !== entry.id);
      next.push(entry);
      await writeAllEntries(filePath, next);
    } catch {
      // Ignore write errors (e.g. disk full)
    }
  });

  ipcMain.handle(RECENTLY_WATCHED_READ_CHANNEL, async (): Promise<HistoryEntry[]> => {
    const filePath = getFilePath();
    try {
      return await readAllEntries(filePath);
    } catch {
      return [];
    }
  });

  ipcMain.handle(RECENTLY_WATCHED_CLEAR_CHANNEL, async (): Promise<void> => {
    const filePath = getFilePath();
    try {
      await fs.promises.writeFile(filePath, "[]", "utf-8");
    } catch {
      // Ignore write errors
    }
  });

  ipcMain.handle(RECENTLY_WATCHED_REMOVE_CHANNEL, async (_event, id: unknown): Promise<void> => {
    if (typeof id !== "string" || id.length === 0) return;
    const filePath = getFilePath();
    try {
      const existing = await readAllEntries(filePath);
      const next = existing.filter((e) => e.id !== id);
      if (next.length === existing.length) return;
      await writeAllEntries(filePath, next);
    } catch {
      // Ignore write errors
    }
  });
}
