import { DialogButton } from '~/components/DialogButton';

import { type Event } from '~/db/getEvents';

export function MetadataDialog({ event }: { event: Event }) {
  return (
    <DialogButton
      buttonLabel="Metadata"
      title="Event Metadata"
      description={event.type}
      content={JSON.stringify(event.metadata, null, 2)}
    />
  );
}
