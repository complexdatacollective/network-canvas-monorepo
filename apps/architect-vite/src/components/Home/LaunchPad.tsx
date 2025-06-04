import { GraphicButton } from "@codaco/legacy-ui/components";
import { ProtocolCard } from "@codaco/legacy-ui/components/Cards";
import { first, get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { actionCreators as userActions } from "~/ducks/modules/userActions";
import createButtonGraphic from "~/images/home/create-button.svg";
import openButtonGraphic from "~/images/home/open-button.svg";
import Group from "./Group";
import Section from "./Section";

type RecentProtocol = {
	filePath: string;
	lastModified: string;
	name: string;
	schemaVersion: string;
};

type LaunchPadProps = {
	openNetcanvas: (filePath?: string) => void;
	createNetcanvas: () => void;
	lastEditedProtocol?: RecentProtocol | null;
	otherRecentProtocols?: RecentProtocol[];
};

const LaunchPad = ({
	openNetcanvas,
	createNetcanvas,
	lastEditedProtocol = null,
	otherRecentProtocols = [],
}: LaunchPadProps) => (
	<>
		{lastEditedProtocol && (
			<Section className="launch-pad">
				<Group color="sea-green" className="resume-group home-group--flex">
					<div className="launch-pad__resume">
						<h2>Resume Editing</h2>
						<ProtocolCard
							description={lastEditedProtocol.filePath}
							lastModified={lastEditedProtocol.lastModified}
							name={lastEditedProtocol.name}
							onClickHandler={() => openNetcanvas(lastEditedProtocol.filePath)}
							schemaVersion={lastEditedProtocol.schemaVersion}
						/>
					</div>
					<div className="launch-pad__action-divider" />
					<div className="launch-pad__resume">
						{otherRecentProtocols.map((protocol) => (
							<ProtocolCard
								key={protocol.filePath}
								condensed
								description={protocol.filePath}
								lastModified={protocol.lastModified}
								name={protocol.name}
								onClickHandler={() => openNetcanvas(protocol.filePath)}
								schemaVersion={protocol.schemaVersion}
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
	</>
);

const mapStateToProps = (state) => {
	const recentProtocols = get(state, "recentProtocols", []).filter((meta) => !!meta.schemaVersion);

	return {
		lastEditedProtocol: first(recentProtocols),
		otherRecentProtocols: recentProtocols.slice(1, 4),
	};
};

const mapDispatchToProps = {
	createNetcanvas: userActions.createNetcanvas,
	openNetcanvas: userActions.openNetcanvas,
};

const withState = connect(mapStateToProps, mapDispatchToProps);

export default withState(LaunchPad);
