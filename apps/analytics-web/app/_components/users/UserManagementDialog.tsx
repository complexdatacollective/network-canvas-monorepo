import { Users as UsersIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import VerifiedUsersTable from "./UsersTable/UsersTable";

export default function UserManagementDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon" className="mr-4">
					<UsersIcon />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>User Management</DialogTitle>
				</DialogHeader>
				<DialogDescription>View and manage verified users</DialogDescription>
				<VerifiedUsersTable />
			</DialogContent>
		</Dialog>
	);
}
