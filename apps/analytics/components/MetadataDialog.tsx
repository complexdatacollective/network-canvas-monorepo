import { DialogButton } from "~/components/DialogButton";
import { type ErrorEvent } from "~/db/getErrors";
import { type Event } from "~/db/getEvents";

export function MetadataDialog({ event }: { event: Event | ErrorEvent }) {
  return (
    <DialogButton
      buttonLabel="Details"
      title="Event Details"
      description={event.type}
      content={JSON.stringify(event.metadata)}
    />
  );
}
