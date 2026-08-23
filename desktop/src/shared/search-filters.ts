/** Sentinel for "no filter" / All X — omit this key from provider browse URLs. */
export const SEARCH_FILTER_ANY_VALUE = "any";

/** Active filter selections keyed by `SearchFilterDefinition.key`. */
export type SearchFilterValues = Record<string, string>;

export interface SearchFilterOption {
  label: string;
  /** Provider-specific wire value (URL param, API enum, etc.). */
  value: string;
}

export interface SearchFilterDefinition {
  /** Query/param key sent to the provider (e.g. `type`, `sort`). */
  key: string;
  /** Label for the empty/"all" option in the UI (ignored when `required`). */
  allLabel: string;
  options: SearchFilterOption[];
  /** Initial selection; defaults to {@link SEARCH_FILTER_ANY_VALUE}. */
  defaultValue?: string;
  /**
   * When true, always require a concrete option (no "All X" row).
   * Use for sort modes that default to a specific value like Trending.
   */
  required?: boolean;
}

export function defaultSearchFilterValues(
  definitions: SearchFilterDefinition[]
): SearchFilterValues {
  const values: SearchFilterValues = {};
  for (const def of definitions) {
    values[def.key] = def.defaultValue ?? SEARCH_FILTER_ANY_VALUE;
  }
  return values;
}

/** Drop empty / "any" entries so providers only receive active constraints. */
export function compactSearchFilters(filters: SearchFilterValues | undefined): SearchFilterValues {
  if (!filters) return {};
  const out: SearchFilterValues = {};
  for (const [key, value] of Object.entries(filters)) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === SEARCH_FILTER_ANY_VALUE) continue;
    out[key] = trimmed;
  }
  return out;
}
