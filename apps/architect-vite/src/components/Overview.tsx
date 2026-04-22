import { BookOpenText, FileImage, Printer as PrintIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { compose } from "react-recompose";
import { connect } from "react-redux";
import { useLocation } from "wouter";
import { TextArea } from "~/components/Form/Fields";
import Card from "~/components/shared/Card";
import PillButton from "~/components/shared/PillButton";
import { updateProtocolDescription, updateProtocolName } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { getIsProtocolValid, getProtocol, getProtocolName } from "~/selectors/protocol";

type OverviewProps = {
	name?: string | null;
	description?: string;
	updateDescription?: (options: { description: string }) => void;
	updateName?: (options: { name: string }) => void;
	protocolIsValid: boolean;
};

const Overview = ({
	name = null,
	description = "",
	updateDescription = () => {},
	updateName = () => {},
	protocolIsValid,
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
		<Card padding="lg">
			<input
				type="text"
				value={localName}
				onChange={(e) => setLocalName(e.target.value)}
				onBlur={() => {
					const trimmed = localName.trim();
					trimmed ? updateName({ name: trimmed }) : setLocalName(name ?? "");
				}}
				placeholder="Enter protocol name…"
				className="w-full border-0 bg-transparent font-heading text-4xl font-extrabold leading-tight tracking-tight outline-none"
				style={{ color: "hsl(240 35% 17%)" }}
			/>
			<TextArea
				placeholder="Enter a description for your protocol…"
				input={{
					value: description,
					onChange: ({ target: { value } }) => updateDescription({ description: value }),
				}}
			/>
			<div className="mt-4 flex flex-wrap gap-2">
				<PillButton
					variant="secondary"
					size="sm"
					onClick={handleNavigateToCodebook}
					icon={<BookOpenText className="size-4" />}
				>
					Codebook
				</PillButton>
				<PillButton
					variant="secondary"
					size="sm"
					onClick={handleNavigateToAssets}
					icon={<FileImage className="size-4" />}
				>
					Assets
				</PillButton>
				<PillButton
					variant="secondary"
					size="sm"
					onClick={handlePrintSummary}
					disabled={!protocolIsValid}
					icon={<PrintIcon className="size-4" />}
				>
					Printable Summary
				</PillButton>
			</div>
		</Card>
	);
};

const mapDispatchToProps = {
	updateDescription: updateProtocolDescription,
	updateName: updateProtocolName,
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
