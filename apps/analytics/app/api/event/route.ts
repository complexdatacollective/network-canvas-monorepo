import { NextRequest, NextResponse } from "next/server";
import insertEvent from "~/db/insertEvent";
import { EventsSchema } from "@codaco/analytics";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const event = (await request.json()) as unknown;
  const parsedEvent = EventsSchema.safeParse(event);

  if (parsedEvent.success === false) {
    return NextResponse.json(
      { error: "Invalid event" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const result = await insertEvent({
      ...parsedEvent.data,
      timestamp: new Date(parsedEvent.data.timestamp),
      message: parsedEvent.data.error?.message,
      name: parsedEvent.data.error?.name,
      stack: parsedEvent.data.error?.stack,
    });
    if (result.error) throw new Error(result.error);

    return NextResponse.json({ event }, { status: 200, headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: "Error inserting events" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
