import { useCallback } from "react";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import { useAppDispatch } from "~/ducks/hooks";
import { clearActiveProtocol } from "~/ducks/modules/activeProtocol";
import { checkUnsavedChanges } from "~/ducks/modules/userActions/userActions";
import logoutIcon from "~/images/home/log-out.svg";
import { Button } from "~/lib/legacy-ui/components";

const ProtocolControlBar = () => {
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();
	const saveNetcanvas = () => console.log("Save Netcanvas action triggered");

	const handleReturnToStart = useCallback(async () => {
		const canContinue = await dispatch(checkUnsavedChanges()).unwrap();
		if (canContinue) {
			await dispatch(clearActiveProtocol());
			navigate("/");
		}
	}, [dispatch, navigate]);

	return (
		<ControlBar
			secondaryButtons={[
				<Button
					key="return-button"
					color="platinum"
					icon={
						<div>
							<img src={logoutIcon} alt="Return to start screen" />
						</div>
					}
					onClick={handleReturnToStart}
				>
					Return to start screen
				</Button>,
			]}
			buttons={[
				<Button key="save-button" onClick={saveNetcanvas} content="Save" />,
				<Button key="export-button" onClick={saveNetcanvas} color="sea-green" content="Download" />,
			]}
		/>
	);
};

export default ProtocolControlBar;
