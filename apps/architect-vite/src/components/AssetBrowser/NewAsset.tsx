import AutoFileDrop from "../Form/AutoFileDrop";

type NewAssetProps = {
	type?: string | null;
	onCreate?: (ids: string[]) => void;
};

type AutoFileDropProps = {
	type?: string | null;
	onDrop: (ids: string[]) => void;
};

/**
 * Data source, which can be async or json file
 *
 * Value should be assetId
 */
const NewAsset = ({ type = null, onCreate }: NewAssetProps) => {
	const handleDrop = (ids: string[]) => {
		if (onCreate) {
			onCreate(ids);
		}
	};

	const AutoFileDropTyped = AutoFileDrop as React.ComponentType<AutoFileDropProps>;

	return <AutoFileDropTyped type={type} onDrop={handleDrop} />;
};

export default NewAsset;
