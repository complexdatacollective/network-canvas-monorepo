import { useCallback } from "react";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import { clearActiveProtocol } from "~/ducks/modules/activeProtocol";
import { checkUnsavedChanges } from "~/ducks/modules/userActions/userActions";
import { useAppDispatch } from "~/ducks/store";
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
				<Button
					key="save-button"
					onClick={saveNetcanvas}
					color="primary"
					data-variant="export"
					content="Export"
					iconPosition="right"
				/>,
			]}
		/>
	);
};

export default ProtocolControlBar;
