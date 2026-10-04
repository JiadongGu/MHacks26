import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarCheck,
  Globe,
  Info,
  MessageCircle,
  MessageSquareText,
  Moon,
  Siren,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Watch,
  Wind,
} from "lucide-react";
import { EcgLine } from "@/components/ambient/ecg-line";
import { BeatingHeart, ParallaxLayer, ParallaxStage } from "@/components/ambient/parallax";
import { ApprovalCard, MetricCard, RangeBar, Spark, Status, ThreadCard } from "@/components/ambient/product-ui";
import { PulseField } from "@/components/ambient/pulse-field";
import { Reveal } from "@/components/ambient/reveal";
import { Wordmark } from "@/components/ambient/wordmark";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BPM = 64;
const wrap = "mx-auto w-full max-w-6xl px-4 md:px-8";

const STEPS = [
  { icon: Watch, title: "Connect", text: "Link your wearable, your calendar and, if you want, your health records. Each one asks for your approval." },
  { icon: Activity, title: "Learn", text: "Pulse builds a digital twin of your normal ranges, so it can tell a real change from a normal day." },
  { icon: MessageSquareText, title: "Alert", text: "A rules engine finds the change. Gemini words the message from those facts." },
  { icon: CalendarCheck, title: "Approve", text: "Reply YES in iMessage, ASI:One or the web. Only then does Pulse change your calendar." },
] as const;

const SAFETY = [
  {
    icon: Info,
    title: "Not a diagnosis",
    text: "Pulse gives wellness guidance. It does not diagnose or treat, and it does not replace your clinician.",
  },
  {
    icon: UserCheck,
    title: "You approve every change",
    text: "Pulse proposes and waits. Your main calendar stays as it is until you reply YES or tap Approve.",
  },
  {
    icon: Siren,
    title: "Emergency texts go to 911 guidance",
    text: "If a message sounds like an emergency, Pulse skips the usual reply. It tells you to call 911 or your local emergency number.",
  },
] as const;

const TILES = [
  { icon: Activity, color: "#FF2D55", label: "HRV", value: "48", unit: "ms", status: "normal", series: [44, 47, 45, 49, 46, 50, 48, 47, 49, 48] },
  { icon: Wind, color: "#32ADE6", label: "Blood oxygen", value: "97", unit: "%", status: "normal", series: [97, 96, 97, 98, 97, 97, 96, 97, 98, 97] },
  { icon: Moon, color: "#5E5CE6", label: "Sleep", value: "5 h 40", unit: "min", status: "borderline", series: [7.2, 7.0, 7.4, 6.8, 7.1, 6.5, 6.9, 6.2, 5.9, 5.7] },
] as const;

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-semibold tracking-wide text-muted-foreground uppercase", className)}>{children}</p>;
}

function Feature({
  title,
  text,
  className,
  children,
}: {
  title: string;
  text: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={cn("flex h-full flex-col gap-6 rounded-lg border border-border bg-card p-6", className)}>
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-[46ch] text-sm text-muted-foreground">{text}</p>
      </div>
      <div className="mt-auto">{children}</div>
    </article>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className={cn(wrap, "flex h-14 items-center gap-6")}>
          <Wordmark />
          <nav aria-label="Sections" className="ml-4 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="rounded-md hover:text-foreground">How it works</a>
            <a href="#features" className="rounded-md hover:text-foreground">Features</a>
            <a href="#safety" className="rounded-md hover:text-foreground">Safety</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" className="h-9 px-3">
              <Link href="/auth/sign-in">Sign in</Link>
            </Button>
            <Button asChild className="h-9 px-4">
              <Link href="/auth/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="relative isolate overflow-hidden">
          <PulseField
            intensity="hero"
            bpm={BPM}
            origin="top-right"
            className="-z-10 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
          />
          <ParallaxStage className={cn(wrap, "grid items-center gap-12 py-12 lg:grid-cols-[5fr_6fr] lg:gap-8 lg:py-24")}>
            <div>
              <Eyebrow className="flex items-center gap-2">
                <BeatingHeart>
                  <span className="block size-2 rounded-full bg-[#FF2D55]" aria-hidden="true" />
                </BeatingHeart>
                Personal health agent
              </Eyebrow>
              <h1 className="mt-4 text-[2.5rem] leading-[1.04] sm:text-6xl lg:text-[4.25rem]">
                A health agent that texts you first.
              </h1>
              <p className="mt-6 max-w-[44ch] text-lg text-muted-foreground">
                Pulse learns what is normal for you and messages you when something changes. It asks before it touches
                your calendar.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button asChild className="h-11 px-6 text-base">
                  <Link href="/auth/sign-up">
                    Get started
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <a href="#how" className="rounded-md text-sm font-medium underline underline-offset-4 hover:text-muted-foreground">
                  See how it works
                </a>
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                Works in iMessage, ASI:One and on the web. Wellness guidance, not medical advice.
              </p>
            </div>

            <div
              role="img"
              aria-label="Example: Pulse texts that resting heart rate is 8 bpm above baseline, you reply YES, and Pulse moves a run on your calendar."
              className="grid gap-4 sm:grid-cols-2 lg:relative lg:block lg:h-[580px]"
            >
              <ParallaxLayer depth={6} float="a" className="sm:col-span-2 lg:absolute lg:top-0 lg:left-0 lg:w-[330px]">
                <ThreadCard className="shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]" />
              </ParallaxLayer>
              <ParallaxLayer depth={14} float="b" className="lg:absolute lg:top-[40px] lg:right-0 lg:w-[250px]">
                <MetricCard className="shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]" />
              </ParallaxLayer>
              <ParallaxLayer depth={22} float="c" className="lg:absolute lg:right-[10%] lg:bottom-0 lg:w-[270px]">
                <ApprovalCard className="shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]" />
              </ParallaxLayer>
            </div>
          </ParallaxStage>
        </section>

        <section id="how" className="scroll-mt-14 border-y border-border bg-card">
          <div className={cn(wrap, "py-16 lg:py-24")}>
            <Reveal>
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 max-w-[22ch] text-3xl md:text-4xl">From a wearable reading to an approved plan.</h2>
            </Reveal>
            <ol className="mt-12 grid gap-8 lg:grid-cols-4 lg:gap-0">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <Reveal delay={i * 90} className="flex gap-4 lg:block">
                    <div className="flex shrink-0 items-center lg:mb-6">
                      <span className="grid size-11 place-items-center rounded-lg border border-border bg-background">
                        <s.icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
                      </span>
                      {i < STEPS.length - 1 && <span className="mx-3 hidden h-px flex-1 bg-border lg:block" aria-hidden="true" />}
                    </div>
                    <div className="lg:pr-8">
                      <p className="text-xs font-medium text-muted-foreground tabular-nums">0{i + 1}</p>
                      <h3 className="mt-1 text-xl font-semibold tracking-tight">{s.title}</h3>
                      <p className="mt-2 max-w-[38ch] text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={cn(wrap, "grid gap-10 py-16 lg:grid-cols-[4fr_8fr] lg:items-end lg:gap-14 lg:py-24")}>
          <Reveal>
            <Eyebrow>Vitals</Eyebrow>
            <h2 className="mt-3 text-3xl md:text-4xl">Your normal, not an average.</h2>
            <p className="mt-4 max-w-[40ch] text-base text-muted-foreground">
              Pulse compares each reading with your own history. An alert means a change for you.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <figure className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="bg-[#1C1C1E] text-white">
                <div className="flex items-start justify-between px-4 pt-4 md:px-6 md:pt-5">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-medium text-[#C7C7CC]">
                      <BeatingHeart>
                        <span className="block size-2 rounded-full bg-[#FF2D55]" aria-hidden="true" />
                      </BeatingHeart>
                      Heart rate
                    </p>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-5xl leading-none font-bold tracking-tight tabular-nums">{BPM}</span>
                      <span className="text-sm text-[#C7C7CC]">bpm</span>
                    </p>
                  </div>
                  <p className="text-xs text-[#C7C7CC]">Sample signal. Hover to read it.</p>
                </div>
                <EcgLine bpm={BPM} tone="dark" height={140} className="mt-2" />
              </div>
              <ul className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {TILES.map((t) => (
                  <li key={t.label} className="p-4 md:p-5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <t.icon className="size-3.5" style={{ color: t.color }} aria-hidden="true" />
                        {t.label}
                      </span>
                      <Status kind={t.status} />
                    </div>
                    <p className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight tabular-nums">{t.value}</span>
                      <span className="text-sm text-muted-foreground">{t.unit}</span>
                    </p>
                    <Spark points={[...t.series]} color={t.color} height={32} className="mt-3" />
                  </li>
                ))}
              </ul>
              <figcaption className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground md:px-5">
                Example data. Not from a real person.
              </figcaption>
            </figure>
          </Reveal>
        </section>

        <section id="features" className={cn(wrap, "scroll-mt-14 pb-16 lg:pb-24")}>
          <Reveal>
            <Eyebrow>Features</Eyebrow>
            <h2 className="mt-3 max-w-[24ch] text-3xl md:text-4xl">Quiet until it matters, clear when it does.</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 lg:grid-cols-12">
            <Reveal className="h-full lg:col-span-7" delay={0}>
              <Feature
                title="Alerts that explain themselves"
                text="Every alert carries a Why Pulse alerted you view. It lists the readings, your baseline and the rule that matched."
              >
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs font-semibold text-muted-foreground">Why Pulse alerted you</p>
                  <ul className="mt-3 divide-y divide-border text-sm">
                    <li className="flex items-center gap-3 py-2.5 first:pt-0">
                      <TrendingUp className="size-4 shrink-0 text-[#9A5400]" aria-hidden="true" />
                      <span className="flex-1">Resting heart rate</span>
                      <span className="tabular-nums">
                        <b className="font-semibold">71</b> <span className="text-muted-foreground">vs 63 baseline</span>
                      </span>
                    </li>
                    <li className="flex items-center gap-3 py-2.5">
                      <TrendingDown className="size-4 shrink-0 text-[#9A5400]" aria-hidden="true" />
                      <span className="flex-1">Sleep</span>
                      <span className="tabular-nums">
                        <b className="font-semibold">5 h 40</b> <span className="text-muted-foreground">vs 7 h 10 baseline</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-3 pt-2.5 pb-0 text-muted-foreground">
                      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>Rule matched: raised resting heart rate with short sleep. Gemini words the message from these facts.</span>
                    </li>
                  </ul>
                </div>
              </Feature>
            </Reveal>
            <Reveal className="h-full lg:col-span-5" delay={90}>
              <Feature
                title="A digital twin of your baseline"
                text="Pulse keeps a range for each of your signals and updates it as your habits change."
              >
                <div className="space-y-5">
                  <RangeBar label="Resting heart rate" value={71} unit="bpm" lo={58} hi={66} min={50} max={80} status="borderline" />
                  <RangeBar label="HRV" value={48} unit="ms" lo={40} hi={62} min={20} max={80} status="normal" />
                  <RangeBar label="Sleep" value={5.7} unit="h" lo={6.5} hi={8} min={4} max={10} status="borderline" />
                </div>
              </Feature>
            </Reveal>
            <Reveal className="h-full lg:col-span-5" delay={0}>
              <Feature
                title="Works where you already talk"
                text="Pulse answers in the channel you pick. The same history sits behind all three."
              >
                <ul className="divide-y divide-border text-sm">
                  {[
                    { icon: MessageCircle, name: "iMessage", text: "Alerts and replies in Messages." },
                    { icon: Sparkles, name: "ASI:One", text: "Ask Pulse from the ASI:One chat." },
                    { icon: Globe, name: "Web", text: "Dashboard, trends and the full alert history." },
                  ].map((c) => (
                    <li key={c.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                        <c.icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-auto text-right text-muted-foreground">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </Feature>
            </Reveal>
            <Reveal className="h-full lg:col-span-7" delay={90}>
              <Feature
                title="A calendar that asks first"
                text="Pulse writes its own events to a separate Pulse Health calendar. It moves anything on your main calendar only after you approve."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <ApprovalCard className="bg-background" />
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Moon className="size-3.5" aria-hidden="true" />
                      Added to Pulse Health
                    </p>
                    <p className="mt-2 text-sm font-semibold">Wind down</p>
                    <p className="mt-2 text-xs text-muted-foreground tabular-nums">Tonight 10:00 PM, 8 h before your alarm</p>
                    <p className="mt-3 text-xs text-muted-foreground">Your main calendar is not changed.</p>
                  </div>
                </div>
              </Feature>
            </Reveal>
          </div>
        </section>

        <section id="safety" className="scroll-mt-14 bg-[#1C1C1E] text-white">
          <div className={cn(wrap, "py-16 lg:py-24")}>
            <Reveal>
              <h2 className="max-w-[20ch] text-3xl md:text-4xl">Built to be careful with your health.</h2>
            </Reveal>
            <ul className="mt-12 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/15">
              {SAFETY.map((s, i) => (
                <li key={s.title} className="md:px-8 md:first:pl-0 md:last:pr-0">
                  <Reveal delay={i * 90}>
                    <s.icon className="size-6 text-white" strokeWidth={1.6} aria-hidden="true" />
                    <h3 className="mt-4 text-xl font-semibold tracking-tight">{s.title}</h3>
                    <p className="mt-2 max-w-[38ch] text-sm text-[#C7C7CC]">{s.text}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
            <p className="mt-12 text-sm">
              <Link href="/privacy" className="rounded-md text-white underline underline-offset-4 hover:text-[#C7C7CC]">
                Read the privacy policy
              </Link>
            </p>
          </div>
        </section>

        <section className={cn(wrap, "py-16 lg:py-24")}>
          <Reveal className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="max-w-[24ch] text-3xl md:text-4xl">Let Pulse learn your baseline.</h2>
              <p className="mt-3 max-w-[48ch] text-base text-muted-foreground">
                Connect a wearable and a calendar. Pulse starts with your own history.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button asChild className="h-11 px-6 text-base">
                <Link href="/auth/sign-up">Get started</Link>
              </Button>
              <Link href="/auth/sign-in" className="rounded-md text-sm font-medium underline underline-offset-4 hover:text-muted-foreground">
                I have an account
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter variant="full" className="bg-card" />
    </div>
  );
}
