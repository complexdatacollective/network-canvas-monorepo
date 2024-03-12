import { DialogButton } from '~/components/DialogButton';
import { type Event } from '~/db/getEvents';

export function StackTraceDialog({ error }: { error: Event }) {
  return (
    <DialogButton
      buttonLabel="Stack Trace"
      title="Stack Trace"
      description={error.message!}
      content={error.stack}
    />
  );
}
