import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const { errorPayload, installationId, path } = data;
  const timestamp = new Date().toISOString();

  try {
    await sql`INSERT INTO Errors (title, code, message, details, stackTrace, timestamp, installationId, path) VALUES (${errorPayload.title}, ${errorPayload.code}, ${errorPayload.message}, ${errorPayload.details}, ${errorPayload.stackTrace}, ${timestamp}, ${installationId}, ${path});`;
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return Response.json(data);
}
