import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import type { DispatchableAnalyticsEvent } from "@codaco/analytics";

export async function POST(request: NextRequest) {
  const data = await request.json();
  console.log(data);
  const event: DispatchableAnalyticsEvent = data;

  const timestamp = JSON.stringify(event.timestamp || new Date().toISOString());

  // determine if this is an error and push it to the errors table
  if (event.type === "Error") {
    const error = event.error;
    try {
      await sql`INSERT INTO Errors (code, message, details, stacktrace, timestamp, installationid, path) VALUES (${error.code}, ${error.message}, ${error.details}, ${error.stacktrace}, ${timestamp}, ${event.installationId}, ${error.path});`;
      return;
    } catch (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
  }

  // event is not an error
  // push the event to the events table

  try {
    await sql`INSERT INTO Events (type, metadata, timestamp, installationid, isocode) VALUES (${
      event.type
    }, ${JSON.stringify(event.metadata)}, ${timestamp}, ${
      event.installationId
    }, ${event.geolocation?.countryCode}
    });`;
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return Response.json(data);
}
