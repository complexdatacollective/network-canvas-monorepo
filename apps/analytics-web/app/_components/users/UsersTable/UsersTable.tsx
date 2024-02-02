import { DataTable } from "~/components/DataTable/data-table";
import { columns } from "./Columns";
import { clerkClient } from "@clerk/nextjs";
import type { User } from "@clerk/nextjs/api";

export default async function VerifiedUsersTable() {
  const clerkUsers = await clerkClient.users.getUserList();

  const users = clerkUsers.map((user: User) => {
    return {
      id: user.id,
      fullName: user.firstName + " " + user.lastName,
      username: user.username,
      verified: user.publicMetadata.verified,
    };
  });

  return <DataTable columns={columns} data={users} />;
}
