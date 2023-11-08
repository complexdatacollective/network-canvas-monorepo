import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Error } from "@/db/types";

export function StackTraceDialog({ error }: { error: Error }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Stack Trace</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stack Trace</DialogTitle>
        </DialogHeader>
        <DialogDescription>{error.message}</DialogDescription>
        <div className="bg-secondary p-2 rounded-sm">{error.stacktrace}</div>
      </DialogContent>
    </Dialog>
  );
}
