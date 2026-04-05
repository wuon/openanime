import { Search } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Skeleton } from "@/renderer/components/ui/skeleton";
import { cn } from "@/renderer/lib/utils";
import type { AniListShowDetails } from "@/shared/types";

const HERO_BOTTOM_BLEND =
  "linear-gradient(to bottom, transparent 36%, hsl(var(--background) / 0.35) 58%, hsl(var(--background) / 0.82) 78%, hsl(var(--background)) 100%)";

const HERO_LEFT_BLEND =
  "linear-gradient(to left, transparent 36%, hsl(var(--background) / 0.35) 58%, hsl(var(--background) / 0.82) 70%, hsl(var(--background)) 100%)";

function stripAniListDescription(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayTitle(show: AniListShowDetails): string {
  return (
    show.title?.userPreferred ??
    show.title?.english ??
    show.title?.romaji ??
    show.title?.native ??
    "Untitled"
  );
}

function coverUrl(show: AniListShowDetails): string | null {
  return show.coverImage?.extraLarge ?? show.coverImage?.large ?? null;
}

function heroImage(show: AniListShowDetails): string | null {
  return show.bannerImage ?? coverUrl(show);
}

function metaBadges(show: AniListShowDetails): string[] {
  const score = show.averageScore != null ? (show.averageScore / 10).toFixed(1) : null;
  return [
    show.season && show.seasonYear != null ? `${show.season} ${show.seasonYear}` : null,
    show.duration != null ? `${show.duration}m` : null,
    score,
    show.status ?? null,
  ].filter((x): x is string => Boolean(x));
}

function HomeHeroSlide({ show, isActive }: { show: AniListShowDetails; isActive: boolean }) {
  const navigate = useNavigate();
  const title = displayTitle(show);
  const bg = heroImage(show);
  const poster = coverUrl(show);
  const description = stripAniListDescription(show.description);
  const badges = metaBadges(show);

  const goSearch = () => {
    navigate({ pathname: "/search", search: `?q=${encodeURIComponent(title)}` });
  };

  return (
    <div
      className="relative min-w-full shrink-0 snap-center"
      role="group"
      aria-roledescription="slide"
      aria-label={title}
      aria-hidden={!isActive}
    >
      <div className="relative h-[280px] overflow-hidden md:h-[440px]">
        {bg ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bg})` }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/60" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: HERO_BOTTOM_BLEND }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: HERO_LEFT_BLEND }}
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-muted" aria-hidden />
        )}
        <div className="relative flex flex-col gap-6 pt-24 p-6 text-white">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-4">
              <h2 className="line-clamp-2 text-3xl font-bold leading-tight text-foreground md:text-5xl">
                {title}
              </h2>
              {description ? (
                <p className="line-clamp-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  {description}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {badges.map((entry) => (
                  <Badge key={entry} variant="secondary">
                    {entry}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center pt-1">
                <Button type="button" onClick={goSearch} className="cursor-pointer font-semibold">
                  <Search className="h-4 w-4" />
                  Find in app
                </Button>
              </div>
            </div>

            {poster ? (
              <img
                src={poster}
                draggable={false}
                alt=""
                className="h-64 w-auto rounded-xl border-2 border-transparent/20 object-cover"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeHeroSkeleton() {
  return (
    <div className="relative min-h-[280px] overflow-hidden md:min-h-[320px]" aria-busy="true">
      <div className="absolute inset-0 bg-muted" aria-hidden />
      <div className="relative flex flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl space-y-4">
            <Skeleton className="h-10 w-4/5 max-w-xl bg-foreground/10 md:h-14" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full max-w-2xl bg-foreground/10" />
              <Skeleton className="h-4 w-full max-w-2xl bg-foreground/10" />
              <Skeleton className="h-4 w-3/4 max-w-lg bg-foreground/10" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-14 rounded-full bg-foreground/10" />
              <Skeleton className="h-5 w-20 rounded-full bg-foreground/10" />
            </div>
            <Skeleton className="h-10 w-40 rounded-md bg-foreground/10" />
          </div>
          <Skeleton className="h-64 w-48 shrink-0 rounded-xl bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}

export function HomeHeroCarousel() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<AniListShowDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void window.anilist
      .getPopularSeason()
      .then((media) => {
        if (!cancelled) {
          setItems(media);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load seasonal picks");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateIndexFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const i = Math.round(el.scrollLeft / w);
    setActiveIndex(Math.min(items.length - 1, Math.max(0, i)));
  }, [items.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateIndexFromScroll();
    el.addEventListener("scroll", updateIndexFromScroll, { passive: true });
    window.addEventListener("resize", updateIndexFromScroll);
    return () => {
      el.removeEventListener("scroll", updateIndexFromScroll);
      window.removeEventListener("resize", updateIndexFromScroll);
    };
  }, [updateIndexFromScroll, items.length]);

  const scrollToIndex = useCallback(
    (next: number) => {
      const el = scrollRef.current;
      if (!el || items.length === 0) return;
      const clamped = Math.min(items.length - 1, Math.max(0, next));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    },
    [items.length]
  );

  if (loading) {
    return (
      <section aria-label="Popular this season" className="relative w-full overflow-hidden">
        <HomeHeroSkeleton />
      </section>
    );
  }

  if (error) {
    return (
      <section aria-label="Popular this season" className="px-6 py-4 md:px-8">
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="relative w-full overflow-hidden h-[440px]"
      aria-roledescription="carousel"
      aria-label="Popular this season"
    >
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-none"
      >
        {items.map((show, i) => (
          <HomeHeroSlide key={show.id ?? i} show={show} isActive={i === activeIndex} />
        ))}
      </div>

      {items.length > 1 ? (
        <>
          <div
            className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1.5"
            aria-label="Slide indicators"
          >
            {items.map((show, i) => (
              <button
                key={show.id ?? i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === activeIndex ? "true" : undefined}
                onClick={() => scrollToIndex(i)}
                className={cn(
                  "pointer-events-auto h-2 w-2 rounded-full transition-colors hover:bg-foreground/40",
                  i === activeIndex ? "bg-foreground" : "bg-foreground/25"
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
