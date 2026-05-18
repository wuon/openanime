"use client";

import { Button } from "@/components/ui/button";

const DOWNLOADS_SECTION_ID = "downloads";

export function scrollToDownloadsSection() {
  const target = document.getElementById(DOWNLOADS_SECTION_ID);
  if (!target) return;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  target.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });

  window.history.pushState(null, "", `#${DOWNLOADS_SECTION_ID}`);
}

export function ScrollToDownloadsButton() {
  return (
    <Button
      type="button"
      size="lg"
      className="h-12 cursor-pointer gap-2 rounded-full px-6 text-base"
      onClick={scrollToDownloadsSection}
    >
      Download
    </Button>
  );
}
