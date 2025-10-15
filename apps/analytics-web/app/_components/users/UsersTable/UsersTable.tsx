import { clerkClient } from "@clerk/nextjs/server";
import { DataTable } from "~/components/DataTable/data-table";
import { columns } from "./Columns";

export default async function VerifiedUsersTable() {
	const client = await clerkClient();
	const clerkUsers = await client.users.getUserList();

	const users = clerkUsers.data.map((user) => {
		return {
			id: user.id,
			fullName: `${user.firstName} ${user.lastName}`,
			username: user.username,
			verified: Boolean(user.publicMetadata.verified),
		};
	});

	return <DataTable columns={columns} data={users} />;
}
