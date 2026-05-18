import { ContributeCta } from "@/components/contribute-cta";
import { DownloadsSection } from "@/components/downloads-section";
import { Hero } from "@/components/hero";
import { ScreenshotsSection } from "@/components/screenshots-section";
import { SiteFooter } from "@/components/site-footer";
import { WhyDesktop } from "@/components/why-desktop";
import { getGitHubStats } from "@/lib/github";

export default async function Home() {
  const stats = await getGitHubStats();

  return (
    <main className="relative">
      <Hero stats={stats} />
      <ScreenshotsSection />
      <WhyDesktop />
      <DownloadsSection stats={stats} />
      <ContributeCta />
      <SiteFooter />
    </main>
  );
}
