// Import necessary modules and types
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import type { DispatchableAnalyticsEvent } from "@codaco/analytics";

// Set headers to allow CORS
const headers = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Access-Control-Allow-Headers":
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
};

export async function POST(request: NextRequest) {
  const data = await request.json();
  const event: DispatchableAnalyticsEvent = data;

  const timestamp = JSON.stringify(event.timestamp || new Date().toISOString());

  // determine if this is an error and push it to the errors table
  if (event.type === "Error") {
    const errorPayload = event.error;
    try {
      await sql`INSERT INTO Errors (code, message, details, stacktrace, timestamp, installationid, path) VALUES (${errorPayload.code}, ${errorPayload.message}, ${errorPayload.details}, ${errorPayload.stacktrace}, ${timestamp}, ${event.installationId}, ${errorPayload.path});`;
      return new NextResponse(JSON.stringify({ errorPayload }), {
        headers,
        status: 200,
      });
    } catch (error) {
      return new NextResponse(JSON.stringify({ error }), {
        headers,
        status: 500,
      });
    }
  }

  // event is not an error
  // push the event to the events table

  try {
    await sql`INSERT INTO EVENTS (type, metadata, timestamp, installationid, isocode) VALUES(
      ${event.type},
      ${JSON.stringify(event.metadata)},
      ${timestamp},
      ${event.installationId},
      ${event.geolocation?.countryCode}
    );`;
    return new NextResponse(JSON.stringify({ event }), {
      headers,
      status: 200,
    });
  } catch (error) {
    return new NextResponse(JSON.stringify({ error }), {
      headers,
      status: 500,
    });
  }
}

// Preflight request
export async function OPTIONS() {
  return new NextResponse(null, {
    headers,
    status: 200,
  });
}
