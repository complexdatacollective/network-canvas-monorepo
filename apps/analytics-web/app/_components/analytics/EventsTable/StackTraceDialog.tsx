import type { Event } from "~/app/_actions/actions";
import { DialogButton } from "~/components/DialogButton";

export function StackTraceDialog({ error }: { error: Event }) {
	return (
		<DialogButton buttonLabel="Stack Trace" title="Stack Trace" description={error.message} content={error.stack} />
	);
}
