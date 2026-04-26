import { MoreHorizontal } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@/renderer/components/ui/skeleton";
import { cn } from "@/renderer/lib/utils";
import type { HistoryEntry } from "@/shared/types";

const HISTORY_SKELETON_ROWS = 8;

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

/** Local Monday 00:00 for the calendar week containing `nowMs`. */
function getLocalWeekStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysSinceMonday = (day + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

interface HistoryStats {
  episodeCount: number;
  timeThisWeekMs: number;
  totalTimeMs: number;
}

function computeHistoryStats(entries: HistoryEntry[]): HistoryStats {
  const weekStart = getLocalWeekStartMs(Date.now());
  let timeThisWeekMs = 0;
  let totalTimeMs = 0;
  for (const e of entries) {
    const cur = Number.isFinite(e.currentDurationMs) ? Math.max(0, e.currentDurationMs) : 0;
    totalTimeMs += cur;
    if (e.timestamp >= weekStart) {
      timeThisWeekMs += cur;
    }
  }
  return {
    episodeCount: entries.length,
    timeThisWeekMs,
    totalTimeMs,
  };
}

/** Compact duration for stat cards (e.g. `3h 12m`, `45m`, `<1m`). */
function formatStatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return "<1m";
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) {
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${m}m`;
}

function animeTitle(entry: HistoryEntry): string {
  const t = entry.episode.title;
  return t.english ?? t.romanji ?? t.native ?? entry.episode.id;
}

function HistoryStatsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading statistics">
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border p-4 flex flex-col gap-2 min-h-[5.5rem]"
        >
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

function HistoryStatsRow({ stats }: { stats: HistoryStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border p-4 flex flex-col gap-1 min-w-0">
        <p className="text-sm text-muted-foreground">Episodes watched</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{stats.episodeCount}</p>
      </div>
      <div className="rounded-xl border border-border p-4 flex flex-col gap-1 min-w-0">
        <p className="text-sm text-muted-foreground">Total time this week</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatStatDurationMs(stats.timeThisWeekMs)}
        </p>
      </div>
      <div className="rounded-xl border border-border p-4 flex flex-col gap-1 min-w-0">
        <p className="text-sm text-muted-foreground">Total time</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {formatStatDurationMs(stats.totalTimeMs)}
        </p>
      </div>
    </div>
  );
}

function HistoryTableSkeleton() {
  return (
    <div
      className="rounded-xl border border-border overflow-hidden"
      aria-busy="true"
      aria-label="Loading watch history"
    >
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
              />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: HISTORY_SKELETON_ROWS }, (_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-3 w-0 align-middle">
                  <Skeleton className="aspect-video w-[4.5rem] rounded-md shrink-0" />
                </td>
                <td className="px-4 py-3 align-middle min-w-0 max-w-[min(28rem,50vw)]">
                  <Skeleton
                    className={cn(
                      "h-4 max-w-full",
                      i % 3 === 0 ? "w-56" : i % 3 === 1 ? "w-44" : "w-52"
                    )}
                  />
                </td>
                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  <Skeleton className="h-4 w-10" />
                </td>
                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  <Skeleton className="h-6 w-[5.5rem] rounded-full" />
                </td>
                <td className="px-4 py-3 align-middle whitespace-nowrap">
                  <Skeleton className="h-4 w-36" />
                </td>
                <td className="px-4 py-3 text-right align-middle">
                  <Skeleton className="inline-flex h-8 w-8 rounded-md" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
          providerOverride: entry.provider,
          ...(entry.currentDurationMs > 0 ? { resumeFromMs: entry.currentDurationMs } : {}),
        },
      });
    },
    [navigate]
  );

  const goToShow = useCallback(
    async (entry: HistoryEntry) => {
      try {
        await window.streamProvider.setActiveProvider(entry.provider);
      } catch {
        // best-effort; show route also carries providerId
      }
      navigate(`/show/${encodeURIComponent(entry.episode.id)}?providerId=${encodeURIComponent(entry.episode.providerId)}`);
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

  const stats = useMemo(() => computeHistoryStats(entries), [entries]);

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
      <h1 className="text-4xl font-semibold tracking-tight">History</h1>

      {loading ? <HistoryStatsSkeleton /> : <HistoryStatsRow stats={stats} />}

      {loading ? (
        <HistoryTableSkeleton />
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
                      onClick={() => {
                        void openEntry(entry);
                      }}
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
                                void openEntry(entry);
                              }}
                            >
                              Go to episode
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                void goToShow(entry);
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
