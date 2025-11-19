import AutoFileDrop from "../Form/AutoFileDrop";

type NewAssetProps = {
	type?: string | null;
	onCreate?: (ids: string[]) => void;
};

/**
 * Data source, which can be async or json file
 *
 * Value should be assetId
 */
const NewAsset = ({ type = null, onCreate }: NewAssetProps) => (
	<>
		<AutoFileDrop type={type} onDrop={onCreate} />
	</>
);

export default NewAsset;
