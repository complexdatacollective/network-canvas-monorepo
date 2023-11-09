import { UserButton } from "@clerk/nextjs";

export default function Verification() {
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
