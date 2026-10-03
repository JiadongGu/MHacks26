import Link from "next/link";
import { AuthView } from "@neondatabase/auth-ui";
import { authViewPaths } from "@neondatabase/auth-ui/server";
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
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 md:px-8">
      <header className="flex h-16 items-center">
        <Link href="/" className="font-heading text-xl font-medium tracking-tight">
          Pulse
        </Link>
      </header>
      <main
        id="main"
        className="grid flex-1 items-center gap-12 py-8 md:grid-cols-[5fr_6fr] md:gap-16"
      >
        <p className="hidden max-w-[32ch] font-heading text-3xl md:block">
          A health agent that texts you first.
        </p>
        <div className="flex justify-center md:justify-start">
          <AuthView path={path} />
        </div>
      </main>
      <SiteFooter className="py-6" />
    </div>
  );
}
