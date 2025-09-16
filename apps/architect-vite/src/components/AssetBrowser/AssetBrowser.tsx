import { useCallback } from "react";
import { compose } from "recompose";
import useExternalDataDownload from "~/components/AssetBrowser/useExternalDataDownload";
import useExternalDataPreview from "~/components/AssetBrowser/useExternalDataPreview";
import { Section } from "~/components/EditorLayout";
import Assets from "./Assets";
import NewAsset from "./NewAsset";
import withAssetActions from "./withAssetActions";

type AssetBrowserProps = {
	type?: string;
	selected?: string;
	onSelect?: (assetId: string) => void;
	onDelete?: () => void;
	disableDelete?: boolean;
};

const AssetBrowser = ({
	type = null,
	selected = null,
	onSelect = () => {},
	onDelete = () => {},
	disableDelete = false,
}: AssetBrowserProps) => {
	const handleCreate = useCallback(
		(assetIds) => {
			if (assetIds.length !== 1) {
				return;
			} // if multiple files were uploaded
			if (!assetIds[0]) {
				return;
			} // if a single invalid file was uploaded
			onSelect(assetIds[0]);
		},
		[onSelect],
	);

	const [preview, handleShowPreview] = useExternalDataPreview();
	const handleDownload = useExternalDataDownload();

	return (
		<>
			<Section title="Import a New Resource">
				<NewAsset onCreate={handleCreate} type={type} />
			</Section>
			<Section title="Resource Library">
				<Assets
					onSelect={onSelect}
					onPreview={handleShowPreview}
					onDownload={handleDownload}
					onDelete={onDelete}
					disableDelete={disableDelete}
					selected={selected}
					type={type}
				/>
			</Section>
			{preview}
		</>
	);
};

export default compose(withAssetActions)(AssetBrowser);
