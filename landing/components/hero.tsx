import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MacDownloadButton } from "@/components/mac-download-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { GitHubStats } from "@/lib/github";
import { formatCount } from "@/lib/github";
import Link from "next/link";

const GITHUB_REPO = "https://github.com/wuon/openanime";

interface HeroProps {
  stats: GitHubStats;
}

export function Hero({ stats }: HeroProps) {
  const macDownloadUrl =
    stats.downloadLinks.mac ??
    (stats.latestRelease
      ? `${GITHUB_REPO}/releases/download/v${stats.latestRelease}/Openanime-darwin-arm64-${stats.latestRelease}.zip`
      : `${GITHUB_REPO}/releases`);
  const windowsDownloadUrl =
    stats.downloadLinks.windows ?? `${GITHUB_REPO}/releases`;

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-12 lg:px-20 py-6">
        <div className="flex items-center gap-3">
          <div className="relative size-10 shrink-0">
            <Image
              src="/logo-dark.svg"
              alt=""
              width={40}
              height={40}
              className="size-10 object-contain dark:hidden"
            />
            <Image
              src="/logo-light.svg"
              alt=""
              width={40}
              height={40}
              className="hidden size-10 object-contain dark:block"
            />
          </div>
          <span className="font-sans text-xl font-semibold tracking-tight text-foreground">
            Openanime
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            className="relative overflow-hidden rounded-full font-medium
        transition-all duration-300 ease-out will-change-transform
        bg-foreground/5 text-foreground hover:bg-foreground/10 backdrop-blur-xl border border-foreground/10 hover:border-foreground/20
        px-6 py-2.5 text-sm"
            asChild
          >
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
              <span className="hidden sm:inline text-sm">GitHub</span>
              <ExternalLink className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row items-center px-6 md:px-12 lg:px-20 py-12 lg:py-0 gap-12 lg:gap-16">
        {/* Left Column - Text Content */}
        <div className="flex-1 flex flex-col justify-center max-w-2xl">
          {/* Title */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.1] mb-6 text-balance">
            Anime streaming
            <br />
            <span className="text-muted-foreground">
              with a modern desktop UI
            </span>
          </h1>

          {/* Description */}
          <p className="text-muted-foreground text-lg md:text-xl leading-relaxed mb-10 max-w-lg">
            Browse your favorite anime, binge entire series, and stay up to date
            with the latest releases—all in a clean, simple app built for anime
            fans.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <MacDownloadButton
              downloadUrl={macDownloadUrl}
              isDirectDownload={
                !!stats.downloadLinks.mac || !!stats.latestRelease
              }
            />
            <Button
              size="lg"
              className="rounded-full gap-2 px-6 h-12 text-base cursor-pointer"
              asChild
            >
              <Link
                href={windowsDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download for Windows
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8 mt-12 pt-8 border-t border-border/50">
            <div>
              <div className="text-2xl font-semibold">
                {stats.downloads > 0 ? `${formatCount(stats.downloads)}+` : "—"}
              </div>
              <div className="text-sm text-muted-foreground">Downloads</div>
            </div>
            <a
              href={`${GITHUB_REPO}/stargazers`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="text-2xl font-semibold">
                {stats.stars > 0 ? `${formatCount(stats.stars)}+` : "—"}
              </div>
              <div className="text-sm">GitHub Stars</div>
            </a>
            <a
              href={`${GITHUB_REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="text-2xl font-semibold">
                {stats.latestRelease ? `v${stats.latestRelease}` : "—"}
              </div>
              <div className="text-sm">Latest Release</div>
            </a>
          </div>
        </div>

        {/* Right Column - Video/Media */}
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="relative w-full aspect-video max-w-4xl rounded-2xl bg-secondary/30 overflow-hidden shadow-2xl shadow-black/20">
            {/* Video element - autoplays */}
            <video
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            >
              <source src="/demo.mp4" type="video/mp4" />
            </video>

            {/* Subtle inner glow */}
            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-border/50 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
