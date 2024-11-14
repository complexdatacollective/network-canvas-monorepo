import { clerkClient } from '@clerk/nextjs/server';
import { type NextRequest, NextResponse } from 'next/server';
import z from 'zod';

const clerkPayloadSchema = z.object({
  verified: z.boolean(),
  userId: z.string(),
});

export async function POST(request: NextRequest) {
  const payload: unknown = await request.json();

  const parsedPayload = clerkPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: 'Invalid clerk payload' },
      { status: 400 },
    );
  }

  const { verified, userId } = parsedPayload.data;

  const client = await clerkClient();

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      verified,
    },
  });

  return NextResponse.json({ success: true });
}
