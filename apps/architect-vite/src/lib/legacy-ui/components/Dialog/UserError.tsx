import Button from "../Button";
import Dialog from "./Dialog";

const getErrorMessage = (error) => !!error && (error.friendlyMessage ? error.friendlyMessage : error.toString());

const getMessage = ({ error, message }) => (error ? getErrorMessage(error) : message);

type ErrorDialogProps = {
	error?: Error | string | { friendlyMessage?: string };
	message?: string;
	onConfirm: () => void;
	show?: boolean;
	confirmLabel?: string;
	title?: string;
};

/*
 * Designed to present errors to the user. Unlike some other Dialog types user must
 * explicitly click Acknowledge to close.
 */
const ErrorDialog = ({
	error = null,
	message = null,
	onConfirm,
	show = false,
	confirmLabel = "OK",
	title = "Something went wrong!",
}: ErrorDialogProps) => (
	<Dialog
		type="error"
		icon="error"
		show={show}
		title={title}
		message={getMessage({ error, message })}
		options={[<Button key="confirm" onClick={onConfirm} color="neon-coral" content={confirmLabel} />]}
	/>
);

export default ErrorDialog;
