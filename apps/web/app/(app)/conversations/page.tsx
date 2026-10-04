import type { Metadata } from "next";
import { Suspense } from "react";
import { ConversationsSection } from "@/components/conversations/sections";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { zoneOrDefault } from "@/lib/calendar-week";
import { requireOnboarded } from "@/lib/session";

export const metadata: Metadata = { title: "Conversations" };
export const dynamic = "force-dynamic";

type Params = Promise<{ channel?: string | string[] }>;

function ConversationsSkeleton() {
  return (
    <div role="status" aria-label="Loading conversations" className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-80 w-full max-w-3xl" />
    </div>
  );
}

export default async function ConversationsPage({ searchParams }: { searchParams: Params }) {
  const { user, profile } = await requireOnboarded();
  const { channel } = await searchParams;
  const photonNumber = process.env.PHOTON_NUMBER_DISPLAY?.trim() || null;

  return (
    <>
      <PageHeader eyebrow="Inbox" title="Conversations" className="mb-8">
        Every message between you and Pulse, by channel. The open thread refreshes every 10 seconds.
      </PageHeader>
      <Suspense fallback={<ConversationsSkeleton />}>
        <ConversationsSection
          userId={user.id}
          channelParam={Array.isArray(channel) ? channel[0] : channel}
          timeZone={zoneOrDefault(profile.timezone)}
          photonNumber={photonNumber}
        />
      </Suspense>
    </>
  );
}
