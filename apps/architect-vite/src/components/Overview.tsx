import { MenuIcon as MenuBookIcon, PictureInPicture as PermMediaIcon, PrinterIcon as PrintIcon } from "lucide-react";
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

	const handleNavigateToAssets = useCallback(() => {
		setLocation("/protocol/assets");
	}, [setLocation]);

	const handleNavigateToCodebook = useCallback(() => {
		setLocation("/protocol/codebook");
	}, [setLocation]);

	const handlePrintSummary = useCallback(() => {
		setLocation("/protocol/summary");
	}, [setLocation]);

	return (
		<div className="overview">
			<div className="overview__panel">
				<div className="protocol-name">
					<h1 className="overview-name">{name}</h1>
				</div>
				<div>
					<Fields.TextArea
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
				<div className="action-buttons">
					<div className="action-buttons__button" title="Printable Summary">
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
					</div>
					<div className="action-buttons__button" title="Resource Library">
						<Button
							onClick={handleNavigateToAssets}
							color="neon-coral"
							icon={<PermMediaIcon />}
							content="Resource Library"
						/>
					</div>
					<div className="action-buttons__button" title="Manage Codebook">
						<Button
							onClick={handleNavigateToCodebook}
							color="sea-serpent"
							icon={<MenuBookIcon />}
							content="Manage Codebook"
						/>
					</div>
				</div>
			</div>
		</div>
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
