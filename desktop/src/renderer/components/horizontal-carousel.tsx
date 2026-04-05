import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { Children, useCallback, useEffect, useRef, useState } from "react";

import { ShowCard, type ShowCardItem } from "@/renderer/components/show-grid";

export type HorizontalCarouselItem = ShowCardItem;

/** Same as `ShowCard` from `@/renderer/components/show-grid`. */
export const HorizontalCarouselCard = ShowCard;

type HorizontalCarouselProps = {
  /** How many fully-visible items to page by when clicking arrows. */
  pageSize?: number;
} & (
  | {
      items: HorizontalCarouselItem[];
      children?: undefined;
    }
  | {
      items?: undefined;
      /** Custom row (e.g. `EpisodeCard` with `layout="carousel"`). Each item should set `data-carousel-item`. */
      children: React.ReactNode;
    }
);

export function HorizontalCarousel({ items, children, pageSize = 6 }: HorizontalCarouselProps) {
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

  const itemCount = items?.length ?? Children.count(children);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState, itemCount]);

  return (
    <div className="relative">
      <div className="relative w-full">
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="flex gap-3 overflow-x-auto pb-2 scroll-smooth px-8 scrollbar-none -mx-8"
        >
          {items ? items.map((item) => <ShowCard key={item.id} item={item} />) : children}
        </div>

        {canScrollLeft && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollByPage("left")}
            className="absolute left-2 top-[calc(50%)] -translate-y-1/2 z-10 inline-flex h-12 w-8 items-center justify-center rounded-md bg-background/80 border border-border shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollByPage("right")}
            className="absolute right-2 top-[calc(50%)] -translate-y-1/2 z-10 inline-flex h-12 w-8 items-center justify-center rounded-md bg-background/80 border border-border shadow-sm backdrop-blur hover:bg-background transition-colors"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
