import { omit } from "lodash";
import { useCallback } from "react";
import Confirm from "./Dialog/Confirm";
import Error from "./Dialog/Error";
import Notice from "./Dialog/Notice";
import Simple from "./Dialog/Simple";
import UserError from "./Dialog/UserError";
import Warning from "./Dialog/Warning";

const DialogVariants = {
	Confirm,
	Error,
	Notice,
	Simple,
	UserError,
	Warning,
} as const;

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
interface Dialog {
	id: string;
	type: keyof typeof DialogVariants;
	onConfirm?: (dialog: Dialog) => void;
	onCancel?: (dialog: Dialog) => void;
	[key: string]: unknown;
}

interface DialogsProps {
	dialogs?: Dialog[];
	closeDialog: (id: string) => void;
}

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
			const Dialog = DialogVariants[dialog.type];

			const onConfirm = () => handleConfirm(dialog);
			const onCancel = () => handleCancel(dialog);

			return (
				<Dialog
					show
					key={dialog.id}
					onConfirm={onConfirm}
					onCancel={onCancel}
					// eslint-disable-next-line react/jsx-props-no-spreading
					{...omit(dialog, ["onConfirm", "onCancel"])}
				/>
			);
		},
		[handleConfirm, handleCancel],
	);

	return dialogs.map(renderDialog);
};

export { Dialogs };

export default Dialogs;
