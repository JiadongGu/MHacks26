import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import { FitbitStatusCard } from "@/components/onboarding/fitbit-status";
import { GoogleStatusCard } from "@/components/onboarding/google-status";
import { PageHeader } from "@/components/page-header";
import { ReturnToast } from "@/components/settings/return-toast";
import { MetricToggles } from "@/components/settings/metric-toggles";
import { SettingsForm } from "@/components/settings/settings-form";
import { ErrorNote, Group } from "@/components/ui-bits";
import { cleanHidden } from "@/lib/metrics";
import { getProfile } from "@/lib/queries";
import { parseQuietHours } from "@/lib/quiet-hours";
import { ONBOARDING_DONE_STEP, requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

type Params = Promise<{ google?: string; fitbit?: string }>;

export default async function SettingsPage({ searchParams }: { searchParams: Params }) {
  const user = await requireUser();
  const { google, fitbit } = await searchParams;

  let profile;
  let failed = false;
  try {
    profile = await getProfile(user.id);
  } catch (err) {
    console.error("SettingsPage failed", err);
    failed = true;
  }
  const unfinished = !failed && (profile?.onboarding_step ?? 0) < ONBOARDING_DONE_STEP;
  const quiet = parseQuietHours(profile?.quiet_hours);

  return (
    <>
      {google && <ReturnToast provider="google" result={google} />}
      {fitbit && <ReturnToast provider="fitbit" result={fitbit} />}

      <PageHeader eyebrow="Preferences" title="Settings">
        Connections, sleep schedule, and quiet hours.
      </PageHeader>

      {unfinished && (
        <p className="mb-6 max-w-2xl rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Setup is not finished.{" "}
          <Link href="/onboarding" className="font-medium text-sidebar-accent-foreground underline underline-offset-4">
            Go back to setup
          </Link>
        </p>
      )}

      <div className="max-w-2xl space-y-8">
        <Group title="Connections" id="s-connections-title" index={0}>
          <div className="px-4 py-3">
            <GoogleStatusCard />
          </div>
          <div className="px-4 py-3">
            <FitbitStatusCard />
          </div>
          <Link
            href="/onboarding"
            className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/70">
                <ListChecks className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold">Apple Watch simulator and iMessage</span>
                <span className="block text-muted-foreground">Open setup</span>
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Group>

        {failed ? (
          <ErrorNote>Could not load your settings. Reload the page to try again.</ErrorNote>
        ) : (
          <>
            {!profile && (
              <p className="max-w-[60ch] text-sm text-muted-foreground">
                You have no profile yet. Finish step 1 of setup to edit these fields.
              </p>
            )}
            <SettingsForm
              disabled={!profile}
              initial={{
                timezone: profile?.timezone ?? "",
                wake_time: profile?.wake_time?.slice(0, 5) ?? "",
                bed_time: profile?.bed_time?.slice(0, 5) ?? "",
                quiet_start: quiet?.start ?? "",
                quiet_end: quiet?.end ?? "",
              }}
            />
          </>
        )}

        <MetricToggles hidden={cleanHidden(profile?.hidden_metrics ?? [])} disabled={!profile} />
      </div>
    </>
  );
}
