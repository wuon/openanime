/**
 * AniDB (anidb.app) browse filter definitions.
 * Easy to tweak — values mirror `/browse?…` query params.
 *
 * Example:
 * https://anidb.app/browse?q=&type=TV&status=Currently+Airing&season=summer&year=2026&genres=1&sort=order_top_airing
 */
import {
  SEARCH_FILTER_ANY_VALUE,
  type SearchFilterDefinition,
} from "@/shared/search-filters";

/** Genre ids from https://anidb.app/genres (update if the site renumbers). */
const ANIDB_GENRES: Array<{ label: string; value: string }> = [
  { label: "Action", value: "1" },
  { label: "Adventure", value: "3" },
  { label: "Avant Garde", value: "19" },
  { label: "Award Winning", value: "12" },
  { label: "Boys Love", value: "16" },
  { label: "Comedy", value: "5" },
  { label: "Drama", value: "2" },
  { label: "Ecchi", value: "13" },
  { label: "Erotica", value: "17" },
  { label: "Fantasy", value: "4" },
  { label: "Girls Love", value: "20" },
  { label: "Gourmet", value: "8" },
  { label: "Hentai", value: "15" },
  { label: "Horror", value: "21" },
  { label: "Mystery", value: "7" },
  { label: "Romance", value: "14" },
  { label: "Sci-Fi", value: "6" },
  { label: "Slice of Life", value: "9" },
  { label: "Sports", value: "11" },
  { label: "Supernatural", value: "10" },
  { label: "Suspense", value: "18" },
];

/**
 * Sort wire values — confirmed: `order_updated`, `order_top_airing`.
 * Remaining are best-effort guesses aligned with the UI labels; adjust as needed.
 */
const ANIDB_SORT: Array<{ label: string; value: string }> = [
  // Omitting `sort` → site default (Trending).
  { label: "Trending", value: SEARCH_FILTER_ANY_VALUE },
  { label: "Top Rated", value: "order_score" },
  { label: "Latest Updated", value: "order_updated" },
  { label: "Most Popular", value: "order_popular" },
  { label: "Most Favorited", value: "order_favorited" },
  { label: "Top Airing", value: "order_top_airing" },
  { label: "Title A-Z", value: "order_title" },
  { label: "Newest First", value: "order_newest" },
];

const ANIDB_TYPES = ["Movie", "Music", "ONA", "OVA", "Special", "TV"] as const;

const ANIDB_STATUSES = ["Currently Airing", "Finished Airing"] as const;

/** Season param is lowercase on the site (`season=summer`). */
const ANIDB_SEASONS: Array<{ label: string; value: string }> = [
  { label: "Fall", value: "fall" },
  { label: "Spring", value: "spring" },
  { label: "Summer", value: "summer" },
  { label: "Winter", value: "winter" },
];

const YEAR_START = 1925;

function buildYearOptions(): Array<{ label: string; value: string }> {
  const end = new Date().getFullYear() + 1;
  const years: Array<{ label: string; value: string }> = [];
  for (let y = end; y >= YEAR_START; y -= 1) {
    years.push({ label: String(y), value: String(y) });
  }
  return years;
}

export function resolveAnidbSearchFilters(): SearchFilterDefinition[] {
  return [
    {
      key: "type",
      allLabel: "All Types",
      options: ANIDB_TYPES.map((t) => ({ label: t, value: t })),
    },
    {
      key: "status",
      allLabel: "All Status",
      options: ANIDB_STATUSES.map((s) => ({ label: s, value: s })),
    },
    {
      key: "season",
      allLabel: "All Seasons",
      options: ANIDB_SEASONS,
    },
    {
      key: "year",
      allLabel: "All Years",
      options: buildYearOptions(),
    },
    {
      key: "genres",
      allLabel: "All Genres",
      options: ANIDB_GENRES,
    },
    {
      key: "sort",
      allLabel: "Trending",
      // Sort always shows a concrete mode; default Trending omits the param.
      defaultValue: SEARCH_FILTER_ANY_VALUE,
      required: true,
      options: ANIDB_SORT,
    },
  ];
}
