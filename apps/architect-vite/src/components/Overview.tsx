import { MenuIcon as MenuBookIcon, PictureInPicture as PermMediaIcon, PrinterIcon as PrintIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { useLocation } from "wouter";
import { updateProtocolOptions } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { Button, Icon } from "~/lib/legacy-ui/components";
import * as Fields from "~/lib/legacy-ui/components/Fields";
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
	printOverview: () => void;
	protocolIsValid: boolean;
	hasUnsavedChanges: boolean;
	scrollOffset: number;
};

const Overview = ({
	name = null,
	description = "",
	updateOptions = () => {},
	protocolIsValid,
	hasUnsavedChanges,
	scrollOffset,
}: OverviewProps) => {
	const [, setLocation] = useLocation();

	// Get protocol ID from URL for navigation
	const getProtocolId = useCallback(() => {
		const urlPath = window.location.pathname;
		return urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
	}, []);

	const handleNavigateToAssets = useCallback(() => {
		const protocolId = getProtocolId();
		if (protocolId) {
			setLocation(`/protocol/${protocolId}/assets`);
		}
	}, [getProtocolId, setLocation]);

	const handleNavigateToCodebook = useCallback(() => {
		const protocolId = getProtocolId();
		if (protocolId) {
			setLocation(`/protocol/${protocolId}/codebook`);
		}
	}, [getProtocolId, setLocation]);

	const handlePrintSummary = useCallback(() => {
		const protocolId = getProtocolId();
		if (protocolId) {
			setLocation(`/protocol/${protocolId}/summary`);
		}
	}, [getProtocolId, setLocation]);

	const renderActionButtons = useCallback(
		(collapsed = false) => (
			<div className="action-buttons">
				<motion.div variants={buttonVariants} className="action-buttons__button" title="Printable Summary">
					<PrintableSummaryButton
						onClick={handlePrintSummary}
						color="slate-blue"
						icon={<PrintIcon />}
						disabled={!protocolIsValid || hasUnsavedChanges}
						tooltip={
							hasUnsavedChanges ? "You must save your protocol before you can view the printable summary." : undefined
						}
						content={collapsed ? undefined : "Printable Summary"}
						tippyProps={{}}
					/>
				</motion.div>
				<motion.div variants={buttonVariants} className="action-buttons__button" title="Resource Library">
					<Button
						onClick={handleNavigateToAssets}
						color="neon-coral"
						icon={<PermMediaIcon />}
						content={collapsed ? undefined : "Resource Library"}
					/>
				</motion.div>
				<motion.div variants={buttonVariants} className="action-buttons__button" title="Manage Codebook">
					<Button
						onClick={handleNavigateToCodebook}
						color="sea-serpent"
						icon={<MenuBookIcon />}
						content={collapsed ? undefined : "Manage Codebook"}
					/>
				</motion.div>
			</div>
		),
		[handlePrintSummary, handleNavigateToAssets, handleNavigateToCodebook, protocolIsValid, hasUnsavedChanges],
	);

	const renderSummary = useCallback(
		() => (
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
		),
		[name, renderActionButtons],
	);

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
	updateOptions: updateProtocolOptions,
};

const mapStateToProps = (state: RootState) => {
	const protocol = getProtocol(state);
	const protocolIsValid = getIsProtocolValid(state);
	const hasUnsavedChanges = getHasUnsavedChanges(state);

	return {
		name: protocol?.name || "Untitled Protocol",
		description: protocol?.description || "",
		codebook: protocol?.codebook,
		protocolIsValid,
		hasUnsavedChanges,
	};
};

export default compose(connect(mapStateToProps, mapDispatchToProps))(Overview);
