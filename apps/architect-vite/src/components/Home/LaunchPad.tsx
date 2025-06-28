import { useDispatch } from "react-redux";
import { SAMPLE_PROTOCOL_URL } from "~/config";
import { createNetcanvas, openLocalNetcanvas, openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import createButtonGraphic from "~/images/home/create-button.svg";
import openButtonGraphic from "~/images/home/open-button.svg";
import { GraphicButton } from "~/lib/legacy-ui/components";
import { clearAllStorage } from "~/utils/assetDB";
import Group from "./Group";
import Section from "./Section";

const LaunchPad = () => {
	const dispatch = useDispatch();

	const handleInstallDevProtocols = async () => {
		dispatch(openRemoteNetcanvas(SAMPLE_PROTOCOL_URL));
	};

	const handleCreateNewProtocol = () => {
		dispatch(createNetcanvas());
	};

	const handleOpenExistingProtocol = () => {
		dispatch(openLocalNetcanvas());
	};

	const handleClearStorage = () => {
		clearAllStorage();
	};

	return (
		<>
			<Section className="launch-pad">
				<Group>
					<h2>Tasks</h2>
					<div className="launch-pad__actions">
						<div className="launch-pad__action">
							<GraphicButton
								graphic={createButtonGraphic}
								graphicPosition="20% bottom"
								graphicSize="auto 90%"
								onClick={handleCreateNewProtocol}
							>
								<h2>Create</h2>
								<h3>New Protocol</h3>
							</GraphicButton>
						</div>
						<div className="launch-pad__action-divider" />
						<div className="launch-pad__action">
							<GraphicButton
								graphic={openButtonGraphic}
								graphicPosition="0 bottom"
								color="slate-blue-dark"
								graphicSize="auto 115%"
								onClick={handleOpenExistingProtocol}
							>
								<h2>Open</h2>
								<h3>Existing Protocol</h3>
							</GraphicButton>
						</div>
					</div>
				</Group>
			</Section>
			{process.env.NODE_ENV === "development" && (
				<Section className="launch-pad">
					<Group>
						<h2>Development Tools</h2>
						<div className="launch-pad__actions">
							<div className="launch-pad__action">
								<GraphicButton
									graphic={createButtonGraphic}
									graphicPosition="20% bottom"
									graphicSize="auto 90%"
									onClick={handleInstallDevProtocols}
									color="neon-coral"
								>
									<h2>Install</h2>
									<h3>Sample Protocols</h3>
								</GraphicButton>
							</div>
							<div className="launch-pad__action-divider" />
							<div className="launch-pad__action">
								<GraphicButton
									graphic={openButtonGraphic}
									graphicPosition="0 bottom"
									color="mustard"
									graphicSize="auto 115%"
									onClick={handleClearStorage}
								>
									<h2>Clear</h2>
									<h3>All Storage</h3>
								</GraphicButton>
							</div>
						</div>
					</Group>
				</Section>
			)}
		</>
	);
};

export default LaunchPad;
