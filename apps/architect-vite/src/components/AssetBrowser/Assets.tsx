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
	source?: string;
	type: "image" | "video" | "audio" | "network" | "apikey" | "geojson";
};

type AssetsProps = {
	type?: string | null;
	assets?: AssetType[];
	assetType?: string | null;
	onUpdateAssetFilter: (value: string | null) => void;
	onSelect?: (id: string) => void;
	onDelete?: ((id: string, isUsed: boolean) => void) | null;
	onDownload?: (id: string) => void;
	onPreview?: (id: string) => void;
	disableDelete?: boolean;
	selected?: string | null;
};

const Assets = ({
	type = null,
	assets = [],
	assetType = null,
	onUpdateAssetFilter,
	onSelect,
	onDelete = null,
	onDownload,
	onPreview,
	disableDelete = false,
	selected = null,
}: AssetsProps) => {
	const handleDelete = disableDelete ? null : onDelete;

	const renderedAssets = assets.map(({ id, type: thumbnailType, isUsed }) => {
		// disable download for apikey type
		const handleDownload = thumbnailType === "apikey" ? null : onDownload;

		return (
			<div className="asset-browser-assets__asset" key={id}>
				<Asset
					id={id}
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
							name: "assetType",
							onChange: (value: unknown) => onUpdateAssetFilter(value as string | null),
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

// Type assertion for the HOC-wrapped component
export default compose(withAssets)(Assets as React.ComponentType<unknown>) as React.ComponentType<
	Omit<AssetsProps, "assets" | "assetType" | "onUpdateAssetFilter">
>;
