import { Button } from "@/components/ui/button";
import { ArrowUpRight, GitBranch } from "lucide-react";

const GITHUB_REPO = "https://github.com/wuon/openanime";

const waysToHelp = [
  "Fix bugs and polish the UI",
  "Ship new features and providers",
  "Improve docs and onboarding",
];

export function ContributeCta() {
  return (
    <section className="relative border-t border-white/10 bg-black px-6 py-24 md:px-10 md:py-32 lg:px-12 xl:px-16">
      <div className="relative mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/3 p-10 md:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 right-0 size-64 rounded-full bg-white/5 blur-3xl"
          />

          <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="mb-3 text-sm font-medium tracking-wide text-white/50 uppercase">
                Open source
              </p>
              <h2 className="mb-5 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
                Help build Openanime
              </h2>
              <p className="mb-8 text-lg leading-relaxed text-white/65">
                Openanime is community-driven. Whether you write code, design
                screens, or report issues—contributions keep the app free and
                ad-free for everyone.
              </p>

              <ul className="space-y-3">
                {waysToHelp.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-white/70"
                  >
                    <GitBranch
                      className="mt-0.5 size-4 shrink-0 text-white/45"
                      strokeWidth={1.75}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
              <Button
                size="lg"
                className="h-12 gap-2 rounded-full px-6 text-base"
                asChild
              >
                <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                  View on GitHub
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 gap-2 rounded-full border-white/20 bg-white/5 px-6 text-base text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <a
                  href={`${GITHUB_REPO}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Browse issues
                  <ArrowUpRight className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
