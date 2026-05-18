import { GITHUB_REPO, type GitHubStats } from "@/lib/github";
import {
  formatRelativeReleaseDate,
  truncateSha256,
} from "@/lib/format-release";
import { DownloadRowLink } from "@/components/download-row-link";

interface DownloadsSectionProps {
  stats: GitHubStats;
}

const TABLE_COLS =
  "grid w-full grid-cols-[2.75rem_3.25rem_minmax(3.75rem,1fr)_1rem] items-center gap-x-4";

export function DownloadsSection({ stats }: DownloadsSectionProps) {
  const versionLabel = stats.latestRelease ? `v${stats.latestRelease}` : "—";
  const releasedLabel = formatRelativeReleaseDate(stats.releasePublishedAt);
  const releaseUrl = stats.latestRelease
    ? `${GITHUB_REPO}/releases/tag/v${stats.latestRelease}`
    : `${GITHUB_REPO}/releases`;

  return (
    <section
      id="downloads"
      className="relative scroll-mt-6 border-t border-white/10 bg-black px-6 py-24 md:px-10 md:py-32 lg:px-12 xl:px-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/3 to-transparent"
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 text-sm font-medium tracking-wide text-white/50 uppercase">
            Downloads
          </p>
          <h2 className="mb-5 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
            Pick your platform
          </h2>
          <p className="text-lg leading-relaxed text-white/65 md:text-xl">
            Available on Windows, macOS, and Linux. Free forever.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 md:gap-8">
          {stats.platforms.map((platform) => (
            <div
              key={platform.id}
              className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/3 p-6 backdrop-blur-sm transition-colors hover:border-white/15 hover:bg-white/5 sm:p-8"
            >
              <div className="mb-6 border-b border-white/10 pb-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">
                    {platform.label}
                  </h3>
                  {platform.id === "windows" ? (
                    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/65">
                      auto-update enabled
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-white/50">
                  {releasedLabel}
                  <span className="mx-2 text-white/25">·</span>
                  {versionLabel}
                </p>
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className={`${TABLE_COLS} border-b border-white/10 pb-3 text-left text-xs font-medium tracking-wide text-white/45 uppercase`}
                >
                  <span className="min-w-0">Arch</span>
                  <span className="min-w-0">Format</span>
                  <span className="min-w-0">Size</span>
                  <span></span>
                </div>

                <ul>
                  {platform.rows.map((row) => (
                    <li
                      key={`${row.format}-${row.architecture}-${row.url}`}
                      className={`${TABLE_COLS} items-center border-b border-white/6 py-3.5 text-left text-sm last:border-b-0`}
                    >
                      <span className="min-w-0 text-white/85">{row.architecture}</span>
                      <span className="min-w-0 text-white/60">{row.format}</span>
                      <span className="truncate text-white/60 tabular-nums">
                        {row.sizeLabel}
                      </span>
                      <DownloadRowLink
                        platformId={platform.id}
                        platformLabel={platform.label}
                        format={row.format}
                        architecture={row.architecture}
                        url={row.url}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
