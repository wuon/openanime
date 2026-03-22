import { ArrowLeft, Loader2 } from "lucide-react";
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
    [anime, state?.searchIndex]
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
      .then(async ([d, epList]) => {
        if (cancelled) return;
        setDetails(d);

        let episodesToUse = initialEpisodes;
        if (initialEpisodes.length === 0 && Array.isArray(epList)) {
          episodesToUse = epList;
          setEpisodes(epList);
        }

        const fallbackEpisode = episodesToUse[0] ?? "";
        const preferredEpisode =
          state.preferLatest && episodesToUse.length > 0
            ? episodesToUse[episodesToUse.length - 1]
            : state.currentEpisode || fallbackEpisode;

        if (!preferredEpisode) return;
        setCurrentEpisode(preferredEpisode);
        await loadStream(preferredEpisode);
      })
      .catch(() => {
        if (!cancelled)
          setDetails({ id: state.anime.id, name: state.anime.name, thumbnail: null, type: "TV" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    state?.anime?.id,
    state?.anime?.name,
    state?.anime?.mode,
    state?.episodes,
    state?.currentEpisode,
    state?.preferLatest,
    loadStream,
  ]);

  const onEpisodeSelect = useCallback(
    (ep: string) => {
      setCurrentEpisode(ep);
      void loadStream(ep);
    },
    [loadStream]
  );

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {displayName} ({anime.mode === "dub" ? "Dub" : "Sub"})
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={currentEpisode} onValueChange={onEpisodeSelect} disabled={loadingEpisode}>
            <SelectTrigger className="w-[120px] bg-background h-8">
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
      </div>

      {/* Video player - fixed 16:9 area, centered */}
      <div className="w-full flex items-center justify-center shrink-0 p-16">
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
    </div>
  );
}
