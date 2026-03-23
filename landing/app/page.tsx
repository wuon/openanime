import { Hero } from "@/components/hero";
import { getGitHubStats } from "@/lib/github";

export default async function Home() {
  const stats = await getGitHubStats();

  return (
    <main className="relative min-h-screen bg-background overflow-hidden">
      <Hero stats={stats} />
    </main>
  );
}
