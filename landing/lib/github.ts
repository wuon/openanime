const GITHUB_API = "https://api.github.com"
const REPO = "wuon/openanime"

export interface GitHubStats {
  stars: number
  downloads: number
  latestRelease: string | null
  downloadLinks: {
    mac: string | null
    windows: string | null
    linuxDeb: string | null
    linuxRpm: string | null
  }
}

interface ReleaseAsset {
  name: string
  download_count: number
  browser_download_url: string
}

function findAsset(
  assets: ReleaseAsset[],
  predicate: (asset: ReleaseAsset) => boolean
): string | null {
  return assets.find(predicate)?.browser_download_url ?? null
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export async function getGitHubStats(): Promise<GitHubStats> {
  const headers: HeadersInit = {
    "User-Agent": "openanime-landing",
    Accept: "application/vnd.github.v3+json",
  }

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
    ])

    if (!repoRes.ok) throw new Error("Failed to fetch repo")
    if (!releasesRes.ok) throw new Error("Failed to fetch releases")

    const [repo, releases] = await Promise.all([
      repoRes.json() as Promise<{ stargazers_count: number }>,
      releasesRes.json() as Promise<
        Array<{
          tag_name: string
          assets: ReleaseAsset[]
        }>
      >,
    ])

    const downloads = releases.reduce(
      (sum, r) =>
        sum + r.assets.reduce((a, b) => a + b.download_count, 0),
      0
    )

    const latestRelease =
      releases.length > 0 ? releases[0].tag_name.replace(/^v/, "") : null
    const latestAssets = releases[0]?.assets ?? []
    const downloadLinks = {
      mac: findAsset(
        latestAssets,
        (asset) => /\.zip$/i.test(asset.name) && /(darwin|mac|osx)/i.test(asset.name)
      ),
      windows: findAsset(
        latestAssets,
        (asset) => /\.exe$/i.test(asset.name) && /(win|setup|squirrel)/i.test(asset.name)
      ),
      linuxDeb: findAsset(latestAssets, (asset) => /\.deb$/i.test(asset.name)),
      linuxRpm: findAsset(latestAssets, (asset) => /\.rpm$/i.test(asset.name)),
    }

    return {
      stars: repo.stargazers_count,
      downloads,
      latestRelease,
      downloadLinks,
    }
  } catch {
    return {
      stars: 0,
      downloads: 0,
      latestRelease: null,
      downloadLinks: {
        mac: null,
        windows: null,
        linuxDeb: null,
        linuxRpm: null,
      },
    }
  }
}

export { formatCount }
