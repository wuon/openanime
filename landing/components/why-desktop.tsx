import { CloudOff, Monitor, Sparkles } from "lucide-react";

const reasons = [
  {
    icon: Monitor,
    title: "Runs on your computer",
    description:
      "Openanime is a native desktop app—not a website in a tab. Browse, search, and watch from an app built for your machine.",
  },
  {
    icon: CloudOff,
    title: "No servers to pay for",
    description:
      "We don't host streams or run expensive cloud infrastructure. Without recurring server bills, the project can stay lean and independent.",
  },
  {
    icon: Sparkles,
    title: "Stays ad-free",
    description:
      "Most streaming sites need ads to cover hosting costs. A desktop app sidesteps that—so you can watch without interruptions or paywalls.",
  },
];

export function WhyDesktop() {
  return (
    <section className="relative border-t border-white/10 bg-black px-6 py-24 md:px-10 md:py-32 lg:px-12 xl:px-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent"
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 text-sm font-medium tracking-wide text-white/50 uppercase">
            Why desktop?
          </p>
          <h2 className="mb-5 text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
            Built as a desktop app, on purpose
          </h2>
          <p className="text-lg leading-relaxed text-white/65 md:text-xl">
            Web streaming means servers, bandwidth, and bills—and that usually
            means ads. Openanime takes a different path: run locally, skip the
            infrastructure, and keep the experience clean.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 md:gap-8">
          {reasons.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm transition-colors hover:border-white/15 hover:bg-white/[0.05]"
            >
              <div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                <Icon className="size-5 text-white/80" strokeWidth={1.75} />
              </div>
              <h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>
              <p className="leading-relaxed text-white/60">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
