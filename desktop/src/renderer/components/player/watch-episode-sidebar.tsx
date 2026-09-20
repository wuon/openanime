import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Captions,
  LayoutGrid,
  List,
  Loader2,
  Mic,
  Play,
  Search,
} from "lucide-react";
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Skeleton } from "@/renderer/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/renderer/components/ui/tooltip";
import type {
  EpisodesState,
  RichEpisode,
  RichShowDetails,
} from "@/renderer/hooks/use-show-details";
import { cn } from "@/renderer/lib/utils";

type StreamMode = "sub" | "dub";
type ModeFilter = "all" | StreamMode;
type EpisodeView = "list" | "grid";

export type WatchSidebarEpisode = {
  index: number;
  title: string | null;
  thumbnail: string | null;
  hasSub: boolean;
  hasDub: boolean;
};

const cardHoverClass =
  "transition-all hover:border-primary/80 hover:shadow-[0_0_0_1px_rgba(129,140,248,0.7)] focus-visible:border-primary/80 focus-visible:shadow-[0_0_0_1px_rgba(129,140,248,0.7)]";

const currentCardClass = "border-primary/80 shadow-[0_0_0_1px_rgba(129,140,248,0.7)]";

const SCROLL_PADDING = 16;
const ROW_GAP = 8;
const LIST_ROW_SIZE = 80;
const GRID_COLS = 5;
const GRID_FALLBACK_WIDTH = 352;
const LIST_OVERSCAN = 10;
const GRID_OVERSCAN = 6;

function parseEpisodeIndex(episode: string, fallbackIndex: number): number {
  const parsed = Number(episode);
  return Number.isFinite(parsed) ? parsed : fallbackIndex + 1;
}

function indexesFromState(state: EpisodesState): number[] {
  if (state.status !== "loaded") return [];
  return state.episodes.map((episode, position) => parseEpisodeIndex(episode, position));
}

function gridTileSize(containerWidth: number): number {
  const width = containerWidth > 0 ? containerWidth : GRID_FALLBACK_WIDTH;
  const inner = Math.max(width - SCROLL_PADDING * 2, GRID_COLS * 24);
  return (inner - ROW_GAP * (GRID_COLS - 1)) / GRID_COLS;
}

export function buildWatchSidebarEpisodes(
  details: RichShowDetails | null,
  episodesByMode: Record<StreamMode, EpisodesState>,
  fallbackThumbnail?: string | null
): WatchSidebarEpisode[] {
  const subIndexes = new Set<number>();
  const dubIndexes = new Set<number>();
  const richByIndex = new Map<number, RichEpisode>();

  for (const episode of details?.episodes.sub ?? []) {
    subIndexes.add(episode.index);
    if (!richByIndex.has(episode.index)) richByIndex.set(episode.index, episode);
  }
  for (const episode of details?.episodes.dub ?? []) {
    dubIndexes.add(episode.index);
    if (!richByIndex.has(episode.index)) richByIndex.set(episode.index, episode);
  }
  for (const index of indexesFromState(episodesByMode.sub)) subIndexes.add(index);
  for (const index of indexesFromState(episodesByMode.dub)) dubIndexes.add(index);

  const allIndexes = [...new Set([...subIndexes, ...dubIndexes])].sort((a, b) => a - b);

  const cover = fallbackThumbnail ?? details?.coverImage ?? details?.bannerImage ?? null;

  return allIndexes.map((index) => {
    const rich = richByIndex.get(index);
    return {
      index,
      title: rich?.title ?? null,
      thumbnail: rich?.thumbnail ?? cover,
      hasSub: subIndexes.has(index),
      hasDub: dubIndexes.has(index),
    };
  });
}

function resolvePlayMode(
  item: WatchSidebarEpisode,
  filter: ModeFilter,
  currentMode: StreamMode
): StreamMode {
  if (filter === "sub" && item.hasSub) return "sub";
  if (filter === "dub" && item.hasDub) return "dub";
  if (currentMode === "sub" && item.hasSub) return "sub";
  if (currentMode === "dub" && item.hasDub) return "dub";
  return item.hasSub ? "sub" : "dub";
}

function ClosedCaptionIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M10 9.17a3 3 0 1 0 0 5.66" />
      <path d="M17 9.17a3 3 0 1 0 0 5.66" />
      <rect x="2" y="5" width="20" height="14" rx="2" />
    </svg>
  );
}

function ModeBadge({
  mode,
  active,
  available,
  onClick,
}: {
  mode: StreamMode;
  active: boolean;
  available: boolean;
  onClick: () => void;
}) {
  if (!available) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Play ${mode === "sub" ? "subbed" : "dubbed"}`}
    >
      <Badge
        variant={active ? "default" : "secondary"}
        className="cursor-pointer gap-1 px-2 py-0 text-[10px] uppercase tracking-wide"
      >
        {mode === "sub" ? (
          <ClosedCaptionIcon className="h-3 w-3 shrink-0" />
        ) : (
          <Mic className="h-3 w-3 shrink-0" />
        )}
        {mode}
      </Badge>
    </button>
  );
}

const EpisodeListRow = memo(function EpisodeListRow({
  item,
  isCurrent,
  currentMode,
  selecting,
  filter,
  onSelectEpisode,
}: {
  item: WatchSidebarEpisode;
  isCurrent: boolean;
  currentMode: StreamMode;
  selecting: boolean;
  filter: ModeFilter;
  onSelectEpisode: (episode: number, mode: StreamMode) => void;
}) {
  const mode = resolvePlayMode(item, filter, currentMode);
  const title = item.title?.trim() || `Episode ${item.index}`;

  return (
    <div
      className={cn(
        "flex h-full w-full items-stretch gap-3 rounded-xl border-2 border-border p-1.5",
        cardHoverClass,
        isCurrent && currentCardClass
      )}
    >
      <button
        type="button"
        onClick={() => onSelectEpisode(item.index, mode)}
        aria-current={isCurrent ? "true" : undefined}
        className="relative h-full w-auto shrink-0 aspect-video overflow-hidden rounded-lg bg-muted focus-visible:outline-none"
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {isCurrent ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
              {selecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
            </span>
          </div>
        ) : null}
      </button>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <button
          type="button"
          onClick={() => onSelectEpisode(item.index, mode)}
          className="w-full text-left focus-visible:outline-none"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            EP {String(item.index).padStart(2, "0")}
          </p>
          <p className="line-clamp-1 text-sm font-semibold" title={title}>
            {title}
          </p>
        </button>
        <div className="mt-1 flex flex-row items-center gap-1">
          <ModeBadge
            mode="sub"
            available={item.hasSub}
            active={isCurrent && currentMode === "sub"}
            onClick={() => onSelectEpisode(item.index, "sub")}
          />
          <ModeBadge
            mode="dub"
            available={item.hasDub}
            active={isCurrent && currentMode === "dub"}
            onClick={() => onSelectEpisode(item.index, "dub")}
          />
        </div>
      </div>
    </div>
  );
});

const EpisodeGridCell = memo(function EpisodeGridCell({
  item,
  isCurrent,
  filter,
  currentMode,
  onSelectEpisode,
}: {
  item: WatchSidebarEpisode;
  isCurrent: boolean;
  filter: ModeFilter;
  currentMode: StreamMode;
  onSelectEpisode: (episode: number, mode: StreamMode) => void;
}) {
  const mode = resolvePlayMode(item, filter, currentMode);
  return (
    <button
      type="button"
      onClick={() => onSelectEpisode(item.index, mode)}
      aria-current={isCurrent ? "true" : undefined}
      aria-label={`Episode ${item.index}`}
      className={cn(
        "h-full w-full rounded-lg border-2 border-border text-sm font-medium tabular-nums text-muted-foreground focus-visible:outline-none",
        cardHoverClass,
        isCurrent && cn(currentCardClass, "bg-primary text-primary-foreground")
      )}
    >
      {item.index}
    </button>
  );
});

interface WatchEpisodeSidebarProps {
  episodes: WatchSidebarEpisode[];
  currentEpisode: number;
  currentMode: StreamMode;
  loading: boolean;
  selecting: boolean;
  onSelectEpisode: (episode: number, mode: StreamMode) => void;
}

export function WatchEpisodeSidebar({
  episodes,
  currentEpisode,
  currentMode,
  loading,
  selecting,
  onSelectEpisode,
}: WatchEpisodeSidebarProps) {
  const [view, setView] = useState<EpisodeView>("list");
  const [filter, setFilter] = useState<ModeFilter>("all");
  const [query, setQuery] = useState("");
  const [scrollWidth, setScrollWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const showModeFilter = useMemo(() => {
    let hasSub = false;
    let hasDub = false;
    for (const episode of episodes) {
      if (episode.hasSub) hasSub = true;
      if (episode.hasDub) hasDub = true;
      if (hasSub && hasDub) return true;
    }
    return false;
  }, [episodes]);

  const visibleEpisodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return episodes.filter((item) => {
      if (filter === "sub" && !item.hasSub) return false;
      if (filter === "dub" && !item.hasDub) return false;
      if (!normalizedQuery) return true;
      return (
        String(item.index).includes(normalizedQuery) ||
        String(item.index).padStart(2, "0").includes(normalizedQuery) ||
        `episode ${item.index}`.includes(normalizedQuery) ||
        `ep ${String(item.index).padStart(2, "0")}`.includes(normalizedQuery) ||
        (item.title ?? "").toLowerCase().includes(normalizedQuery)
      );
    });
  }, [episodes, filter, query]);

  const gridRows = Math.ceil(visibleEpisodes.length / GRID_COLS);
  const tileSize = gridTileSize(scrollWidth);
  const isList = view === "list";
  const isGrid = view === "grid";
  const hasItems = visibleEpisodes.length > 0;

  const listVirtualizer = useVirtualizer({
    count: isList && hasItems ? visibleEpisodes.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ROW_SIZE,
    overscan: LIST_OVERSCAN,
    paddingStart: SCROLL_PADDING,
    paddingEnd: SCROLL_PADDING,
    gap: ROW_GAP,
    getItemKey: (index) => visibleEpisodes[index]?.index ?? index,
    enabled: isList && hasItems,
  });

  const gridVirtualizer = useVirtualizer({
    count: isGrid && hasItems ? gridRows : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileSize,
    overscan: GRID_OVERSCAN,
    paddingStart: SCROLL_PADDING,
    paddingEnd: SCROLL_PADDING,
    gap: ROW_GAP,
    enabled: isGrid && hasItems,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScrollWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isGrid) gridVirtualizer.measure();
  }, [isGrid, tileSize, gridVirtualizer]);

  const currentItemIndex = useMemo(
    () => visibleEpisodes.findIndex((item) => item.index === currentEpisode),
    [visibleEpisodes, currentEpisode]
  );

  useLayoutEffect(() => {
    if (currentItemIndex < 0) return;
    if (isList) {
      listVirtualizer.scrollToIndex(currentItemIndex, { align: "auto" });
      return;
    }
    gridVirtualizer.scrollToIndex(Math.floor(currentItemIndex / GRID_COLS), { align: "auto" });
  }, [currentItemIndex, isList, listVirtualizer, gridVirtualizer]);

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex h-[min(42vh,28rem)] min-h-0 w-full shrink-0 flex-col border-t border-border bg-background lg:h-full lg:w-[22rem] lg:border-l lg:border-t-0">
        <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Episodes</h2>
            <Badge variant="secondary" className="tabular-nums">
              {episodes.length}
            </Badge>
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={view === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setView("grid")}
                    aria-label="Grid view"
                    aria-pressed={view === "grid"}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Grid view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={view === "list" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setView("list")}
                    aria-label="List view"
                    aria-pressed={view === "list"}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>List view</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {showModeFilter ? (
            <Tabs
              value={filter}
              onValueChange={(value) => {
                if (value === "all" || value === "sub" || value === "dub") setFilter(value);
              }}
            >
              <TabsList className="grid h-9 w-full grid-cols-3">
                <TabsTrigger value="all" className="text-xs">
                  All
                </TabsTrigger>
                <TabsTrigger value="sub" className="gap-1 text-xs capitalize">
                  <Captions className="h-3.5 w-3.5" />
                  Sub
                </TabsTrigger>
                <TabsTrigger value="dub" className="gap-1 text-xs capitalize">
                  <Mic className="h-3.5 w-3.5" />
                  Dub
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search episodes..."
              className="h-9 bg-background pl-9"
            />
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {loading && episodes.length === 0 ? (
            view === "list" ? (
              <ul
                className="flex flex-col gap-2 p-4"
                aria-busy="true"
                aria-label="Loading episodes"
              >
                {Array.from({ length: 8 }, (_, index) => (
                  <li key={index}>
                    <Skeleton className="h-20 w-full rounded-xl" />
                  </li>
                ))}
              </ul>
            ) : (
              <div
                className="grid grid-cols-5 gap-2 p-4"
                aria-busy="true"
                aria-label="Loading episodes"
              >
                {Array.from({ length: 15 }, (_, index) => (
                  <Skeleton key={index} className="aspect-square rounded-lg" />
                ))}
              </div>
            )
          ) : visibleEpisodes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {episodes.length === 0 ? "No episodes available." : "No matching episodes."}
            </p>
          ) : isGrid ? (
            <div
              className="relative w-full"
              style={{ height: `${gridVirtualizer.getTotalSize()}px` }}
            >
              {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                const start = virtualRow.index * GRID_COLS;
                const rowItems = visibleEpisodes.slice(start, start + GRID_COLS);
                return (
                  <div
                    key={virtualRow.key}
                    className="absolute left-0 w-full px-4"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="grid h-full grid-cols-5 gap-2">
                      {rowItems.map((item) => (
                        <EpisodeGridCell
                          key={item.index}
                          item={item}
                          isCurrent={item.index === currentEpisode}
                          filter={filter}
                          currentMode={currentMode}
                          onSelectEpisode={onSelectEpisode}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${listVirtualizer.getTotalSize()}px` }}
            >
              {listVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = visibleEpisodes[virtualRow.index];
                if (!item) return null;
                return (
                  <div
                    key={virtualRow.key}
                    className="absolute left-0 w-full px-4"
                    style={{
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <EpisodeListRow
                      item={item}
                      isCurrent={item.index === currentEpisode}
                      currentMode={currentMode}
                      selecting={selecting}
                      filter={filter}
                      onSelectEpisode={onSelectEpisode}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
