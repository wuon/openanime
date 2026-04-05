import React, { type ReactNode } from "react";

import { cn } from "@/renderer/lib/utils";

import { Badge } from "./ui/badge";

/** Renders as `M:SS`, or `H:MM:SS` when an hour or longer. */
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

function durationBadgeText(totalDurationMs: number, currentDurationMs?: number): string {
  const total = formatDurationMs(totalDurationMs);
  if (currentDurationMs != null && Number.isFinite(currentDurationMs)) {
    return `${formatDurationMs(currentDurationMs)}/${total}`;
  }
  return total;
}

export type EpisodeCardProps = {
  thumbnailUrl?: string | null;
  /** Shown inside the glass badge. Defaults to `Episode {episodeIndex}` when `episodeIndex` is set. */
  badge?: ReactNode;
  episodeIndex?: number;
  /** Line below the badge (e.g. episode title or show name). */
  subtitle?: string | null;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  /** `carousel`: fixed width and `data-carousel-item` for horizontal scroll rows. */
  layout?: "grid" | "carousel";
  /** When set, shows a glass badge top-right: `24:00`, or `12:34/24:00` if `currentDurationMs` is also set. */
  totalDurationMs?: number;
  currentDurationMs?: number;
};

export function EpisodeCard({
  thumbnailUrl,
  badge,
  episodeIndex,
  subtitle,
  onClick,
  disabled,
  className,
  layout = "grid",
  totalDurationMs,
  currentDurationMs,
}: EpisodeCardProps) {
  const badgeContent = badge ?? (episodeIndex != null ? `Episode ${episodeIndex}` : null);

  const durationLabel =
    totalDurationMs != null && Number.isFinite(totalDurationMs) && totalDurationMs >= 0
      ? durationBadgeText(totalDurationMs, currentDurationMs)
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(layout === "carousel" ? { "data-carousel-item": true } : {})}
      className={cn(
        "group text-left focus-visible:outline-none disabled:opacity-60",
        layout === "carousel" && "flex-shrink-0 w-60 sm:w-72",
        layout === "grid" && "w-full",
        className
      )}
    >
      <div
        className={cn(
          "relative w-full rounded-2xl border-2 border-border p-[3px] box-border transition-all group-hover:border-primary/80 group-hover:shadow-[0_0_0_1px_rgba(129,140,248,0.7)] group-focus-visible:border-primary/80 group-focus-visible:shadow-[0_0_0_1px_rgba(129,140,248,0.7)] h-40"
        )}
      >
        <div className="relative h-full w-full overflow-hidden rounded-lg bg-muted">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-muted" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          {durationLabel != null ? (
            <div className="pointer-events-none absolute top-0 right-0 z-[1] p-2.5">
              <Badge
                variant="glass"
                className="cursor-default tabular-nums text-white hover:bg-transparent/20"
              >
                {durationLabel}
              </Badge>
            </div>
          ) : null}
          <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
            {badgeContent != null && (
              <Badge variant="glass" className="cursor-default hover:bg-transparent/20 text-white">
                {badgeContent}
              </Badge>
            )}
            {subtitle ? (
              <p className="mt-1 line-clamp-2 text-sm font-semibold">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
