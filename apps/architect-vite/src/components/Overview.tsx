import { Button, Icon } from "@codaco/legacy-ui/components";
import * as Fields from "@codaco/legacy-ui/components/Fields";
import { MenuIcon as MenuBookIcon, PictureInPicture as PermMediaIcon, PrinterIcon as PrintIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { actionCreators as activeProtocolActions } from "~/ducks/modules/activeProtocol";
import { selectProtocolById } from "~/ducks/modules/protocols";
import type { RootState } from "~/ducks/modules/root";
import { actionCreators as uiActions } from "~/ducks/modules/ui";
import { actionCreators as webUserActions } from "~/ducks/modules/userActions/webUserActions";
import { getHasUnsavedChanges, getIsProtocolValid, getProtocol } from "~/selectors/protocol";
import withTooltip from "./enhancers/withTooltip";

const panelVariants = {
	hide: { opacity: 0, y: -200 },
	show: { opacity: 1, y: 0, transition: { type: "spring", damping: 20 } },
};

const summaryVariants = {
	hide: { opacity: 0, y: -200 },
	show: {
		opacity: 1,
		y: 0,
		transition: {
			type: "spring",
			damping: 20,
			when: "beforeChildren",
			staggerChildren: 0.1,
		},
	},
	exit: {
		opacity: 0,
		y: -200,
	},
};

const buttonVariants = {
	hide: { opacity: 0, y: -20 },
	show: { opacity: 1, y: 0 },
};

const PrintableSummaryButton = withTooltip(Button);

type OverviewProps = {
	name?: string | null;
	description?: string;
	updateOptions?: (options: { description: string }) => void;
	openScreen: (screen: string, params: { id: string }) => void;
	printOverview: () => void;
	protocolIsValid: boolean;
	hasUnsavedChanges: boolean;
	scrollOffset: number;
};

const Overview = ({
	name = null,
	description = "",
	updateOptions = () => {},
	openScreen,
	printOverview,
	protocolIsValid,
	hasUnsavedChanges,
	scrollOffset,
}: OverviewProps) => {
	const renderActionButtons = useCallback((collapsed = false) => (
		<div className="action-buttons">
			<motion.div variants={buttonVariants} className="action-buttons__button" title="Printable Summary">
				<PrintableSummaryButton
					onClick={printOverview}
					color="slate-blue"
					icon={<PrintIcon />}
					disabled={!protocolIsValid || hasUnsavedChanges}
					tooltip={hasUnsavedChanges ? "You must save your protocol before you can view the printable summary." : undefined}
					content={collapsed ? undefined : "Printable Summary"}
					tippyProps={{}}
				/>
			</motion.div>
			<motion.div variants={buttonVariants} className="action-buttons__button" title="Resource Library">
				<Button
					onClick={() => openScreen("assets", { id: "resource-library" })}
					color="neon-coral"
					icon={<PermMediaIcon />}
					content={collapsed ? undefined : "Resource Library"}
				/>
			</motion.div>
			<motion.div variants={buttonVariants} className="action-buttons__button" title="Manage Codebook">
				<Button
					onClick={() => openScreen("codebook", { id: "manage-codebook" })}
					color="sea-serpent"
					icon={<MenuBookIcon />}
					content={collapsed ? undefined : "Manage Codebook"}
				/>
			</motion.div>
		</div>
	), [printOverview, openScreen, protocolIsValid, hasUnsavedChanges]);

	const renderSummary = useCallback(() => (
		<motion.div
			key="summary"
			className="overview-summary"
			variants={summaryVariants}
			initial="hide"
			animate="show"
			exit="exit"
		>
			<div className="overview-summary__header">
				<h3>{name}</h3>
			</div>
			{renderActionButtons(true)}
		</motion.div>
	), [name, renderActionButtons]);

	return (
		<AnimatePresence>
			{scrollOffset > 300 && renderSummary()}
			<motion.div className="overview" variants={panelVariants} key="overview">
				<div className="overview__panel">
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2 }}
						className="protocol-name"
					>
						<h1 className="overview-name">{name}</h1>
					</motion.div>
					<div className="overview-description">
						<Fields.TextArea
							className="overview-description__field"
							placeholder="Enter a description for your protocol..."
							input={{
								value: description,
								onChange: ({ target: { value } }) => updateOptions({ description: value }),
							}}
						/>
					</div>
				</div>
				<div className="overview__footer">
					<div className="icon">
						<Icon name="protocol-card" />
					</div>
					{renderActionButtons()}
				</div>
			</motion.div>
		</AnimatePresence>
	);
};

const mapDispatchToProps = {
	updateOptions: activeProtocolActions.updateOptions,
	printOverview: webUserActions.printOverview,
	openScreen: uiActions.openScreen,
};

const mapStateToProps = (state: RootState) => {
	const protocol = getProtocol(state);
	const protocolIsValid = getIsProtocolValid(state);
	const hasUnsavedChanges = getHasUnsavedChanges(state);
	
	// Get protocol ID from URL params via props or window location
	const urlPath = window.location.pathname;
	const protocolId = urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
	
	// Get stored protocol info for name
	const storedProtocol = protocolId ? selectProtocolById(protocolId)(state) : null;

	return {
		name: storedProtocol?.name || "Untitled Protocol",
		description: protocol?.description || "",
		codebook: protocol?.codebook,
		protocolIsValid,
		hasUnsavedChanges,
	};
};

export default compose(connect(mapStateToProps, mapDispatchToProps))(Overview);
