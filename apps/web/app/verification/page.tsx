"use client";
import { UserButton, useUser } from "@clerk/nextjs";
import { redirect } from "next/navigation";

export default function Verification() {
  const { user } = useUser();
  const isVerified = user?.publicMetadata?.verified;
  if (isVerified) {
    redirect("/");
  }

  return (
    <main className="flex justify-between p-12">
      <div>
        <h2 className="text-3xl font-bold">User Unverified</h2>
        <p>Please contact the site administrator to be verified.</p>
      </div>

      <UserButton afterSignOutUrl="/" />
    </main>
  );
}
