import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  Mic,
  Monitor,
  Search,
  SunSnow,
  Trash2,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { SHOW_GRID_CLASS, ShowGrid } from "@/renderer/components/show-grid";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { Skeleton } from "@/renderer/components/ui/skeleton";
import { useDebouncedValue } from "@/renderer/hooks/use-debounced-value";
import { useWelcomeSearch } from "@/renderer/hooks/use-welcome-search";
import { ShowSearchResult } from "@/shared/types";

import { Badge } from "../components/ui/badge";

const SEARCH_DEBOUNCE_MS = 500;

/** Left-align label in trigger; keep chevron on the right (overrides default justify-between). */
const SEARCH_SELECT_TRIGGER_CLASS =
  "w-full bg-muted/40 justify-start gap-2 [&>span:first-of-type]:min-w-0 [&>span:first-of-type]:flex-1 [&>span:first-of-type]:text-left [&>span:last-of-type]:ml-auto";

const SEARCH_SELECT_CONTENT_CLASS = "text-left";

function getAvailabilityLabel(show: ShowSearchResult): string {
  const hasSub = show.availableEpisodes?.sub ?? 0 > 0;
  const hasDub = show.availableEpisodes?.dub ?? 0 > 0;

  if (hasSub && hasDub) return "sub / dub";
  if (hasDub) return "dub";
  return "sub";
}

function displayTitle(show: ShowSearchResult): string {
  return show.title.english ?? show.title.romanji ?? show.title.native ?? show.providerId;
}

type SortMode = "popularity" | "title";

const QUARTER_ORDER = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

const GRID_SKELETON_COUNT = 18;

function SearchGridSkeleton() {
  return (
    <div className={SHOW_GRID_CLASS} aria-busy="true" aria-label="Loading search results">
      {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
        <div key={i} className="w-full min-w-0">
          <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
          <div className="mt-2 flex h-16 flex-col gap-2">
            <Skeleton className="h-3.5 w-[88%]" />
            <Skeleton className="h-3 w-[52%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function quarterSortKey(quarter: string): number {
  const i = QUARTER_ORDER.indexOf(quarter.toUpperCase() as (typeof QUARTER_ORDER)[number]);
  return i === -1 ? 999 : i;
}

function formatQuarterLabel(quarter: string): string {
  const upper = quarter.toUpperCase();
  const labels: Record<string, string> = {
    WINTER: "Winter",
    SPRING: "Spring",
    SUMMER: "Summer",
    FALL: "Fall",
  };
  return labels[upper] ?? quarter;
}

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qFromUrl = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(qFromUrl);
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    setQuery(qFromUrl);
  }, [qFromUrl]);

  const { results, loading, error } = useWelcomeSearch(debouncedQuery, {
    loadLatestWhenEmpty: true,
  });

  const [sortMode, setSortMode] = useState<SortMode>("popularity");
  const [statusFilter, setStatusFilter] = useState<string>("any");
  const [typeFilter, setTypeFilter] = useState<string>("any");
  const [yearFilter, setYearFilter] = useState<string>("any");
  const [quarterFilter, setQuarterFilter] = useState<string>("any");

  useEffect(() => {
    setStatusFilter("any");
    setTypeFilter("any");
    setYearFilter("any");
    setQuarterFilter("any");
  }, [debouncedQuery]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of results) {
      if (s.status) set.add(s.status);
    }
    return Array.from(set).sort();
  }, [results]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of results) {
      if (s.type) set.add(s.type);
    }
    return Array.from(set).sort();
  }, [results]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const s of results) {
      const y = s.season?.year;
      if (y != null && Number.isFinite(y)) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [results]);

  const quarterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of results) {
      const q = s.season?.quarter?.trim();
      if (q) set.add(q);
    }
    return Array.from(set).sort(
      (a, b) =>
        quarterSortKey(a) - quarterSortKey(b) ||
        a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [results]);

  const filteredSorted = useMemo(() => {
    let list = results.slice();
    if (yearFilter !== "any") {
      const y = Number(yearFilter);
      list = list.filter((s) => s.season?.year === y);
    }
    if (quarterFilter !== "any") {
      list = list.filter((s) => s.season?.quarter?.toUpperCase() === quarterFilter.toUpperCase());
    }
    if (statusFilter !== "any") {
      list = list.filter((s) => s.status === statusFilter);
    }
    if (typeFilter !== "any") {
      list = list.filter((s) => s.type === typeFilter);
    }
    if (sortMode === "popularity") {
      list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else {
      list.sort((a, b) =>
        displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: "base" })
      );
    }
    return list;
  }, [results, sortMode, statusFilter, typeFilter, yearFilter, quarterFilter]);

  const openShow = useCallback(
    (show: ShowSearchResult) => {
      navigate(`/show/${show.id}?providerId=${encodeURIComponent(show.providerId)}`, {
        state: { anime: show },
      });
    },
    [navigate]
  );

  const clearAll = useCallback(() => {
    setQuery("");
    setSortMode("popularity");
    setStatusFilter("any");
    setTypeFilter("any");
    setYearFilter("any");
    setQuarterFilter("any");
  }, []);

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Search</h1>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col xl:flex-row gap-2 xl:items-center xl:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center xl:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              aria-label="Clear all filters"
              onClick={clearAll}
            >
              <Trash2 className="h-4 w-4" />
              Clear all filters
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <Select value={quarterFilter} onValueChange={setQuarterFilter}>
            <SelectTrigger className={SEARCH_SELECT_TRIGGER_CLASS}>
              <SunSnow className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <SelectValue placeholder="Any season" />
            </SelectTrigger>
            <SelectContent className={SEARCH_SELECT_CONTENT_CLASS}>
              <SelectItem value="any">Any season</SelectItem>
              {quarterOptions.map((q) => (
                <SelectItem key={q} value={q}>
                  {formatQuarterLabel(q)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className={SEARCH_SELECT_TRIGGER_CLASS}>
              <Calendar className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <SelectValue placeholder="Any year" />
            </SelectTrigger>
            <SelectContent className={SEARCH_SELECT_CONTENT_CLASS}>
              <SelectItem value="any">Any year</SelectItem>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className={SEARCH_SELECT_TRIGGER_CLASS}>
              <BarChart3 className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent className={SEARCH_SELECT_CONTENT_CLASS}>
              <SelectItem value="any">Any status</SelectItem>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className={SEARCH_SELECT_TRIGGER_CLASS}>
              <Monitor className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <SelectValue placeholder="Any format" />
            </SelectTrigger>
            <SelectContent className={SEARCH_SELECT_CONTENT_CLASS}>
              <SelectItem value="any">Any format</SelectItem>
              {typeOptions.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
            <SelectTrigger className={SEARCH_SELECT_TRIGGER_CLASS}>
              <ArrowUpDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SEARCH_SELECT_CONTENT_CLASS}>
              <SelectItem value="popularity">Popularity</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {loading && !error && <SearchGridSkeleton />}

      {!loading && !error && filteredSorted.length > 0 && (
        <ShowGrid
          items={filteredSorted.map((show) => ({
            id: `${show.id}-${show.providerId}`,
            rating: show.score,
            coverUrl: show.thumbnail,
            title: displayTitle(show),
            subtitle: `Episode ${show.availableEpisodes?.sub ?? 0} · ${getAvailabilityLabel(show)}`,
            badges: (
              <>
                <Badge variant="glass" className="text-white flex items-center gap-1 align-middle">
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
                    className="lucide lucide-closed-caption-icon lucide-closed-caption h-[12px] w-[12px] shrink-0"
                  >
                    <path d="M10 9.17a3 3 0 1 0 0 5.66" />
                    <path d="M17 9.17a3 3 0 1 0 0 5.66" />
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                  </svg>
                  {show.availableEpisodes?.sub ?? 0}
                </Badge>
                <Badge variant="glass" className="text-white flex items-center gap-1">
                  <Mic className="h-[10px] w-[10px] shrink-0" />
                  {show.availableEpisodes?.dub ?? 0}
                </Badge>
              </>
            ),
            onClick: () => openShow(show),
          }))}
        />
      )}

      {!loading && !error && filteredSorted.length === 0 && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}
    </div>
  );
}
