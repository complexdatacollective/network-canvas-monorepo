import { actionCreators as toastActions } from "~/ducks/modules/toasts";
import { ProgressBar, Spinner } from "~/lib/legacy-ui/components";

export const showCancellationToast = () => (dispatch) => {
	dispatch(
		toastActions.addToast({
			type: "warning",
			title: "Import cancelled",
			content: (
				<>
					<p>You cancelled the import of this protocol.</p>
				</>
			),
		}),
	);
};

export const showInitialStatusToast = (toastUUID) => (dispatch) => {
	dispatch(
		toastActions.addToast({
			id: toastUUID,
			type: "info",
			title: "Importing Protocol...",
			CustomIcon: <Spinner small />,
			autoDismiss: false,
			dismissHandler: () => {
				dispatch(toastActions.removeToast(toastUUID));
				dispatch(showCancellationToast());
			},
			content: (
				<>
					<ProgressBar orientation="horizontal" percentProgress={10} />
				</>
			),
		}),
	);
};
