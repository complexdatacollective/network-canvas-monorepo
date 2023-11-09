import { DialogButton } from "@/components/DialogButton";
import type { Error } from "@/db/types";

export function StackTraceDialog({ error }: { error: Error }) {
  return (
    <DialogButton
      buttonLabel="Stack Trace"
      title="Stack Trace"
      description={error.message}
      content={error.stacktrace}
    />
  );
}
