import { Button } from "@/renderer/components/ui/button";
import {
  type AnimeSearchResult,
  type ShowDetails,
  getAniCli,
} from "@/renderer/lib/ani-cli-bridge";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

type EpisodesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: string[] }
  | { status: "error"; message: string };

interface LocationState {
  anime?: AnimeSearchResult;
}

export function AnimeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [episodesState, setEpisodesState] = useState<EpisodesState>({ status: "idle" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<string | null>(null);

  const anime =
    state?.anime ?? (id ? { id, name: "", episodeCount: 0, mode: "sub" as const } : null);
  const mode = anime?.mode ?? "sub";

  useEffect(() => {
    if (!id || !anime) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const aniCli = getAniCli();
    void Promise.all([aniCli.getShowDetails(id), aniCli.getEpisodes(id, mode)])
      .then(([d, episodes]) => {
        if (cancelled) return;
        setDetails(d);
        setEpisodesState({ status: "loaded", episodes });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mode, anime]);

  const playEpisode = useCallback(
    (episode: string, episodes: string[]) => {
      if (!anime?.id) return;
      setPlayingEpisode(episode);
      navigate("/watch", {
        state: {
          anime: { id: anime.id, name: anime.name, mode: anime.mode },
          episodes,
          currentEpisode: episode,
        },
      });
      setPlayingEpisode(null);
    },
    [navigate, anime]
  );

  if (!id) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">No anime selected.</p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (loading && !details) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading…</p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const displayName = details?.name ?? anime?.name ?? "Unknown";
  const episodes = episodesState.status === "loaded" ? episodesState.episodes : [];

  return (
    <div className="container flex flex-col gap-6 p-6 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold truncate flex-1">{displayName}</h1>
      </div>

      <div className="flex gap-6">
        {details?.thumbnail ? (
          <img
            src={details.thumbnail}
            alt=""
            className="w-32 sm:w-40 aspect-[2/3] object-cover rounded-xl border-2 border-border shrink-0"
          />
        ) : (
          <div className="w-32 sm:w-40 aspect-[2/3] rounded-xl border-2 border-border bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {details?.type ?? "TV"} · {anime?.episodeCount ?? episodes.length} episodes ({mode})
          </p>
          {details?.description && (
            <p className="text-sm text-foreground/90 line-clamp-6">{details.description}</p>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Episodes</h2>
        {episodesState.status === "loading" && (
          <p className="text-sm text-muted-foreground">Loading episodes…</p>
        )}
        {episodesState.status === "error" && (
          <p className="text-sm text-destructive">{episodesState.message}</p>
        )}
        {episodes.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {episodes.map((ep) => {
              const isPlaying = playingEpisode === ep;
              return (
                <li key={ep}>
                  <button
                    type="button"
                    onClick={() => playEpisode(ep, episodes)}
                    disabled={isPlaying}
                    className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                  >
                    <Play className="h-3 w-3 shrink-0" />
                    {isPlaying ? "Resolving…" : ep}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
