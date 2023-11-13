import { DialogButton } from "@/components/DialogButton";
import type { EventPayload as Event } from "@codaco/analytics";

export function MetadataDialog({ event }: { event: Event }) {
  console.log(event);
  return (
    <DialogButton
      buttonLabel="Details"
      title="Event Details"
      description={event.type}
      content={JSON.stringify(event.metadata)}
    />
  );
}
