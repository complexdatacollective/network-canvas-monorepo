import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import type { EventPayload } from "@codaco/analytics";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const event: EventPayload = data;
  const timestamp = event.timestamp || new Date().toISOString();

  try {
    await sql`INSERT INTO Events (event, metadata, timestamp, installationid, isocode) VALUES ( ${event.type}, ${event.metadata}, ${timestamp}, ${event.installationid}, ${event.isoCode});`;
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return Response.json(data);
}
