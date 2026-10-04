import type { Metadata } from "next";
import Link from "next/link";
import { FitbitStatusCard } from "@/components/onboarding/fitbit-status";
import { GoogleStatusCard } from "@/components/onboarding/google-status";
import { PageHeader } from "@/components/page-header";
import { ReturnToast } from "@/components/settings/return-toast";
import { MetricToggles } from "@/components/settings/metric-toggles";
import { SettingsForm } from "@/components/settings/settings-form";
import { Section } from "@/components/ui-bits";
import { cleanHidden } from "@/lib/metrics";
import { ErrorNote } from "@/components/ui-bits";
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
        <p className="mb-12 max-w-[60ch] rounded-lg border border-border bg-card px-4 py-3 text-sm">
          Setup is not finished.{" "}
          <Link href="/onboarding" className="font-medium underline underline-offset-4">
            Go back to setup
          </Link>
        </p>
      )}

      <div className="max-w-3xl space-y-6">
        <Section title="Connections" headingId="s-connections">
          <h3 className="mb-2 text-sm font-medium">Google Calendar</h3>
          <GoogleStatusCard />
          <h3 className="mb-2 mt-8 text-sm font-medium">Fitbit</h3>
          <FitbitStatusCard />
          <p className="mt-6 text-sm text-muted-foreground">
            The Apple Watch simulator and iMessage are in{" "}
            <Link href="/onboarding" className="underline underline-offset-4 hover:text-foreground">
              setup
            </Link>
            .
          </p>
        </Section>

        <Section title="Schedule" headingId="s-schedule">
          {failed ? (
            <ErrorNote>Could not load your settings. Reload the page to try again.</ErrorNote>
          ) : (
            <>
              {!profile && (
                <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">
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
        </Section>

        <Section title="Dashboard" headingId="s-dashboard">
          <p className="mb-4 max-w-[60ch] text-sm text-muted-foreground">
            Pulse shows every number it has. Untick any you would rather not see.
          </p>
          <MetricToggles hidden={cleanHidden(profile?.hidden_metrics ?? [])} disabled={!profile} />
        </Section>
      </div>
    </>
  );
}
