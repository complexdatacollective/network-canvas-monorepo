import { useCallback } from "react";
import Confirm from "./Dialog/Confirm";
import ErrorDialog from "./Dialog/Error";
import Notice from "./Dialog/Notice";
import Simple from "./Dialog/Simple";
import UserErrorDialog from "./Dialog/UserError";
import Warning from "./Dialog/Warning";

/*
 * Displays a stack of Dialogs.
 *
 * <Dialogs dialogs closeDialog />
 *
 * `closeDialog` called when Dialog is cancelled or confirmed, may be used to track
 * state.
 *
 * `dialogs` prop in the format (note many of the props simple map
 * to the specific Dialog type):
 *
 * dialogs: [
 *   {
 *     id: '1234-1234-1',
 *     type: 'Confirm',
 *     title: 'Something to confirm',
 *     message: 'More detail about confirmation',
 *     onConfirm: () => {},
 *     onCancel: () => {},
 *   },
 *   {
 *     id: '1234-1234-2',
 *     type: 'Notice',
 *     title: 'Something info for the user',
 *     message: 'More detail...',
 *     onConfirm: () => {},
 *   },
 *   {
 *     id: '1234-1234-3',
 *     type: 'Warning',
 *     title: 'Something to warn the user about, maybe a non-failing error',
 *     message: 'More detail...',
 *     onConfirm: () => {},
 *   },
 *   {
 *     id: '1234-1234-4',
 *     type: 'Error',
 *     error: new Error('message and title are automatic'),
 *     onConfirm: () => {},
 *     onCancel: () => {},
 *   },
 * ]
 */
type Dialog = {
	id: string;
	type: "Confirm" | "Error" | "Notice" | "Simple" | "UserError" | "Warning";
	onConfirm?: (dialog: Dialog) => void;
	onCancel?: (dialog: Dialog) => void;
	[key: string]: unknown;
};

type DialogsProps = {
	dialogs?: Dialog[];
	closeDialog: (id: string) => void;
};

const Dialogs = ({ dialogs = [], closeDialog }: DialogsProps) => {
	const handleConfirm = useCallback(
		(dialog: Dialog) => {
			if (dialog.onConfirm) {
				dialog.onConfirm(dialog);
			}
			closeDialog(dialog.id);
		},
		[closeDialog],
	);

	const handleCancel = useCallback(
		(dialog: Dialog) => {
			if (dialog.onCancel) {
				dialog.onCancel(dialog);
			}
			closeDialog(dialog.id);
		},
		[closeDialog],
	);

	const renderDialog = useCallback(
		(dialog: Dialog) => {
			const onConfirm = () => handleConfirm(dialog);
			const onCancel = () => handleCancel(dialog);
			const { onConfirm: dialogOnConfirm, onCancel: dialogOnCancel, id, type, title } = dialog;
			const resolvedTitle = typeof title === "string" ? title : "";
			const confirmCallback = dialogOnConfirm ? () => dialogOnConfirm(dialog) : onConfirm;
			const cancelCallback = dialogOnCancel ? () => dialogOnCancel(dialog) : onCancel;

			switch (type) {
				case "Confirm":
					return <Confirm key={id} show title={resolvedTitle} onConfirm={confirmCallback} onCancel={cancelCallback} />;
				case "Error":
					return <ErrorDialog key={id} show title={resolvedTitle} onConfirm={confirmCallback} />;
				case "Notice":
					return <Notice key={id} show title={resolvedTitle} onConfirm={confirmCallback} />;
				case "Simple":
					return <Simple key={id} show title={resolvedTitle} onBlur={cancelCallback} />;
				case "UserError":
					return <UserErrorDialog key={id} show title={resolvedTitle} onConfirm={confirmCallback} />;
				case "Warning":
					return <Warning key={id} show title={resolvedTitle} onConfirm={confirmCallback} onCancel={cancelCallback} />;
				default:
					// TypeScript ensures this is exhaustive
					return null;
			}
		},
		[handleConfirm, handleCancel],
	);

	return dialogs.map(renderDialog);
};

export { Dialogs };

export default Dialogs;
