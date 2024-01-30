import { type DispatchableAnalyticsEvent } from "@codaco/analytics";
import { NextRequest, NextResponse } from "next/server";
import { type EventInsertType } from "~/db/db";
import insertEvent from "~/db/insertEvent";
import z from "zod";

export const eventTypes = [
  "AppSetup",
  "ProtocolInstalled",
  "InterviewStarted",
  "InterviewCompleted",
  "InterviewCompleted",
  "DataExported",
  "Error",
] as const;

export type EventType = (typeof eventTypes)[number];

export const EventsSchema = z.object({
  type: z.enum(eventTypes),
  installationId: z.string(),
  timestamp: z.date(),
  isocode: z.string().optional(),
  message: z.string().optional(),
  name: z.string().optional(),
  stack: z.string().optional(),
  metadata: z
    .object({
      details: z.string(),
      path: z.string(),
    })
    .optional(),
});

export type Event = z.infer<typeof EventsSchema>;

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
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const result = await insertEvent(parsedEvent.data);
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
