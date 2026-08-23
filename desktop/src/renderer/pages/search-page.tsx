import {
  ArrowUpDown,
  BarChart3,
  Calendar,
  Mic,
  Monitor,
  Search,
  SunSnow,
  Tags,
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
import {
  SEARCH_FILTER_ANY_VALUE,
  defaultSearchFilterValues,
  type SearchFilterDefinition,
  type SearchFilterValues,
} from "@/shared/search-filters";
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

function showAvailabilityBadges(show: ShowSearchResult): React.ReactNode {
  const subCount = show.availableEpisodes?.sub ?? 0;
  const dubCount = show.availableEpisodes?.dub ?? 0;
  if (subCount === 0 && dubCount === 0) return undefined;

  return (
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
        {subCount}
      </Badge>
      <Badge variant="glass" className="text-white flex items-center gap-1">
        <Mic className="h-[10px] w-[10px] shrink-0" />
        {dubCount}
      </Badge>
    </>
  );
}

const GRID_SKELETON_COUNT = 18;

function SearchGridSkeleton() {
  return (
    <div className={SHOW_GRID_CLASS} aria-busy="true" aria-label="Loading search results">
      {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
        <div key={i} className="w-full min-w-0">
          <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

function filterIcon(key: string): React.ReactNode {
  const className = "h-4 w-4 shrink-0 opacity-70";
  switch (key) {
    case "type":
      return <Monitor className={className} aria-hidden />;
    case "status":
      return <BarChart3 className={className} aria-hidden />;
    case "season":
      return <SunSnow className={className} aria-hidden />;
    case "year":
      return <Calendar className={className} aria-hidden />;
    case "genres":
      return <Tags className={className} aria-hidden />;
    case "sort":
      return <ArrowUpDown className={className} aria-hidden />;
    default:
      return null;
  }
}

function filterTriggerLabel(
  def: SearchFilterDefinition,
  value: string | undefined
): string {
  const selected = value ?? def.defaultValue ?? SEARCH_FILTER_ANY_VALUE;
  if (!def.required && selected === SEARCH_FILTER_ANY_VALUE) {
    return def.allLabel;
  }
  return def.options.find((o) => o.value === selected)?.label ?? def.allLabel;
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

  const [filterDefs, setFilterDefs] = useState<SearchFilterDefinition[]>([]);
  const [filters, setFilters] = useState<SearchFilterValues>({});
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.streamProvider
      .getSearchFilters()
      .then((defs) => {
        if (cancelled) return;
        setFilterDefs(defs);
        setFilters(defaultSearchFilterValues(defs));
      })
      .catch(() => {
        if (cancelled) return;
        setFilterDefs([]);
        setFilters({});
      })
      .finally(() => {
        if (!cancelled) setFiltersReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { results, loading, error } = useWelcomeSearch(debouncedQuery, {
    // Wait for provider filter defs so AniDB doesn't double-fetch unfiltered then filtered.
    loadLatestWhenEmpty: filtersReady,
    filters: filtersReady ? filters : undefined,
  });

  const setFilterValue = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

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
    setFilters(defaultSearchFilterValues(filterDefs));
  }, [filterDefs]);

  const hasFilters = filterDefs.length > 0;

  const filterGridClass = useMemo(() => {
    const count = filterDefs.length;
    if (count <= 2) return "grid grid-cols-2 gap-2";
    if (count <= 3) return "grid grid-cols-2 sm:grid-cols-3 gap-2";
    if (count <= 4) return "grid grid-cols-2 sm:grid-cols-4 gap-2";
    return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2";
  }, [filterDefs.length]);

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

          {hasFilters && (
            <div className="flex flex-wrap gap-2 items-center xl:flex-nowrap">
              <Button
                type="button"
                variant="outline"
                aria-label="Clear all filters"
                onClick={clearAll}
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          )}
        </div>

        {hasFilters && (
          <div className={filterGridClass}>
            {filterDefs.map((def) => {
              const value = filters[def.key] ?? def.defaultValue ?? SEARCH_FILTER_ANY_VALUE;
              return (
                <Select
                  key={def.key}
                  value={value}
                  onValueChange={(v) => setFilterValue(def.key, v)}
                >
                  <SelectTrigger className={SEARCH_SELECT_TRIGGER_CLASS}>
                    {filterIcon(def.key)}
                    <SelectValue placeholder={def.allLabel}>
                      {filterTriggerLabel(def, value)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className={SEARCH_SELECT_CONTENT_CLASS}>
                    {!def.required && (
                      <SelectItem value={SEARCH_FILTER_ANY_VALUE}>{def.allLabel}</SelectItem>
                    )}
                    {def.options
                      .filter((opt) => def.required || opt.value !== SEARCH_FILTER_ANY_VALUE)
                      .map((opt) => (
                        <SelectItem key={`${def.key}:${opt.value}`} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {loading && !error && <SearchGridSkeleton />}

      {!loading && !error && results.length > 0 && (
        <ShowGrid
          items={results.map((show) => ({
            id: `${show.id}-${show.providerId}`,
            rating: show.score,
            coverUrl: show.thumbnail,
            title: displayTitle(show),
            subtitle: `Episode ${show.availableEpisodes?.sub ?? 0} · ${getAvailabilityLabel(show)}`,
            badges: showAvailabilityBadges(show),
            onClick: () => openShow(show),
          }))}
        />
      )}

      {!loading && !error && results.length === 0 && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}
    </div>
  );
}
