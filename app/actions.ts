"use server";
import { clerkClient } from "@clerk/nextjs";

export async function updateUserVerification(id: string, verified: boolean) {
  try {
    await clerkClient.users.updateUserMetadata(id, {
      publicMetadata: {
        verified: verified,
      },
    });
  } catch (error) {
    console.error(error);
  }
}