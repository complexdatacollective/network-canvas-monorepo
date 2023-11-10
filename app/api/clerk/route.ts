import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs";

export async function POST(request: NextRequest) {
  const { verified, userId } = await request.json();

  await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: {
      verified,
    },
  });

  return NextResponse.json({ success: true });
}
