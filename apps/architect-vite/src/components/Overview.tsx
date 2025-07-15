import { MenuIcon as MenuBookIcon, PictureInPicture as PermMediaIcon, PrinterIcon as PrintIcon } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { useLocation } from "wouter";
import * as Fields from "~/components/Form/Fields";
import { updateProtocolOptions } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { Button, Icon } from "~/lib/legacy-ui/components";
import { getHasUnsavedChanges, getIsProtocolValid, getProtocol } from "~/selectors/protocol";
import withTooltip from "./enhancers/withTooltip";

const panelVariants: Variants = {
	hide: { opacity: 0, y: -200 },
	show: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, when: "beforeChildren", staggerChildren: 0.1 } },
};

const buttonVariants: Variants = {
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
};

const Overview = ({
	name = null,
	description = "",
	updateOptions = () => {},
	protocolIsValid,
	hasUnsavedChanges,
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

	return (
		<motion.div className="overview" variants={panelVariants} initial="hide" animate="show" key="overview">
			<div className="overview__panel">
				<motion.div variants={buttonVariants} className="protocol-name">
					<h1 className="overview-name">{name}</h1>
				</motion.div>
				<motion.div variants={buttonVariants}>
					<Fields.TextArea
						placeholder="Enter a description for your protocol..."
						input={{
							value: description,
							onChange: ({ target: { value } }) => updateOptions({ description: value }),
						}}
					/>
				</motion.div>
			</div>
			<div className="overview__footer">
				<div className="icon">
					<Icon name="protocol-card" />
				</div>
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
							content="Printable Summary"
							tippyProps={{}}
						/>
					</motion.div>
					<motion.div variants={buttonVariants} className="action-buttons__button" title="Resource Library">
						<Button
							onClick={handleNavigateToAssets}
							color="neon-coral"
							icon={<PermMediaIcon />}
							content="Resource Library"
						/>
					</motion.div>
					<motion.div variants={buttonVariants} className="action-buttons__button" title="Manage Codebook">
						<Button
							onClick={handleNavigateToCodebook}
							color="sea-serpent"
							icon={<MenuBookIcon />}
							content="Manage Codebook"
						/>
					</motion.div>
				</div>
			</div>
		</motion.div>
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
