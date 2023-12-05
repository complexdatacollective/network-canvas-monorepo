import { DialogButton } from "~/components/DialogButton";
import type { Event } from "~/db/schema";

export function MetadataDialog({ event }: { event: Event }) {
  return (
    <DialogButton
      buttonLabel="Details"
      title="Event Details"
      description={event.type}
      content={JSON.stringify(event.metadata)}
    />
  );
}
