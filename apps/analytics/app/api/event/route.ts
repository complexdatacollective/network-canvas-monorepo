import { type DispatchableAnalyticsEvent } from "@codaco/analytics";
import { NextRequest, NextResponse } from "next/server";
import { type EventInsertType } from "~/db/db";
import insertEvent from "~/db/insertEvent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const event = (await request.json()) as DispatchableAnalyticsEvent;

  let generalEvent: EventInsertType = {
    type: event.type,
    metadata: event.metadata,
    timestamp: new Date(event.timestamp),
    installationId: event.installationId,
    isocode: event.geolocation?.countryCode,
  };

  if (event.type === "Error") {
    generalEvent = {
      ...generalEvent,
      message: event.error.message,
      name: event.error.name,
      stack: event.error.stack,
    };
  }

  try {
    const result = await insertEvent(generalEvent);
    if (result.error) throw new Error(result.error);

    return NextResponse.json({ event }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
