import { ArrowLeft, Download, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/renderer/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { type ShowDetails, getAniCli } from "@/renderer/lib/ani-cli-bridge";

interface WatchState {
  anime: { id: string; name: string; mode: "sub" | "dub" };
  episodes: string[];
  currentEpisode: string;
  /** When true, open on the latest episode (e.g. from recently uploaded tile) */
  preferLatest?: boolean;
  /** 1-based index of this anime in the search results, for ani-cli -S */
  searchIndex?: number;
}

export function WatchPage() {
  const location = useLocation();
  const state = location.state as WatchState | null;

  const [playUrl, setPlayUrl] = useState<string>("");
  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEpisode, setLoadingEpisode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anime = state?.anime;
  const [episodes, setEpisodes] = useState<string[]>(() => state?.episodes ?? []);
  const initialEpisode = state?.currentEpisode ?? episodes[0] ?? "";

  const [currentEpisode, setCurrentEpisode] = useState<string>(initialEpisode);

  const loadStream = useCallback(
    async (ep: string) => {
      if (!anime?.name || !ep) return;
      setLoadingEpisode(true);
      setError(null);
      try {
        const aniCli = getAniCli();
        const { url, referer } = await aniCli.getStreamUrl(
          anime.name,
          ep,
          anime.mode,
          state?.searchIndex
        );
        const base = await aniCli.getStreamProxyBaseUrl();
        const urlWithProxy = `${base}/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
        setPlayUrl(urlWithProxy);
        setCurrentEpisode(ep);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stream");
      } finally {
        setLoadingEpisode(false);
      }
    },
    [anime]
  );

  useEffect(() => {
    if (!state?.anime) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const aniCli = getAniCli();
    const initialEpisodes = state.episodes ?? [];
    void Promise.all([
      aniCli.getShowDetails(state.anime.id),
      initialEpisodes.length === 0
        ? aniCli.getEpisodes(state.anime.id, state.anime.mode)
        : Promise.resolve(initialEpisodes),
    ])
      .then(([d, epList]) => {
        if (!cancelled) {
          setDetails(d);
          if (initialEpisodes.length === 0 && Array.isArray(epList)) {
            setEpisodes(epList);
            if (state.preferLatest && epList.length > 0) {
              const latest = epList[epList.length - 1];
              setCurrentEpisode(latest);
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled)
          setDetails({ id: state.anime!.id, name: state.anime!.name, thumbnail: null, type: "TV" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.anime?.id, state?.anime?.name, state?.anime?.mode, state?.episodes]);

  useEffect(() => {
    if (!anime || !currentEpisode) return;
    void loadStream(currentEpisode);
  }, [anime?.id, currentEpisode]);

  const onEpisodeSelect = useCallback((ep: string) => {
    setCurrentEpisode(ep);
  }, []);

  if (!state?.anime) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">
          No anime selected. Go back and pick an episode to play.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const displayName = details?.name ?? anime.name;
  const episodeLabel = currentEpisode ? `Episode ${currentEpisode}` : "—";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <span className="text-sm font-medium truncate flex-1">{displayName}</span>
      </div>

      {/* Video player - fixed 16:9 area, centered */}
      <div className="w-full bg-muted/30 flex items-center justify-center shrink-0">
        <div className="w-full max-w-5xl px-4">
          <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden flex items-center justify-center">
            {loadingEpisode && !playUrl ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin" />
                <span className="text-sm">Loading stream…</span>
              </div>
            ) : error && !playUrl ? (
              <div className="flex flex-col items-center gap-2 text-destructive px-4 text-center">
                <span className="text-sm">{error}</span>
              </div>
            ) : playUrl ? (
              <video
                key={playUrl}
                className="h-full w-full object-contain bg-black"
                controls
                autoPlay
                playsInline
                src={playUrl}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
                <span className="text-sm">Select an episode to play</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Episode</span>
          <Select value={currentEpisode} onValueChange={onEpisodeSelect} disabled={loadingEpisode}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue placeholder="Episode" />
            </SelectTrigger>
            <SelectContent>
              {episodes.map((ep) => (
                <SelectItem key={ep} value={ep}>
                  Episode {ep}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          {anime.mode === "dub" ? "Dubbed" : "Subbed"}
        </div>
      </div>

      {/* Anime details */}
      <div className="flex gap-4 p-4 flex-1 min-h-0">
        {details?.thumbnail ? (
          <img
            src={details.thumbnail}
            alt=""
            className="w-24 h-32 object-cover rounded-md border border-border shrink-0 bg-muted"
          />
        ) : (
          <div className="w-24 h-32 rounded-md border border-border bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <h1 className="font-semibold text-lg truncate">{displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {details?.type ?? "TV"} – {episodeLabel}
            {episodes.length > 0 && ` (${episodes.length} episodes)`}
          </p>
          <p className="text-sm text-muted-foreground">
            {anime.mode === "dub" ? "Dubbed" : "Subbed"}
          </p>
        </div>
      </div>
    </div>
  );
}
