import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Users } from "lucide-react";
import UsersTable from "./UsersTable/UsersTable";

export default function UserManagementDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="mr-4">
          <Users />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verified Users</DialogTitle>
        </DialogHeader>
        <DialogDescription>View and manage verified users.</DialogDescription>
        <div className="max-w-md">
          <UsersTable />
        </div>
      </DialogContent>
    </Dialog>
  );
}
