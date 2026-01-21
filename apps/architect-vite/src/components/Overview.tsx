import { MenuIcon as MenuBookIcon, PictureInPicture as PermMediaIcon, PrinterIcon as PrintIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { connect } from "react-redux";
import { compose } from "recompose";
import { useLocation } from "wouter";
import { TextArea } from "~/components/Form/Fields";
import { actionCreators, updateProtocolDescription, updateProtocolName } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { Button, Icon } from "~/lib/legacy-ui/components";
import { getExperiments, getIsProtocolValid, getProtocol, getProtocolName } from "~/selectors/protocol";

type OverviewProps = {
	name?: string | null;
	description?: string;
	updateDescription?: (options: { description: string }) => void;
	updateName?: (options: { name: string }) => void;
	updateProtocol?: (options: { experiments: { encryptedVariables: boolean } }) => void;
	protocolIsValid: boolean;
	experiments?: { encryptedVariables?: boolean };
};

const Overview = ({
	name = null,
	description = "",
	updateDescription = () => {},
	updateName = () => {},
	updateProtocol = () => {},
	protocolIsValid,
	experiments = {},
}: OverviewProps) => {
	const [, setLocation] = useLocation();
	const [localName, setLocalName] = useState(name ?? "");

	// Sync from Redux when prop changes (e.g., undo/redo)
	useEffect(() => {
		setLocalName(name ?? "");
	}, [name]);

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
					<input
						type="text"
						className="overview-name"
						value={localName}
						onChange={(e) => setLocalName(e.target.value)}
						onBlur={() => {
							const trimmed = localName.trim();
							trimmed ? updateName({ name: trimmed }) : setLocalName(name ?? "");
						}}
						placeholder="Enter protocol name..."
					/>
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
				{import.meta.env.DEV && (
					<div className="mt-4 p-4 border border-dashed bg-info/5 rounded">
						<h4 className="text-sm font-semibold mb-2">Experimental Features (Dev Only)</h4>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={experiments.encryptedVariables ?? false}
								onChange={(e) =>
									updateProtocol({
										experiments: { encryptedVariables: e.target.checked },
									})
								}
								className="w-4 h-4"
							/>
							<span className="text-sm">Enable Anonymisation Interface</span>
						</label>
					</div>
				)}
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
	updateName: updateProtocolName,
	updateProtocol: actionCreators.updateProtocol,
};

const mapStateToProps = (state: RootState) => {
	const protocol = getProtocol(state);
	const name = getProtocolName(state);
	const protocolIsValid = getIsProtocolValid(state);
	const experiments = getExperiments(state);

	return {
		name,
		description: protocol?.description || "",
		codebook: protocol?.codebook,
		protocolIsValid,
		experiments,
	};
};

export default compose<ComponentProps<typeof Overview>, typeof Overview>(connect(mapStateToProps, mapDispatchToProps))(
	Overview,
);
