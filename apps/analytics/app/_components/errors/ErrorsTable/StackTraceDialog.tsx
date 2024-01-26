import { DialogButton } from "~/components/DialogButton";
import { type ErrorEvent } from "~/db/getErrors";

export function StackTraceDialog({ error }: { error: ErrorEvent }) {
  return (
    <DialogButton
      buttonLabel="Stack Trace"
      title="Stack Trace"
      description={error.message!}
      content={error.stack}
    />
  );
}
