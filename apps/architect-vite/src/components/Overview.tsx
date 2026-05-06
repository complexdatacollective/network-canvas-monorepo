import { BookOpenText, FileImage, Printer as PrintIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { compose } from "react-recompose";
import { connect } from "react-redux";
import { useLocation } from "wouter";
import { TextArea } from "~/components/Form/Fields";
import { updateProtocolDescription, updateProtocolName } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/modules/root";
import { Button, Icon } from "~/lib/legacy-ui/components";
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
		<div className="w-full max-w-4xl mx-auto bg-white flex flex-col rounded relative mt-(--space-xl) overflow-hidden shadow-[0_var(--space-sm)_var(--space-xs)_0_var(--color-border)]">
			<div className="py-(--space-md) px-(--space-lg)">
				<div>
					<input
						type="text"
						className="text-2xl font-bold w-full mb-(--space-sm) bg-transparent border-none outline-none p-0 text-inherit font-body focus:outline-none"
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
			</div>
			<div className="py-(--space-md) px-(--space-lg) flex gap-(--space-lg) bg-slate-blue-dark">
				<div className="h-full w-(--space-xl)">
					<Icon name="protocol-card" />
				</div>
				<div className="flex w-full justify-end items-center gap-(--space-md)">
					<div title="Printable Summary">
						<Button
							onClick={handlePrintSummary}
							color="slate-blue"
							icon={<PrintIcon />}
							disabled={!protocolIsValid}
							content="Printable Summary"
						/>
					</div>
					<div title="Resource Library">
						<Button
							onClick={handleNavigateToAssets}
							color="neon-coral"
							icon={<FileImage />}
							content="Resource Library"
						/>
					</div>
					<div title="Manage Codebook">
						<Button
							onClick={handleNavigateToCodebook}
							color="sea-serpent"
							icon={<BookOpenText />}
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
