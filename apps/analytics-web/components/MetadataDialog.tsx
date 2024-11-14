import type { Event } from "~/app/_actions/actions";
import { DialogButton } from "~/components/DialogButton";

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
