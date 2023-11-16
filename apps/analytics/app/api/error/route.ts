import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import type { ErrorPayload } from "@codaco/analytics";

export async function POST(request: NextRequest) {
  const data = await request.json();
  const error: ErrorPayload = data;

  const timestamp = error.timestamp || new Date().toISOString();

  try {
    await sql`INSERT INTO Errors (code, message, details, stacktrace, timestamp, installationid, path) VALUES (${error.code}, ${error.message}, ${error.details}, ${error.stacktrace}, ${timestamp}, ${error.installationid}, ${error.path});`;
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return Response.json(data);
}
