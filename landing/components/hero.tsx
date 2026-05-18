import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import type { GitHubStats } from "@/lib/github";
import { formatCount } from "@/lib/github";
import { ScrollToDownloadsButton } from "@/components/scroll-to-downloads-button";

const GITHUB_REPO = "https://github.com/wuon/openanime";

interface HeroProps {
  stats: GitHubStats;
}

export function Hero({ stats }: HeroProps) {
  return (
    <div className="relative z-10 flex min-h-screen flex-col text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <Image
          src="/hero-background-color.png"
          alt=""
          fill
          className="object-cover object-center"
          sizes="100vw"
          priority
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />
      </div>

      <header className="flex items-center justify-between px-6 py-6 md:px-10 lg:px-12 xl:px-16">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0">
            <Image
              src="/logo-light.svg"
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain"
            />
          </div>
          <span className="font-sans text-xl font-semibold tracking-tight">
            Openanime
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="relative overflow-hidden rounded-full border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-medium text-white backdrop-blur-xl transition-all duration-300 ease-out will-change-transform hover:border-white/30 hover:bg-white/15"
            asChild
          >
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
              <span className="hidden sm:inline text-sm">GitHub</span>
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-center px-6 py-10 md:px-10 lg:justify-end lg:px-12 lg:py-0 lg:pb-16 xl:px-16">
        <div className="flex w-full flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="max-w-2xl">
            <h1 className="mb-6 text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl md:text-6xl lg:text-7xl">
              Anime streaming
              <br />
              <span className="text-white/70">all in one clean app</span>
            </h1>

            <p className="mb-10 max-w-lg text-lg leading-relaxed text-white/75 md:text-xl">
              Browse your favorite anime, binge entire series, and stay up to
              date with the latest releases—all in a clean, simple app built for
              anime fans.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <ScrollToDownloadsButton />
            </div>
          </div>

          <div className="flex w-full items-center lg:w-auto lg:shrink-0 lg:self-end">
            <div>
              <div className="text-lg font-semibold md:text-xl">
                {stats.downloads > 0 ? `${formatCount(stats.downloads)}+` : "—"}
              </div>
              <div className="text-sm text-white/65">Downloads</div>
            </div>

            <div
              role="presentation"
              className="mx-6 h-10 w-px shrink-0 bg-white/25"
            />

            <a
              href={`${GITHUB_REPO}/stargazers`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/65 transition-colors hover:text-white"
            >
              <div className="text-lg font-semibold md:text-xl">
                {stats.stars > 0 ? `${formatCount(stats.stars)}+` : "—"}
              </div>
              <div className="text-sm">GitHub Stars</div>
            </a>

            <div
              role="presentation"
              className="mx-6 h-10 w-px shrink-0 bg-white/25"
            />

            <a
              href={`${GITHUB_REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/65 transition-colors hover:text-white"
            >
              <div className="text-lg font-semibold md:text-xl">
                {stats.latestRelease ? `v${stats.latestRelease}` : "—"}
              </div>
              <div className="text-sm">Latest Release</div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
