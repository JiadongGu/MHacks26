"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { advanceStepAction } from "@/app/(app)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StepConnect } from "./step-connect";
import { StepFinish } from "./step-finish";
import { StepGoals } from "./step-goals";
import { EMPTY_HISTORY, type HistoryState } from "./history-seed";
import { StepHistory } from "./step-history";
import { StepProfile } from "./step-profile";
import { LAST_STEP, STEPS, type ProfileInput } from "./types";

const BLURB: Record<number, string> = {
  1: "Pulse needs the basics to read your numbers in context.",
  2: "Connect your health record, or tell Pulse about your conditions, medications, and allergies.",
  3: "Connect your calendar so Pulse can plan around it. Add a watch for live health data.",
  4: "Pick up to three things to work on. Pulse plans them into your free time.",
  5: "Link your messages if you like, then Pulse builds your twin and opens your dashboard.",
};

type Props = {
  initialStep: number;
  /** Highest step the user has reached. A finished user has reached the last step. */
  highestStep: number;
  complete: boolean;
  profile: ProfileInput;
  /** Saved health history, so a returning user does not start step 2 from empty. */
  initialHistory?: HistoryState;
  /** True when the person just came back from FinchNode Connect. */
  finchnodeReturned?: boolean;
  photonNumber: string | null;
  imessageLinked: boolean;
};

export function OnboardingFlow({
  initialStep,
  highestStep,
  complete,
  profile,
  initialHistory = EMPTY_HISTORY,
  photonNumber,
  imessageLinked,
  finchnodeReturned = false,
}: Props) {
  const [step, setStep] = useState(initialStep);
  const [highest, setHighest] = useState(highestStep);
  const [saving, setSaving] = useState(false);
  const [profileState, setProfileState] = useState<ProfileInput>(profile);
  const [history, setHistory] = useState<HistoryState>(initialHistory);
  const [simulate, setSimulate] = useState(false);
  const [, setLinked] = useState(imessageLinked);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // Move focus to the step heading after a step change. Skip the first render.
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const goTo = useCallback(
    async (n: number) => {
      if (n > highest) {
        setSaving(true);
        const res = await advanceStepAction(n);
        setSaving(false);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setHighest(n);
      }
      setStep(n);
    },
    [highest],
  );

  const next = () => void goTo(Math.min(LAST_STEP, step + 1));
  const back = () => setStep(Math.max(1, step - 1));
  const markLinked = useCallback(() => setLinked(true), []);

  const current = STEPS[step - 1];
  const optional = step === 3;

  return (
    <div className="grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-16">
      <nav aria-label="Setup steps">
        <p className="text-sm text-muted-foreground md:hidden">
          Step {step} of {LAST_STEP}: <span className="text-foreground">{current.label}</span>
        </p>
        <div
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted md:hidden"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={LAST_STEP}
          aria-valuenow={step}
        >
          <div className="h-full bg-foreground" style={{ width: `${(step / LAST_STEP) * 100}%` }} />
        </div>
        <ol className="hidden flex-col gap-1 md:flex">
          {STEPS.map((s) => {
            const reachable = s.id <= highest;
            const active = s.id === step;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={!reachable || saving}
                  aria-current={active ? "step" : undefined}
                  onClick={() => setStep(s.id)}
                  className={cn(
                    "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition-colors",
                    "hover:bg-muted disabled:pointer-events-none disabled:opacity-60",
                    active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full border font-mono text-xs",
                      s.id < highest || (s.id === highest && complete)
                        ? "border-foreground bg-foreground text-background"
                        : "border-border",
                    )}
                    aria-hidden="true"
                  >
                    {s.id}
                  </span>
                  {s.label}
                  {s.id < highest && <span className="sr-only"> (reached)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0">
        {complete && (
          <p className="mb-6 max-w-[60ch] rounded-lg border border-border px-4 py-3 text-sm">
            Setup is complete. You can change any step.{" "}
            <Link href="/dashboard" className="underline underline-offset-4">
              Back to the dashboard
            </Link>
          </p>
        )}
        <header className="mb-8 max-w-[60ch]">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Step {step} of {LAST_STEP}
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl outline-none">
            {current.label}
          </h1>
          <p className="mt-3 text-base text-muted-foreground">{BLURB[step]}</p>
        </header>

        {step === 1 && (
          <StepProfile
            initial={profileState}
            onSaved={(p) => {
              setProfileState(p);
              setHighest((h) => Math.max(h, 2));
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <StepHistory
            state={history}
            setState={setHistory}
            profile={profileState}
            onDone={next}
            returned={finchnodeReturned}
          />
        )}
        {step === 3 && <StepConnect simulate={simulate} setSimulate={setSimulate} />}
        {step === 4 && <StepGoals onDone={next} />}
        {step === 5 && (
          <StepFinish
            photonNumber={photonNumber}
            phone={profileState.phone_e164}
            alreadyLinked={imessageLinked}
            onLinked={markLinked}
          />
        )}

        {step > 1 && (
          <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-6">
            <Button variant="ghost" onClick={back} disabled={saving}>
              Back
            </Button>
            {optional && (
              <Button variant="outline" onClick={next} disabled={saving}>
                {saving ? "Saving..." : "Continue"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
