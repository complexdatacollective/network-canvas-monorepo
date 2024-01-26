import { DialogButton } from "~/components/DialogButton";
import { type ErrorEvent } from "~/db/getErrors";
import { type Event } from "~/db/getEvents";

export function MetadataDialog({ event }: { event: Event | ErrorEvent }) {
  return (
    <DialogButton
      buttonLabel="Metadata"
      title="Event Metadata"
      description={event.type}
      content={JSON.stringify(event.metadata, null, 2)}
    />
  );
}
