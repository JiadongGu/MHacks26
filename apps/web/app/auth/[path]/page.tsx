import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";
import { PulseField } from "@/components/ambient/pulse-field";
import { Wordmark } from "@/components/ambient/wordmark";
import { SiteFooter } from "@/components/site-footer";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <PulseField intensity="ambient" bpm={64} origin="center" className="-z-10" />
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 md:px-8">
        <header className="flex h-16 items-center">
          <Wordmark />
        </header>
        <main
          id="main"
          className="grid flex-1 items-center gap-12 py-8 md:grid-cols-[5fr_6fr] md:gap-16"
        >
          <div className="hidden md:block">
            <p className="max-w-[16ch] text-4xl font-bold tracking-tight text-balance">
              A health agent that texts you first.
            </p>
            <p className="mt-4 max-w-[34ch] text-base text-muted-foreground">
              Your vitals, your baseline and your calendar, in one place that asks before it acts.
            </p>
          </div>
          <div className="flex justify-center md:justify-start">
            <AuthView path={path} />
          </div>
        </main>
        <SiteFooter className="py-6" />
      </div>
    </div>
  );
}
