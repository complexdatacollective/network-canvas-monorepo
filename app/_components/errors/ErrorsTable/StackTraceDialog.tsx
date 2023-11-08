import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function StackTraceDialog({ stacktrace }: { stacktrace: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Stack Trace</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Stack Trace</DialogTitle>
        </DialogHeader>
        {stacktrace}
      </DialogContent>
    </Dialog>
  );
}
