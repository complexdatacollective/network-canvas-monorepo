import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const { errorPayload, installationId, path } = data;

  try {
    await sql`INSERT INTO Errors (code, message, details, stackTrace, installationId, path) VALUES (${errorPayload.code}, ${errorPayload.message}, ${errorPayload.details}, ${errorPayload.stackTrace}, ${installationId}, ${path});`;
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return Response.json(data);
}
