const GITHUB_API = "https://api.github.com";
const REPO = "wuon/openanime";
export const GITHUB_REPO = `https://github.com/${REPO}`;

export interface DownloadRow {
  architecture: string;
  format: string;
  sizeLabel: string;
  url: string;
  sha256: string | null;
}

export interface PlatformDownload {
  id: "windows" | "macos" | "linux";
  label: string;
  rows: DownloadRow[];
}

export interface GitHubStats {
  stars: number;
  downloads: number;
  latestRelease: string | null;
  releasePublishedAt: string | null;
  primarySha256: string | null;
  platforms: PlatformDownload[];
  downloadLinks: {
    mac: string | null;
    windows: string | null;
    linuxDeb: string | null;
    linuxRpm: string | null;
  };
}

interface ReleaseAsset {
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
  digest?: string;
}

interface Release {
  tag_name: string;
  published_at: string | null;
  assets: ReleaseAsset[];
}

function findAsset(
  assets: ReleaseAsset[],
  predicate: (asset: ReleaseAsset) => boolean,
): string | null {
  return assets.find(predicate)?.browser_download_url ?? null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

function parseDigest(digest?: string): string | null {
  if (!digest) return null;
  const match = digest.match(/^sha256:([a-f0-9]+)$/i);
  return match?.[1] ?? null;
}

function inferArch(name: string): string {
  if (/arm64|aarch64/i.test(name)) return "arm64";
  if (/x86_64|amd64|x64/i.test(name)) return "x64";
  return "x64";
}

function classifyAsset(asset: ReleaseAsset): {
  platform: PlatformDownload["id"];
  architecture: string;
  format: string;
} | null {
  const { name } = asset;

  if (/\.Setup\.exe$/i.test(name)) {
    return { platform: "windows", architecture: "x64", format: "EXE" };
  }
  if (/\.deb$/i.test(name)) {
    return { platform: "linux", architecture: inferArch(name), format: "DEB" };
  }
  if (/\.rpm$/i.test(name)) {
    return { platform: "linux", architecture: inferArch(name), format: "RPM" };
  }
  if (/\.zip$/i.test(name) && /(darwin|mac|osx)/i.test(name)) {
    return {
      platform: "macos",
      architecture: inferArch(name),
      format: "ZIP",
    };
  }

  return null;
}

function buildPlatforms(assets: ReleaseAsset[]): PlatformDownload[] {
  const grouped: Record<PlatformDownload["id"], DownloadRow[]> = {
    windows: [],
    macos: [],
    linux: [],
  };

  for (const asset of assets) {
    const meta = classifyAsset(asset);
    if (!meta) continue;

    grouped[meta.platform].push({
      architecture: meta.architecture,
      format: meta.format,
      sizeLabel: formatFileSize(asset.size),
      url: asset.browser_download_url,
      sha256: parseDigest(asset.digest),
    });
  }

  const order: PlatformDownload["id"][] = ["windows", "macos", "linux"];
  const labels: Record<PlatformDownload["id"], string> = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
  };

  return order
    .filter((id) => grouped[id].length > 0)
    .map((id) => ({
      id,
      label: labels[id],
      rows: grouped[id],
    }));
}

const FALLBACK_PLATFORMS: PlatformDownload[] = [
  {
    id: "windows",
    label: "Windows",
    rows: [
      {
        architecture: "x64",
        format: "EXE",
        sizeLabel: "—",
        url: `${GITHUB_REPO}/releases/download/v2.1.5-alpha/Openanime-2.1.5-alpha.Setup.exe`,
        sha256: null,
      },
    ],
  },
  {
    id: "macos",
    label: "macOS",
    rows: [
      {
        architecture: "arm64",
        format: "ZIP",
        sizeLabel: "—",
        url: `${GITHUB_REPO}/releases/download/v2.1.5-alpha/Openanime-darwin-arm64-2.1.5-alpha.zip`,
        sha256: null,
      },
    ],
  },
  {
    id: "linux",
    label: "Linux",
    rows: [
      {
        architecture: "x64",
        format: "DEB",
        sizeLabel: "—",
        url: `${GITHUB_REPO}/releases/download/v2.1.5-alpha/openanime_2.1.5.alpha_amd64.deb`,
        sha256: null,
      },
      {
        architecture: "x64",
        format: "RPM",
        sizeLabel: "—",
        url: `${GITHUB_REPO}/releases/download/v2.1.5-alpha/Openanime-2.1.5.alpha-1.x86_64.rpm`,
        sha256: null,
      },
    ],
  },
];

function emptyStats(): GitHubStats {
  return {
    stars: 0,
    downloads: 0,
    latestRelease: null,
    releasePublishedAt: null,
    primarySha256: null,
    platforms: FALLBACK_PLATFORMS,
    downloadLinks: {
      mac: null,
      windows: null,
      linuxDeb: null,
      linuxRpm: null,
    },
  };
}

export async function getGitHubStats(): Promise<GitHubStats> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };

  try {
    const [repoRes, releasesRes] = await Promise.all([
      fetch(`${GITHUB_API}/repos/${REPO}`, {
        headers,
        next: { revalidate: 3600 },
      }),
      fetch(`${GITHUB_API}/repos/${REPO}/releases`, {
        headers,
        next: { revalidate: 3600 },
      }),
    ]);

    if (!repoRes.ok) throw new Error("Failed to fetch repo");
    if (!releasesRes.ok) throw new Error("Failed to fetch releases");

    const [repo, releases] = await Promise.all([
      repoRes.json() as Promise<{ stargazers_count: number }>,
      releasesRes.json() as Promise<Release[]>,
    ]);

    const downloads = releases.reduce(
      (sum, r) => sum + r.assets.reduce((a, b) => a + b.download_count, 0),
      0,
    );

    const latest = releases[0];
    const latestRelease = latest
      ? latest.tag_name.replace(/^v/, "")
      : null;
    const latestAssets = latest?.assets ?? [];
    const platforms = buildPlatforms(latestAssets);
    const windowsExe = latestAssets.find((a) => /\.Setup\.exe$/i.test(a.name));

    return {
      stars: repo.stargazers_count,
      downloads,
      latestRelease,
      releasePublishedAt: latest?.published_at ?? null,
      primarySha256: parseDigest(windowsExe?.digest),
      platforms: platforms.length > 0 ? platforms : FALLBACK_PLATFORMS,
      downloadLinks: {
        mac: findAsset(
          latestAssets,
          (asset) =>
            /\.zip$/i.test(asset.name) && /(darwin|mac|osx)/i.test(asset.name),
        ),
        windows: findAsset(
          latestAssets,
          (asset) =>
            /\.exe$/i.test(asset.name) &&
            /(win|setup|squirrel)/i.test(asset.name),
        ),
        linuxDeb: findAsset(latestAssets, (asset) => /\.deb$/i.test(asset.name)),
        linuxRpm: findAsset(latestAssets, (asset) => /\.rpm$/i.test(asset.name)),
      },
    };
  } catch {
    return emptyStats();
  }
}

export { formatCount };
