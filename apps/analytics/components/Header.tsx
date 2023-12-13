import { UserButton } from "@clerk/nextjs";
import UserManagementDialog from "~/app/_components/users/UserManagementDialog";

export default function Header() {
  return (
    <div className="sticky top-0 z-40 flex justify-end h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm py-10">
      <UserManagementDialog />
      <UserButton />
    </div>
  );
}
