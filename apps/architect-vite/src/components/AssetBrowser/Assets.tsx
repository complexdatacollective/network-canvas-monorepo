import { compose } from "recompose";
import { RadioGroup } from "~/components/Form/Fields";
import Asset from "./Asset";
import withAssets from "./withAssets";

const ASSET_TYPES = [
	{ label: "All Types", value: null },
	{ label: "Image", value: "image" },
	{ label: "Video", value: "video" },
	{ label: "Audio", value: "audio" },
	{ label: "Network", value: "network" },
	{ label: "GeoJSON", value: "geojson" },
	{ label: "API Key", value: "apikey" },
];

type AssetType = {
	id: string;
	isUsed: boolean;
	name: string;
	source: string;
	type: "image" | "video" | "audio" | "network";
};

type AssetsProps = {
	type?: string | null;
	assets?: AssetType[];
	assetType?: string | null;
	onUpdateAssetFilter: (value: string | null) => void;
	onSelect?: () => void;
	onDelete?: (() => void) | null;
	onDownload?: () => void;
	onPreview?: () => void;
	disableDelete?: boolean;
};

const Assets = ({
	type = null,
	assets = [],
	assetType = null,
	onUpdateAssetFilter,
	onSelect = () => {},
	onDelete = null,
	onDownload = () => {},
	onPreview = () => {},
	disableDelete = false,
}: AssetsProps) => {
	const handleDelete = disableDelete ? null : onDelete;

	const renderedAssets = assets.map(({ id, name, source, type: thumbnailType, isUsed }) => {
		// disable download for apikey type
		const handleDownload = thumbnailType === "apikey" ? null : onDownload;

		return (
			<div className="asset-browser-assets__asset" key={id}>
				<Asset
					id={id}
					name={name}
					source={source}
					type={thumbnailType}
					isUsed={isUsed}
					onClick={onSelect}
					onPreview={onPreview}
					onDownload={handleDownload}
					onDelete={handleDelete}
				/>
			</div>
		);
	});

	return (
		<div className="asset-browser-assets">
			{!type && (
				<div className="asset-browser-assets__controls">
					<RadioGroup
						options={ASSET_TYPES}
						input={{
							onChange: onUpdateAssetFilter,
							value: assetType,
						}}
						label="Show types:"
					/>
				</div>
			)}
			<div className="asset-browser-assets__assets">
				{assets.length > 0 ? renderedAssets : <em>No resources to display.</em>}
			</div>
		</div>
	);
};

export default compose(withAssets)(Assets);
