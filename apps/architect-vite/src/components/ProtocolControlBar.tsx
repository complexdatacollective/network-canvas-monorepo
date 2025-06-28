import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import { UnsavedChanges } from "~/components/Dialogs";
import { clearActiveProtocol } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import logoutIcon from "~/images/home/log-out.svg";
import { Button, Spinner } from "~/lib/legacy-ui/components";
import { getHasUnsavedChanges, getIsProtocolValid } from "~/selectors/protocol";

const unsavedChangesDialog = UnsavedChanges({
	message: <p>Your protocol has changes that have not yet been saved. Continuing will discard these changes!</p>,
	confirmLabel: "Discard Changes",
});

interface ProtocolControlBarProps {
	show?: boolean;
}

const ProtocolControlBar = ({ show = true }: ProtocolControlBarProps) => {
	const dispatch = useDispatch();
	const [, navigate] = useLocation();
	const hasUnsavedChanges = useSelector(getHasUnsavedChanges);
	const isSaving = false;
	const protocolIsValid = useSelector(getIsProtocolValid);
	const saveNetcanvas = () => console.log("Save Netcanvas action triggered");

	const handleClickStart = useCallback(
		() =>
			Promise.resolve()
				.then(() => {
					if (!hasUnsavedChanges) {
						return true;
					}

					return dispatch(dialogActions.openDialog(unsavedChangesDialog));
				})
				.then((confirm) => {
					if (!confirm) {
						return;
					}
					// Clear the active protocol and navigate home
					dispatch(clearActiveProtocol());
					navigate("/");
				}),
		[dispatch, hasUnsavedChanges, navigate],
	);

	const secondaryButtons = useMemo(
		() => [
			<Button
				key="return-button"
				color="platinum"
				icon={
					<div>
						<img src={logoutIcon} alt="Return to start screen" />
					</div>
				}
				onClick={handleClickStart}
			>
				Return to start screen
			</Button>,
		],
		[handleClickStart],
	);

	const buttons = useMemo(() => {
		if (protocolIsValid && hasUnsavedChanges) {
			return [
				<Button
					key="save-button"
					onClick={saveNetcanvas}
					color="primary"
					data-variant="save"
					disabled={isSaving}
					content={isSaving ? "Saving..." : "Save Changes"}
					iconPosition="right"
					icon={
						isSaving ? (
							<div>
								<Spinner size="0.5rem" />
							</div>
						) : (
							"arrow-right"
						)
					}
				/>,
			];
		}
		return [];
	}, [protocolIsValid, hasUnsavedChanges]);

	// Don't render if show is false
	if (!show) return null;

	return <ControlBar secondaryButtons={secondaryButtons} buttons={buttons} />;
};

export default ProtocolControlBar;
