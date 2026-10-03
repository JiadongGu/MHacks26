import { NextResponse } from "next/server";
import { withUser } from "@/lib/me-route";
import { listPendingProposals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) =>
    NextResponse.json({ proposals: await listPendingProposals(user.id) }),
  );
}
