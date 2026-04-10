import { MoreHorizontal } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/renderer/components/ui/dropdown-menu";
import { cn } from "@/renderer/lib/utils";
import type { HistoryEntry } from "@/shared/types";

const COMPLETED_FRACTION = 0.95;

/** Same rules as `EpisodeCard`: `M:SS`, or `H:MM:SS` when an hour or longer. */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

function progressBadgeLabel(entry: HistoryEntry): string {
  const total = entry.totalDurationMs;
  const cur = entry.currentDurationMs;
  if (total > 0) {
    return `${formatDurationMs(cur)} / ${formatDurationMs(total)}`;
  }
  if (cur > 0) {
    return formatDurationMs(cur);
  }
  return "—";
}

function isWatchCompleted(entry: HistoryEntry): boolean {
  const total = entry.totalDurationMs;
  return total > 0 && entry.currentDurationMs >= total * COMPLETED_FRACTION;
}

function animeTitle(entry: HistoryEntry): string {
  const t = entry.episode.title;
  return t.english ?? t.romanji ?? t.native ?? entry.episode.id;
}

function formatWatchedAt(ts: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(ts);
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void window.recentlyWatched
      .read()
      .then((list) => {
        const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp);
        setEntries(sorted);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEntry = useCallback(
    (entry: HistoryEntry) => {
      navigate("/watch", {
        state: {
          episode: entry.episode,
          ...(entry.currentDurationMs > 0 ? { resumeFromMs: entry.currentDurationMs } : {}),
        },
      });
    },
    [navigate]
  );

  const goToShow = useCallback(
    (entry: HistoryEntry) => {
      navigate(
        `/show/${encodeURIComponent(entry.episode.id)}?providerId=${encodeURIComponent(entry.episode.providerId)}`
      );
    },
    [navigate]
  );

  const removeEntry = useCallback(async (id: string) => {
    setRemovingId(id);
    try {
      await window.recentlyWatched.remove(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setRemovingId(null);
    }
  }, []);

  const empty = !loading && entries.length === 0;

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
      <h1 className="text-4xl font-semibold tracking-tight">History</h1>
      <p className="text-sm text-muted-foreground -mt-2">
        Everything you have opened in the player on this device, newest first.
      </p>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : empty ? (
        <p className="text-muted-foreground text-sm">No watch history yet.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm caption-bottom">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium w-0" scope="col">
                    <span className="sr-only">Cover</span>
                  </th>
                  <th className="px-4 py-3 font-medium min-w-[10rem]" scope="col">
                    Show
                  </th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                    Episode
                  </th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                    Progress
                  </th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                    Date watched
                  </th>
                  <th
                    className="px-4 py-3 font-medium w-0 text-right"
                    scope="col"
                    aria-label="Actions"
                  >
                    {/* actions */}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const completed = isWatchCompleted(entry);
                  const busy = removingId === entry.id;
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => openEntry(entry)}
                    >
                      <td className="px-4 py-3 w-0 align-middle">
                        <div
                          className={cn(
                            "shrink-0 aspect-video w-[4.5rem] rounded-md overflow-hidden bg-muted border border-border",
                            "shadow-sm"
                          )}
                          aria-hidden
                        >
                          {entry.episode.thumbnail ? (
                            <img
                              src={entry.episode.thumbnail}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium min-w-0 max-w-[min(28rem,50vw)] align-middle">
                        <span className="line-clamp-1">{animeTitle(entry)}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-middle">
                        {entry.episode.index}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap align-middle">
                        <Badge
                          variant={completed ? "secondary" : "outline"}
                          className="font-normal tabular-nums"
                        >
                          {progressBadgeLabel(entry)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap align-middle">
                        {formatWatchedAt(entry.timestamp)}
                      </td>
                      <td
                        className="px-4 py-3 text-right align-middle"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground"
                              disabled={busy}
                              aria-label={`Actions for ${animeTitle(entry)}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={4} className="min-w-[12rem]">
                            <DropdownMenuItem
                              onSelect={() => {
                                openEntry(entry);
                              }}
                            >
                              Go to episode
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                goToShow(entry);
                              }}
                            >
                              Go to show
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                              disabled={busy}
                              onSelect={() => {
                                void removeEntry(entry.id);
                              }}
                            >
                              Remove from history
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
