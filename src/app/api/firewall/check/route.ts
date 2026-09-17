import { NextRequest, NextResponse } from "next/server";
import { FirewallCheckRequestSchema } from "@/lib/schemas/firewall";
import { runFirewallCheck, UnderlyNotFoundError, UnderlyUpstreamError } from "@/lib/underly/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = FirewallCheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await runFirewallCheck(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof UnderlyNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof UnderlyUpstreamError) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Underly check failed" }, { status: 503 });
  }
}
