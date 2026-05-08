import { Check } from "lucide-react";
import { useSelector } from "react-redux";
import Tooltip from "~/components/NewComponents/Tooltip";
import { Button } from "~/lib/legacy-ui/components";
import { getProtocolName } from "~/selectors/protocol";
import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";
import NavShell from "./NavShell";

type StageEditorNavProps = {
	stageName: string;
	onCancel: () => void;
	onPreview: () => void;
	previewLabel: string;
	isStageInvalid: boolean;
	isUploadingPreview: boolean;
	hasUnsavedChanges: boolean;
};

const StageEditorNav = ({
	stageName,
	onCancel,
	onPreview,
	previewLabel,
	isStageInvalid,
	isUploadingPreview,
	hasUnsavedChanges,
}: StageEditorNavProps) => {
	const protocolName = useSelector(getProtocolName);

	const breadcrumbItems: BreadcrumbItem[] = [
		{ label: protocolName ?? "Untitled protocol", onClick: onCancel },
		{ label: stageName, truncate: false },
	];

	const previewButton = (
		<Button key="preview" onClick={onPreview} color="neon-coral" disabled={isUploadingPreview || isStageInvalid}>
			{previewLabel}
		</Button>
	);

	const trailing = (
		<>
			<Button onClick={onCancel} color="platinum">
				Cancel
			</Button>
			{isStageInvalid ? (
				<Tooltip content="Previewing this stage requires valid stage configuration. Fix the errors on this stage to enable previewing.">
					{previewButton}
				</Tooltip>
			) : (
				previewButton
			)}
			{hasUnsavedChanges && (
				<Button type="submit" color="sea-green" icon={<Check />}>
					Finished editing
				</Button>
			)}
		</>
	);

	return <NavShell leading={<Breadcrumb items={breadcrumbItems} />} trailing={trailing} />;
};

export default StageEditorNav;
