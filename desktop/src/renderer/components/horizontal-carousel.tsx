import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

type HorizontalCarouselItem = {
  id: string;
  coverUrl: string | null;
  /** Typically the anime title. */
  title: string;
  /** Typically "Episode X · sub/dub". */
  subtitle: string;
  /** Called when the item is clicked (e.g. navigate to watch page). */
  onClick: () => void;
};

type HorizontalCarouselProps = {
  /** Items rendered as standard anime-style cards with cover, title, and subtitle. */
  items: HorizontalCarouselItem[];
  /** How many fully-visible items to page by when clicking arrows. */
  pageSize?: number;
};

function HorizontalCarouselCard({ item }: { item: HorizontalCarouselItem }) {
  const [failed, setFailed] = useState(false);

  const showFallback = failed || !item.coverUrl;

  return (
    <button
      type="button"
      className="group flex-shrink-0 w-36 sm:w-40 text-left focus-visible:outline-none"
      data-carousel-item
      onClick={item.onClick}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="relative w-full aspect-[2/3] rounded-2xl border-2 border-border transition-all p-[3px] box-border group-hover:border-primary/80 group-hover:shadow-[0_0_0_1px_rgba(129,140,248,0.7)] group-focus-visible:border-primary/80 group-focus-visible:shadow-[0_0_0_1px_rgba(129,140,248,0.7)]">
        <div className="h-full w-full rounded-xl overflow-hidden bg-muted">
          {showFallback ? (
            <div className="h-full w-full flex items-center justify-center bg-muted-foreground/5 text-muted-foreground/70">
              <ImageOff className="h-6 w-6" aria-hidden="true" />
            </div>
          ) : (
            <img
              src={item.coverUrl ?? undefined}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </div>
      <div className="mt-2 h-16 flex flex-col items-start justify-start">
        <p className="text-xs font-medium line-clamp-2 break-words">{item.title}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{item.subtitle}</p>
      </div>
    </button>
  );
}

export function HorizontalCarousel({ items, pageSize = 6 }: HorizontalCarouselProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = el.scrollLeft;
    setCanScrollLeft(left > 0);
    setCanScrollRight(left < maxScrollLeft - 1);
  }, []);

  const scrollByPage = useCallback(
    (direction: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;

      const items = el.querySelectorAll<HTMLElement>("[data-carousel-item]");
      if (items.length === 0) return;

      let step = items[0].getBoundingClientRect().width;
      if (items.length > 1) {
        const firstRect = items[0].getBoundingClientRect();
        const secondRect = items[1].getBoundingClientRect();
        const gap = secondRect.left - firstRect.right;
        if (!Number.isNaN(gap) && gap > 0) {
          step += gap;
        }
      }

      const amount = step * pageSize;
      el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
    },
    [pageSize]
  );

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState, items.length]);

  return (
    <div className="relative">
      <div className="relative w-full">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="flex gap-3 overflow-x-auto pb-2 scroll-smooth pr-6 scrollbar-none"
        >
          {items.map((item) => (
            <HorizontalCarouselCard key={item.id} item={item} />
          ))}
        </div>

        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollByPage("left")}
            className="absolute left-2 top-[calc(50%-2.25rem)] -translate-y-1/2 z-10 inline-flex h-12 w-8 items-center justify-center rounded-md bg-background/80 border border-border shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollByPage("right")}
            className="absolute right-2 top-[calc(50%-2.25rem)] -translate-y-1/2 z-10 inline-flex h-12 w-8 items-center justify-center rounded-md bg-background/80 border border-border shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
