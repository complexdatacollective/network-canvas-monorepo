import cx from "classnames";
import { DeleteIcon, DownloadIcon, Eye as PreviewIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { APIKey, Audio, GeoJSON, Image, Network, Video } from "~/components/Thumbnail";

type AssetProps = {
	id: string;
	isUsed?: boolean;
	onClick?: (id: string) => void;
	onDelete?: ((id: string, isUsed: boolean) => void) | null;
	onDownload?: ((id: string) => void) | null;
	onPreview?: ((id: string) => void) | null;
	type: string;
};

const FallBackAssetComponent = () => <div>No preview component available for this asset type.</div>;

type AssetType = "image" | "video" | "audio" | "network" | "apikey" | "geojson";

// Use a more lenient type since these are HOC-wrapped components
const ASSET_COMPONENTS: Record<AssetType, React.ComponentType<Record<string, unknown>>> = {
	image: Image as unknown as React.ComponentType<Record<string, unknown>>,
	video: Video as unknown as React.ComponentType<Record<string, unknown>>,
	audio: Audio as unknown as React.ComponentType<Record<string, unknown>>,
	network: Network as unknown as React.ComponentType<Record<string, unknown>>,
	apikey: APIKey as unknown as React.ComponentType<Record<string, unknown>>,
	geojson: GeoJSON as unknown as React.ComponentType<Record<string, unknown>>,
};

const Asset = ({
	id,
	isUsed = false,
	onClick = () => {},
	onDelete = null,
	onDownload = null,
	onPreview = null,
	type,
}: AssetProps) => {
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onClick(id);
		},
		[onClick, id],
	);

	const handleDelete = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onDelete?.(id, isUsed);
		},
		[onDelete, isUsed, id],
	);

	const handlePreview = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (onPreview) {
				onPreview(id);
			}
		},
		[onPreview, id],
	);

	const handleDownload = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (onDownload) {
				onDownload(id);
			}
		},
		[onDownload, id],
	);

	const PreviewComponent = useMemo(() => {
		const assetType = type as AssetType;
		return ASSET_COMPONENTS[assetType] || FallBackAssetComponent;
	}, [type]);

	const assetClasses = cx(
		"asset-browser-asset",
		{ "asset-browser-asset--clickable": onClick },
		{ "asset-browser-asset--is-used": isUsed },
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				onClick(id);
			}
		},
		[onClick, id],
	);

	return (
		<button type="button" onClick={handleClick} onKeyDown={handleKeyDown} className={assetClasses}>
			<div className="asset-browser-asset__preview">
				<PreviewComponent id={id} />
			</div>

			<div className="asset-browser-asset__controls">
				{onPreview && (
					<button
						type="button"
						className="asset-browser-asset__control"
						onClick={handlePreview}
						aria-label="Preview asset"
					>
						<PreviewIcon />
					</button>
				)}

				{onDownload && (
					<button
						type="button"
						className="asset-browser-asset__control"
						onClick={handleDownload}
						aria-label="Download asset"
					>
						<DownloadIcon />
					</button>
				)}

				{onDelete && (
					<button
						type="button"
						className="asset-browser-asset__control asset-browser-asset__control--delete"
						onClick={handleDelete}
						title={isUsed ? "This asset is in use by the protocol and cannot be deleted" : ""}
						aria-label={isUsed ? "Cannot delete - asset in use" : "Delete asset"}
					>
						<DeleteIcon />
					</button>
				)}
			</div>
		</button>
	);
};

export default Asset;
