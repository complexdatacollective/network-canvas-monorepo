import { DialogButton } from "@/components/DialogButton";
import type { Event } from "@/db/types";

export function MetadataDialog({ event }: { event: Event }) {
  return (
    <DialogButton
      buttonLabel="Details"
      title="Event Details"
      description={event.event}
      content={JSON.stringify(event.metadata)}
    >
      {JSON.stringify(event.metadata)}
    </DialogButton>
  );
}
