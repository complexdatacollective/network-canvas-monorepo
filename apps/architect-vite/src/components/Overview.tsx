import { MenuIcon as MenuBookIcon, PictureInPicture as PermMediaIcon, PrinterIcon as PrintIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { useLocation } from "wouter";
import { TextArea } from "~/components/Form/Fields";
import { updateProtocolDescription } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { Button, Icon } from "~/lib/legacy-ui/components";
import { getIsProtocolValid, getProtocol, getProtocolName } from "~/selectors/protocol";

type OverviewProps = {
	name?: string | null;
	description?: string;
	updateDescription?: (options: { description: string }) => void;
	protocolIsValid: boolean;
};

const Overview = ({ name = null, description = "", updateDescription = () => {}, protocolIsValid }: OverviewProps) => {
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
					<TextArea
						placeholder="Enter a description for your protocol..."
						input={{
							value: description,
							onChange: ({ target: { value } }) => updateDescription({ description: value }),
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
						<Button
							onClick={handlePrintSummary}
							color="slate-blue"
							icon={<PrintIcon />}
							disabled={!protocolIsValid}
							content="Printable Summary"
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
	updateDescription: updateProtocolDescription,
};

const mapStateToProps = (state: RootState) => {
	const protocol = getProtocol(state);
	const name = getProtocolName(state);
	const protocolIsValid = getIsProtocolValid(state);

	return {
		name,
		description: protocol?.description || "",
		codebook: protocol?.codebook,
		protocolIsValid,
	};
};

export default compose<ComponentProps<typeof Overview>, typeof Overview>(connect(mapStateToProps, mapDispatchToProps))(
	Overview,
);
