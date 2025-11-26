import type { ComponentProps } from "react";
import { useCallback } from "react";
import { compose } from "recompose";
import useExternalDataDownload from "~/components/AssetBrowser/useExternalDataDownload";
import useExternalDataPreview from "~/components/AssetBrowser/useExternalDataPreview";
import { Section } from "~/components/EditorLayout";
import Assets from "./Assets";
import NewAsset from "./NewAsset";
import withAssetActions from "./withAssetActions";

// Props injected by withAssetActions HOC
type InjectedProps = {
	onDelete: (assetId: string, isUsed: boolean) => void;
};

// Props that the component accepts from outside
type AssetBrowserOwnProps = {
	type?: string | null;
	selected?: string | null;
	onSelect?: (assetId: string) => void;
	disableDelete?: boolean;
	sectionLayout: "horizontal" | "vertical";
};

// Combined props type
type AssetBrowserProps = AssetBrowserOwnProps & Partial<InjectedProps>;

const AssetBrowser = ({
	type = null,
	selected = null,
	onSelect = () => {},
	onDelete,
	disableDelete = false,
	sectionLayout,
}: AssetBrowserProps) => {
	const handleCreate = useCallback(
		(assetIds: string[]) => {
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
			<Section title="Import a New Resource" layout={sectionLayout}>
				<NewAsset onCreate={handleCreate} type={type} />
			</Section>
			<Section title="Resource Library" layout={sectionLayout}>
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

export default compose<ComponentProps<typeof AssetBrowser>, typeof AssetBrowser>(withAssetActions)(AssetBrowser);
