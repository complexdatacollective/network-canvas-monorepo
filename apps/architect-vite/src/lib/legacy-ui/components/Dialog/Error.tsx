import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import Button from "../Button";
import Dialog from "./Dialog";

const getErrorMessage = (error: Error | string | { friendlyMessage?: string; toString: () => string } | null) =>
	!!error &&
	(typeof error === "object" && "friendlyMessage" in error && error.friendlyMessage
		? error.friendlyMessage
		: error.toString());

const getMessage = ({
	error,
	message,
}: {
	error?: Error | string | { friendlyMessage?: string } | null;
	message?: React.ReactNode;
}): React.ReactNode =>
	error ? getErrorMessage(error as Error | string | { friendlyMessage?: string; toString: () => string }) : message;

const getStack = (error: Error | string | { friendlyMessage?: string } | null): string | undefined => {
	if (error && typeof error === "object" && "stack" in error) {
		return error.stack;
	}
	return undefined;
};

type AdditionalInformationProps = {
	stack?: string;
};

const AdditionalInformation = ({ stack }: AdditionalInformationProps) => {
	const [expanded, setExpanded] = useState(false);

	const buttonText = expanded ? "Hide details \u25b2" : "Show details \u25bc";

	return (
		<div className="dialog__additional mt-4">
			<Button color="platinum" onClick={() => setExpanded(!expanded)}>
				{buttonText}
			</Button>
			{expanded && (
				<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
					<div className="dialog__additional-box mt-4 max-h-60 overflow-y-auto bg-[var(--color-background)] rounded-[var(--radius)] select-text">
						<pre className="error__stack-trace p-4 whitespace-pre-wrap break-words">{stack}</pre>
					</div>
				</motion.div>
			)}
		</div>
	);
};

type ErrorDialogProps = {
	error?: Error | string | { friendlyMessage?: string };
	message?: ReactNode;
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
	error,
	message,
	onConfirm,
	show = false,
	confirmLabel = "OK",
	title = "Something went wrong!",
}: ErrorDialogProps) => {
	const stack = error ? getStack(error) : undefined;

	return (
		<Dialog
			type="error"
			icon="error"
			show={show}
			title={title}
			message={getMessage({ error, message })}
			options={[<Button key="confirm" onClick={onConfirm} color="neon-coral" content={confirmLabel} />]}
		>
			{stack && <AdditionalInformation stack={stack} />}
		</Dialog>
	);
};

export default ErrorDialog;
