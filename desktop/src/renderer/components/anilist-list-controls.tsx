import { ChevronDown, Heart, ListPlus, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { useAniListConnectDialog } from "@/renderer/components/anilist-connect-dialog";
import { Button } from "@/renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/renderer/components/ui/dropdown-menu";
import { useAniListStatus } from "@/renderer/hooks/use-anilist-status";
import {
  ANILIST_ADD_TO_LIST_OPTIONS,
  ANILIST_LIST_STATUS_LABELS,
} from "@/renderer/lib/anilist-helpers";
import type { AniListMediaListStatus } from "@/shared/types";
import { cn } from "@/renderer/lib/utils";

interface AniListListControlsProps {
  mediaId: number;
  listEntryId?: number | null;
  listStatus?: AniListMediaListStatus | null;
  isFavourite?: boolean;
  onListChange?: (status: AniListMediaListStatus | null) => void;
  onFavouriteChange?: (isFavourite: boolean) => void;
  className?: string;
}

function todayFuzzyDate() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function AniListListControls({
  mediaId,
  listEntryId,
  listStatus,
  isFavourite = false,
  onListChange,
  onFavouriteChange,
  className,
}: AniListListControlsProps) {
  const { status: anilistStatus, refresh: refreshAniListStatus } = useAniListStatus();
  const { dialog: connectDialog, openConnect } = useAniListConnectDialog(() => {
    void refreshAniListStatus();
  });
  const [currentStatus, setCurrentStatus] = useState<AniListMediaListStatus | null>(
    listStatus ?? null
  );
  const [currentEntryId, setCurrentEntryId] = useState<number | null>(listEntryId ?? null);
  const [favourite, setFavourite] = useState(isFavourite);
  const [listLoading, setListLoading] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    setCurrentStatus(listStatus ?? null);
    setCurrentEntryId(listEntryId ?? null);
    setFavourite(isFavourite);
  }, [listStatus, listEntryId, isFavourite, mediaId]);

  const handleSetStatus = useCallback(
    async (status: AniListMediaListStatus) => {
      if (!anilistStatus.connected) return;
      setListLoading(true);
      try {
        const input: Parameters<typeof window.anilist.saveListEntry>[0] = {
          mediaId: currentEntryId == null ? mediaId : undefined,
          id: currentEntryId ?? undefined,
          status,
        };
        if (status === "CURRENT" || status === "REPEATING") {
          input.startedAt = todayFuzzyDate();
        }
        if (status === "COMPLETED") {
          input.completedAt = todayFuzzyDate();
        }
        const entry = await window.anilist.saveListEntry(input);
        setCurrentStatus(entry.status);
        setCurrentEntryId(entry.id);
        onListChange?.(entry.status);
      } catch {
        // best-effort
      } finally {
        setListLoading(false);
      }
    },
    [anilistStatus.connected, currentEntryId, mediaId, onListChange]
  );

  const handleRemoveFromList = useCallback(async () => {
    if (!anilistStatus.connected || currentEntryId == null) return;
    setListLoading(true);
    try {
      await window.anilist.deleteListEntry(currentEntryId);
      setCurrentStatus(null);
      setCurrentEntryId(null);
      onListChange?.(null);
    } catch {
      // best-effort
    } finally {
      setListLoading(false);
    }
  }, [anilistStatus.connected, currentEntryId, onListChange]);

  const handleToggleFavourite = useCallback(async () => {
    if (!anilistStatus.connected) return;
    setFavLoading(true);
    try {
      const next = await window.anilist.toggleFavourite(mediaId);
      setFavourite(next);
      onFavouriteChange?.(next);
    } catch {
      // best-effort
    } finally {
      setFavLoading(false);
    }
  }, [anilistStatus.connected, mediaId, onFavouriteChange]);

  if (!anilistStatus.connected) {
    return (
      <>
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
          <Button type="button" variant="outline" size="sm" onClick={openConnect}>
            <ListPlus className="h-4 w-4" />
            Connect AniList
          </Button>
        </div>
        {connectDialog}
      </>
    );
  }

  const listLabel = currentStatus ? ANILIST_LIST_STATUS_LABELS[currentStatus] : "Add to List";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={listLoading}>
            {listLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ListPlus className="h-4 w-4" />
            )}
            {listLabel}
            {!listLoading && <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {ANILIST_ADD_TO_LIST_OPTIONS.map((status) => (
            <DropdownMenuItem
              key={status}
              onSelect={() => void handleSetStatus(status)}
              className={currentStatus === status ? "font-semibold" : undefined}
            >
              {ANILIST_LIST_STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
          {currentEntryId != null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void handleRemoveFromList()}
                className="text-destructive focus:text-destructive"
              >
                Remove from List
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => void handleToggleFavourite()}
        disabled={favLoading}
        aria-pressed={favourite}
        aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
        className={cn(
          "h-9 w-9 shrink-0",
          favourite
            ? "border-red-500 bg-red-600 text-white hover:bg-red-700 hover:text-white"
            : "border-red-500/60 text-red-500 hover:border-red-500 hover:bg-red-500/10 hover:text-red-600"
        )}
      >
        {favLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart className={cn("h-4 w-4", favourite ? "fill-current" : "text-red-500")} />
        )}
      </Button>
    </div>
  );
}
