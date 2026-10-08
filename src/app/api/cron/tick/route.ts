import { NextResponse, type NextRequest } from "next/server";
import { syncElections } from "@/lib/elections";

export const dynamic = "force-dynamic";

/** Optionaler Cron-Endpunkt: schaltet Wahlen zeitgesteuert um. Authorization: Bearer $CRON_SECRET */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new NextResponse("Unauthorized", { status: 401 });
  await syncElections();
  return NextResponse.json({ ok: true });
}
