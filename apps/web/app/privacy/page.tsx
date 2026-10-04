import type { Metadata } from "next";
import { PulseField } from "@/components/ambient/pulse-field";
import { Wordmark } from "@/components/ambient/wordmark";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Pulse collects, why, who processes it, how long it is kept, and how to delete it.",
};

// Shown to the public.
const CONTACT = "gavinmo@umich.edu";
const UPDATED = "October 3, 2026";

export default function Privacy() {
  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <PulseField intensity="ambient" bpm={64} origin="top-left" className="-z-10 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <Wordmark />
      <main id="main" className="mt-8 max-w-[72ch] space-y-8 rounded-lg border border-border bg-card p-6 text-base md:p-10 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_section]:border-t [&_section]:border-border [&_section]:pt-8 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        <header>
          <h1 className="text-4xl">Privacy policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>
          <p className="mt-4">
            Pulse is a personal health assistant built for MHacks 2026. It reads data you choose to connect,
            looks for changes that matter to you, and talks to you in iMessage and on the web. This page says
            what it collects and what happens to it. Pulse gives wellness guidance, not medical advice, and is
            not a medical device.
          </p>
        </header>

        <section>
          <h2>What Pulse collects</h2>
          <ul>
            <li>
              <strong>Account and profile:</strong> your name, email, age, sex, height, weight, time zone,
              phone number if you add one, and the focus areas you pick.
            </li>
            <li>
              <strong>Health records (optional):</strong> conditions, medications, allergies, and lab results,
              either typed in by you or read from your health system through FinchNode after you approve it.
              Family history is only what you tell us.
            </li>
            <li>
              <strong>Wearable data (optional):</strong> heart rate, resting heart rate, heart rate
              variability, blood oxygen, steps, active minutes, and sleep, from Fitbit through Google Health.
              A demo mode can generate simulated watch data instead.
            </li>
            <li>
              <strong>Calendar (required for the plan):</strong> event times and titles from your Google
              Calendar, used to find free time. Pulse writes its own events to a separate &quot;Pulse
              Health&quot; calendar.
            </li>
            <li>
              <strong>Messages:</strong> what you and Pulse say to each other in iMessage, ASI:One, or the web.
            </li>
          </ul>
        </section>

        <section>
          <h2>What it is used for</h2>
          <p>
            To build a profile of your normal ranges, send you alerts and briefings, plan your day around your
            calendar, and answer your questions. Pulse does not sell your data, show ads, or use it to train
            models.
          </p>
        </section>

        <section>
          <h2>Your permission</h2>
          <ul>
            <li>Connecting Google Calendar, Fitbit, or a health system is your choice, and each asks you to approve access.</li>
            <li>Pulse only reads these. It never changes your wearable or health records.</li>
            <li>
              Pulse changes your calendar only in its own &quot;Pulse Health&quot; calendar, and moves anything
              on your main calendar only after you approve it.
            </li>
            <li>
              Health records from FinchNode are shared under a separate consent that you can revoke at any
              time in FinchNode. When you do, Pulse stops reading and removes the records it copied.
            </li>
          </ul>
        </section>

        <section>
          <h2>Who handles your data</h2>
          <p>Pulse uses these services to run. Each receives only what it needs for its part.</p>
          <ul>
            <li>Neon (database): profile, health history, goals, alerts, messages, and encrypted connection tokens.</li>
            <li>SpacetimeDB: recent wearable readings. Raw readings are kept 48 hours and per-minute summaries 30 days.</li>
            <li>Vercel and Railway: hosting for the web app and the agent.</li>
            <li>Google: Calendar, Google Health (Fitbit) data, and the Gemini model that writes replies from the facts Pulse gives it.</li>
            <li>FinchNode: the connector that reads your health records, if you use it.</li>
            <li>Photon and Fetch.ai (ASI:One): delivering your messages over iMessage and ASI:One.</li>
          </ul>
          <p className="mt-2">
            Google access tokens are stored encrypted. Pulse&apos;s use of information received from Google
            APIs follows the Google API Services User Data Policy, including its Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>How long it is kept, and deleting it</h2>
          <ul>
            <li>Your data is kept while your account exists.</li>
            <li>
              You can ask us to delete your account data at any time by emailing {CONTACT}. We remove your
              records, remove Pulse events from your calendar, and revoke the Google connections.
            </li>
            <li>You can also revoke access yourself in your Google account and in FinchNode.</li>
            <li>Simulated and sample patient data is fictional and is not a real person&apos;s record.</li>
          </ul>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Connection tokens are encrypted, traffic uses HTTPS, and the agent only accepts requests from
            Pulse&apos;s own services. This is a hackathon project, so it has not had a formal security audit.
            Pulse is not covered by HIPAA, and you should not rely on it in an emergency. If you think you are
            having one, call your local emergency number.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>Questions or deletion requests: {CONTACT}.</p>
        </section>
      </main>
      <SiteFooter className="py-6" />
      </div>
    </div>
  );
}
