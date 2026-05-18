import { compose } from "react-recompose";
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
	selected: _selected = null,
}: AssetsProps) => {
	const handleDelete = disableDelete ? null : onDelete;

	const renderedAssets = assets.map(({ id, type: thumbnailType, isUsed }) => {
		// disable download for apikey type
		const handleDownload = thumbnailType === "apikey" ? null : onDownload;

		return (
			<div key={id}>
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
		<div>
			{!type && (
				<div className="mb-(--space-md)">
					<RadioGroup
						options={ASSET_TYPES}
						input={{
							name: "assetType",
							onChange: (value: unknown) => onUpdateAssetFilter(value as string | null),
							value: assetType,
						}}
						label="Show types:"
						orientation="horizontal"
					/>
				</div>
			)}
			<div className="grid grid-cols-3 gap-5">
				{assets.length > 0 ? renderedAssets : <em>No resources to display.</em>}
			</div>
		</div>
	);
};

// OwnProps - props that must be passed from outside
type OwnProps = {
	type?: string | null;
	selected?: string | null;
	onSelect?: (id: string) => void;
	onDelete?: ((id: string, isUsed: boolean) => void) | null;
	onDownload?: (id: string) => void;
	onPreview?: (id: string) => void;
	disableDelete?: boolean;
};

export default compose<AssetsProps, OwnProps>(withAssets)(Assets);
