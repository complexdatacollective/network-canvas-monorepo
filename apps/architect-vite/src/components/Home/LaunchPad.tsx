import { first } from "es-toolkit/compat";
import { connect, useDispatch } from "react-redux";
import { useLocation } from "wouter";
import { GraphicButton } from "~/lib/legacy-ui/components";
import { ProtocolCard } from "~/lib/legacy-ui/components/Cards";
// Use webUserActions during transition
import { selectRecentProtocols, type StoredProtocol } from "~/ducks/modules/protocols";
import type { RootState } from "~/ducks/modules/root";
import { actionCreators as userActions } from "~/ducks/modules/userActions/webUserActions";
import createButtonGraphic from "~/images/home/create-button.svg";
import openButtonGraphic from "~/images/home/open-button.svg";
import { clearAllStorage, installDevelopmentProtocol } from "~/utils/developmentSetup";
import Group from "./Group";
import Section from "./Section";

type LaunchPadProps = {
	openNetcanvas: () => void;
	createNetcanvas: () => void;
	navigateToProtocol: (protocolId: string) => void;
	lastEditedProtocol?: StoredProtocol | null;
	otherRecentProtocols?: StoredProtocol[];
};

const LaunchPad = ({
	openNetcanvas,
	createNetcanvas,
	navigateToProtocol,
	lastEditedProtocol = null,
	otherRecentProtocols = [],
}: LaunchPadProps) => {
	const dispatch = useDispatch();

	const handleInstallDevProtocols = async () => {
		await installDevelopmentProtocol(dispatch);
	};

	const handleClearStorage = () => {
		clearAllStorage(dispatch);
	};

	return (
		<>
			{lastEditedProtocol && (
				<Section className="launch-pad">
					<Group color="sea-green" className="resume-group home-group--flex text-white">
						<div className="launch-pad__resume">
							<h2>Resume Editing</h2>
							<ProtocolCard
								description={lastEditedProtocol.description || "No description"}
								lastModified={lastEditedProtocol.lastModified.toString()}
								name={lastEditedProtocol.name}
								onClickHandler={() => navigateToProtocol(lastEditedProtocol.id)}
								schemaVersion={lastEditedProtocol.protocol.schemaVersion}
							/>
						</div>
						<div className="launch-pad__action-divider" />
						<div className="launch-pad__resume">
							{otherRecentProtocols.map((protocol) => (
								<ProtocolCard
									key={protocol.id}
									condensed
									description={protocol.description || "No description"}
									lastModified={protocol.lastModified.toString()}
									name={protocol.name}
									onClickHandler={() => navigateToProtocol(protocol.id)}
									schemaVersion={protocol.protocol.schemaVersion}
								/>
							))}
						</div>
					</Group>
				</Section>
			)}
			<Section className="launch-pad">
				<Group>
					<h2>Tasks</h2>
					<div className="launch-pad__actions">
						<div className="launch-pad__action">
							<GraphicButton
								graphic={createButtonGraphic}
								graphicPosition="20% bottom"
								graphicSize="auto 90%"
								onClick={createNetcanvas}
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
								color="slate-blue--dark"
								graphicSize="auto 115%"
								onClick={openNetcanvas}
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

const mapStateToProps = (state: RootState) => {
	// Use the new protocols store
	const recentProtocols = selectRecentProtocols(10)(state);

	return {
		lastEditedProtocol: first(recentProtocols) || null,
		otherRecentProtocols: recentProtocols.slice(1, 4),
	};
};

const mapDispatchToProps = (dispatch: any, ownProps: any) => ({
	createNetcanvas: () => dispatch(userActions.createNetcanvas()),
	openNetcanvas: () => dispatch(userActions.openNetcanvas()),
	navigateToProtocol: (protocolId: string) => {
		// Get navigate function from component
		const [, navigate] = useLocation();
		navigate(`/protocol/${protocolId}`);
	},
});

// Create a wrapper component to handle navigation
const LaunchPadWithNavigation = (props: Omit<LaunchPadProps, "navigateToProtocol">) => {
	const [, navigate] = useLocation();

	return <LaunchPad {...props} navigateToProtocol={(protocolId) => navigate(`/protocol/${protocolId}`)} />;
};

const withState = connect(mapStateToProps, {
	createNetcanvas: userActions.createNetcanvas,
	openNetcanvas: userActions.openNetcanvas,
});

export default withState(LaunchPadWithNavigation);
