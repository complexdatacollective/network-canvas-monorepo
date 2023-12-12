import { DialogButton } from "~/components/DialogButton";
import type { ErrorPayload as Error } from "@codaco/analytics";

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
