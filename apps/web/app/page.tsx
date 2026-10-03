import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

const THREAD = [
  {
    from: "pulse",
    time: "7:42 AM",
    text: "Your resting heart rate is 8 bpm above your 30-day baseline. You slept 5 h 40 min. Your 3 pm run is on the calendar.",
  },
  {
    from: "pulse",
    time: "7:42 AM",
    text: "I can move the run to tomorrow and block 10 pm tonight for sleep. Approve?",
  },
  { from: "you", time: "7:44 AM", text: "Yes, do it." },
  { from: "pulse", time: "7:44 AM", text: "Done. Both events are on your calendar." },
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 md:px-8">
      <header className="flex h-16 items-center justify-between">
        <span className="font-heading text-xl font-medium tracking-tight">Pulse</span>
        <Link
          href="/auth/sign-in"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Sign in
        </Link>
      </header>

      <main
        id="main"
        className="grid flex-1 items-center gap-12 py-12 md:grid-cols-[7fr_5fr] md:gap-16 md:py-16"
      >
        <section>
          <h1 className="text-5xl">Pulse — your health agent in iMessage</h1>
          <p className="mt-6 max-w-[56ch] text-base text-muted-foreground">
            Pulse reads your watch data and knows your health history. It
            texts you when something needs attention. When you say yes, it
            moves your calendar for you.
          </p>
          <div className="mt-8 flex items-center gap-6">
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <Link href="/auth/sign-up">Sign up</Link>
            </Button>
            <Link
              href="/auth/sign-in"
              className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
            >
              I have an account
            </Link>
          </div>
        </section>

        <figure aria-label="Example iMessage conversation with Pulse" className="md:pl-4">
          <ol className="flex flex-col gap-3">
            {THREAD.map((m, i) => (
              <li
                key={i}
                className={
                  m.from === "you"
                    ? "ml-auto max-w-[85%] rounded-lg bg-secondary px-4 py-3"
                    : "mr-auto max-w-[85%] rounded-lg border border-border px-4 py-3"
                }
              >
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {m.from === "you" ? "You" : "Pulse"}{" "}
                  <span className="font-mono">{m.time}</span>
                </p>
                <p className="text-sm">{m.text}</p>
              </li>
            ))}
          </ol>
          <figcaption className="mt-4 text-xs text-muted-foreground">
            Example conversation. Not real data.
          </figcaption>
        </figure>
      </main>

      <SiteFooter className="py-6" />
    </div>
  );
}
