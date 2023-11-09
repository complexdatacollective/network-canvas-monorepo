"use server";
import { clerkClient } from "@clerk/nextjs";

export async function updateUserVerification(id: string, verified: boolean) {
  console.log(verified);
  try {
    await clerkClient.users.updateUserMetadata(id, {
      publicMetadata: {
        verified,
      },
    });
  } catch (error) {
    console.log(error);
  }
}

export async function getVerificationStatus(id: string) {
  const user = await clerkClient.users.getUser(id);
  console.log(user);
}
