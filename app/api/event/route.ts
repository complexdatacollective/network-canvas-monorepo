import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function POST(request: NextRequest) {
  const data = await request.json();

  const { event, installationId } = data;

  try {
    await sql`INSERT INTO Events (event, installationId) VALUES ( ${event}, ${installationId});`;
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return Response.json(data);
}
