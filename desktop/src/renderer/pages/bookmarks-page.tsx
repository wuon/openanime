import { Heart, List } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAniListConnectDialog } from "@/renderer/components/anilist-connect-dialog";
import { SHOW_GRID_CLASS, ShowGrid } from "@/renderer/components/show-grid";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Skeleton } from "@/renderer/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import { useAniListStatus } from "@/renderer/hooks/use-anilist-status";
import {
  ANILIST_LIST_STATUS_LABELS,
  anilistCoverUrl,
  anilistMediaTitle,
  resolveProviderForAniListMedia,
} from "@/renderer/lib/anilist-helpers";
import type {
  AniListFavouriteMedia,
  AniListListEntry,
  AniListListMedia,
  AniListMediaListStatus,
} from "@/shared/types";

type BookmarksTab = "watching" | "planning" | "completed" | "likes";

const TAB_STATUS: Record<Exclude<BookmarksTab, "likes">, AniListMediaListStatus> = {
  watching: "CURRENT",
  planning: "PLANNING",
  completed: "COMPLETED",
};

const GRID_SKELETON_COUNT = 12;

function BookmarksGridSkeleton() {
  return (
    <div className={SHOW_GRID_CLASS} aria-busy="true" aria-label="Loading bookmarks">
      {Array.from({ length: GRID_SKELETON_COUNT }, (_, i) => (
        <div key={i} className="w-full min-w-0">
          <Skeleton className="w-full aspect-[2/3] rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

function listEntryBadges(entry: AniListListEntry): React.ReactNode {
  const badges: React.ReactNode[] = [];
  if (entry.progress > 0) {
    const total = entry.media.episodes;
    badges.push(
      <Badge key="progress" variant="glass" className="text-white text-xs">
        {total ? `Ep ${entry.progress}/${total}` : `Ep ${entry.progress}`}
      </Badge>
    );
  }
  if (entry.status === "REPEATING") {
    badges.push(
      <Badge key="rewatch" variant="glass" className="text-white text-xs">
        Rewatching
      </Badge>
    );
  }
  return badges;
}

function mediaToCardItem(
  media: AniListListMedia,
  badges: React.ReactNode,
  onNavigate: (media: AniListListMedia) => void
) {
  const rating =
    media.averageScore != null ? Number((media.averageScore / 10).toFixed(1)) : undefined;
  return {
    id: String(media.id),
    title: anilistMediaTitle(media),
    coverUrl: anilistCoverUrl(media),
    rating,
    badges,
    onClick: () => onNavigate(media),
  };
}

export function BookmarksPage() {
  const navigate = useNavigate();
  const { status: anilistStatus, loading: statusLoading, refresh: refreshAniListStatus } =
    useAniListStatus();
  const { dialog: connectDialog, openConnect } = useAniListConnectDialog(() => {
    void refreshAniListStatus();
  });
  const [activeTab, setActiveTab] = useState<BookmarksTab>("watching");
  const [entries, setEntries] = useState<AniListListEntry[]>([]);
  const [favourites, setFavourites] = useState<AniListFavouriteMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navigatingId, setNavigatingId] = useState<number | null>(null);

  const loadTab = useCallback(
    async (tab: BookmarksTab) => {
      if (!anilistStatus.connected) return;
      setLoading(true);
      setError(null);
      try {
        if (tab === "likes") {
          const result = await window.anilist.getFavourites();
          setFavourites(result.media);
          setEntries([]);
        } else {
          const result = await window.anilist.getMediaList(TAB_STATUS[tab]);
          setEntries(result.entries);
          setFavourites([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load bookmarks.");
        setEntries([]);
        setFavourites([]);
      } finally {
        setLoading(false);
      }
    },
    [anilistStatus.connected]
  );

  useEffect(() => {
    if (anilistStatus.connected) {
      void loadTab(activeTab);
    }
  }, [activeTab, anilistStatus.connected, loadTab]);

  const handleNavigate = useCallback(
    (media: AniListListMedia) => {
      void (async () => {
        setNavigatingId(media.id);
        try {
          const resolved = await resolveProviderForAniListMedia(media);
          if (!resolved) {
            setError(`Could not find a stream source for "${anilistMediaTitle(media)}".`);
            return;
          }
          navigate(`/show/${media.id}?providerId=${encodeURIComponent(resolved.providerId)}`);
        } finally {
          setNavigatingId(null);
        }
      })();
    },
    [navigate]
  );

  if (statusLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-6 md:p-8">
        <BookmarksGridSkeleton />
      </div>
    );
  }

  if (!anilistStatus.connected) {
    return (
      <>
        <div className="mx-auto flex w-full max-w-[1600px] flex-col items-center justify-center gap-4 p-8 text-center">
          <List className="h-10 w-10 text-muted-foreground" aria-hidden />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Bookmarks</h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Connect your AniList account to sync your watching, planning, completed, and liked
              anime.
            </p>
          </div>
          <Button type="button" onClick={openConnect}>
            Connect AniList
          </Button>
        </div>
        {connectDialog}
      </>
    );
  }

  const listItems = entries.map((entry) =>
    mediaToCardItem(entry.media, listEntryBadges(entry), handleNavigate)
  );
  const likeItems = favourites.map((media) =>
    mediaToCardItem(
      media,
      media.isFavourite ? (
        <Badge variant="glass" className="text-white text-xs">
          <Heart className="mr-1 h-3 w-3 fill-current" />
          Liked
        </Badge>
      ) : null,
      handleNavigate
    )
  );
  const activeItems = activeTab === "likes" ? likeItems : listItems;
  const isEmpty = !loading && activeItems.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-4xl font-semibold tracking-tight">Bookmarks</h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (
            value === "watching" ||
            value === "planning" ||
            value === "completed" ||
            value === "likes"
          ) {
            setActiveTab(value);
          }
        }}
      >
        <TabsList className="mb-6">
          <TabsTrigger value="watching">{ANILIST_LIST_STATUS_LABELS.CURRENT}</TabsTrigger>
          <TabsTrigger value="planning">{ANILIST_LIST_STATUS_LABELS.PLANNING}</TabsTrigger>
          <TabsTrigger value="completed">{ANILIST_LIST_STATUS_LABELS.COMPLETED}</TabsTrigger>
          <TabsTrigger value="likes">
            <Heart className="mr-1.5 h-3.5 w-3.5" />
            Likes
          </TabsTrigger>
        </TabsList>

        {error && (
          <p className="mb-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {navigatingId != null && (
          <p className="mb-4 text-sm text-muted-foreground">Finding stream source…</p>
        )}

        <TabsContent value={activeTab} className="mt-0">
          {loading ? (
            <BookmarksGridSkeleton />
          ) : isEmpty ? (
            <p className="text-sm text-muted-foreground">
              {activeTab === "likes"
                ? "No liked anime yet. Favourite shows from their details page."
                : `No anime in ${activeTab === "watching" ? "your watching list" : activeTab === "planning" ? "your planning list" : "your completed list"}.`}
            </p>
          ) : (
            <ShowGrid items={activeItems} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
