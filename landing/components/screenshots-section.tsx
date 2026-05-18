"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const ROTATE_INTERVAL_MS = 5000;

type Screenshot = {
  id: string;
  label: string;
  title: string;
  description: string;
  src: string;
  alt: string;
  /** Set to false until the preview image exists in `public/previews/`. */
  enabled?: boolean;
};

/** Add images to `public/previews/` using the `src` filenames below. */
const allScreenshots: Screenshot[] = [
  {
    id: "home",
    label: "Home",
    title: "Pick up where you left off",
    description:
      "Featured picks and your continue-watching row are front and center—so the next episode is always one click away.",
    src: "/previews/home.png",
    alt: "Openanime home screen with featured anime and continue watching",
  },
  {
    id: "episodes",
    label: "Episodes",
    title: "Browse every episode at a glance",
    description:
      "Scroll through a show’s full episode list with thumbnails and titles—pick the one you want without leaving the app.",
    src: "/previews/episode-list.png",
    alt: "Openanime episode list with thumbnail grid for an anime series",
  },
  {
    id: "player",
    label: "Player",
    title: "Watch in a focused player",
    description:
      "Full-screen playback with subtitles, skip controls, episode switching, and a clean overlay that stays out of the way while you watch.",
    src: "/previews/player.png",
    alt: "Openanime video player with playback controls and subtitles",
  },
  {
    id: "search",
    label: "Search",
    title: "Find something new to watch",
    description:
      "Search by title or browse results as you type—jump straight into a show without digging through menus.",
    src: "/previews/search.png",
    alt: "Openanime search screen with browse results",
  },
  {
    id: "history",
    label: "History",
    title: "Your watch history, at a glance",
    description:
      "See episodes watched, time stats, and every title with progress and timestamps—resume right where you left off.",
    src: "/previews/history.png",
    alt: "Openanime history page with watch stats and a list of recently watched episodes",
  },
];

const screenshots = allScreenshots.filter((shot) => shot.enabled !== false);

export function ScreenshotsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const count = screenshots.length;
  const active = screenshots[activeIndex];

  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(((index % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (isPaused) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % count);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [activeIndex, count, isPaused]);

  return (
    <section
      className="relative border-t border-white/10 bg-black px-6 py-24 md:px-10 md:py-32 lg:px-12 xl:px-16"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsPaused(false);
        }
      }}
    >
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-12 max-w-2xl md:mb-16">
          <p className="mb-3 text-sm font-medium tracking-wide text-white/50 uppercase">
            Screenshots
          </p>
          <h2 className="mb-5 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
            {active.title}
          </h2>
          <p className="text-lg leading-relaxed text-white/65 md:text-xl">
            {active.description}
          </p>
        </div>

        <div aria-live="polite" aria-atomic="true">
          <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/3 shadow-[0_0_80px_-20px_rgba(255,255,255,0.12)] md:mb-8">
            <Image
              key={active.src}
              src={active.src}
              alt={active.alt}
              width={0}
              height={0}
              sizes="(max-width: 768px) 100vw, 1152px"
              className="h-auto w-full transition-opacity duration-500"
              priority={activeIndex === 0}
            />
          </div>
        </div>

        <div
          className="grid w-full gap-2 sm:gap-3"
          style={{
            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          }}
          role="tablist"
          aria-label="App screenshots"
        >
          {screenshots.map((shot, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={shot.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="screenshot-panel"
                id={`screenshot-tab-${shot.id}`}
                onClick={() => goTo(index)}
                className="group min-w-0 text-left"
              >
                <div
                  className={cn(
                    "relative mb-2 aspect-[16/9] overflow-hidden rounded-lg border bg-black/40 transition-all sm:mb-3 sm:rounded-xl",
                    isActive
                      ? "border-white/40 ring-1 ring-white/20"
                      : "border-white/10 opacity-70 hover:border-white/20 hover:opacity-100",
                  )}
                >
                  <Image
                    src={shot.src}
                    alt=""
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 16vw"
                  />
                </div>
                <span
                  className={cn(
                    "block truncate text-[10px] tracking-wide transition-colors sm:text-xs",
                    isActive
                      ? "text-white"
                      : "text-white/45 group-hover:text-white/70",
                  )}
                >
                  {shot.label}
                </span>
              </button>
            );
          })}
        </div>

        <p id="screenshot-panel" className="sr-only">
          {active.title}. {active.description}
        </p>
      </div>
    </section>
  );
}
