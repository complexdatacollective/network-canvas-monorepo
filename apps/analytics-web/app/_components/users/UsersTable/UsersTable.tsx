import { DataTable } from '~/components/DataTable/data-table';
import { columns } from './Columns';
import { clerkClient } from '@clerk/nextjs/server';

export default async function VerifiedUsersTable() {
  const clerkUsers = await clerkClient.users.getUserList();

  const users = clerkUsers.data.map((user) => {
    return {
      id: user.id,
      fullName: user.firstName + ' ' + user.lastName,
      username: user.username,
      verified: !!user.publicMetadata.verified,
    };
  });

  return <DataTable columns={columns} data={users} />;
}
