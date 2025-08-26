import cx from "classnames";
import { DeleteIcon, DownloadIcon, FrameIcon as PreviewIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import * as Thumbnails from "~/components/Thumbnail";

type AssetProps = {
	id: string;
	isUsed?: boolean;
	onClick?: (id: string) => void;
	onDelete?: ((id: string, isUsed: boolean) => void) | null;
	onDownload?: (id: string) => void;
	onPreview?: (id: string) => void;
	type: string;
};

const FallBackAssetComponent = () => <div>No preview component available for this asset type.</div>;

const ASSET_COMPONENTS = {
	image: Thumbnails.Image,
	video: Thumbnails.Video,
	audio: Thumbnails.Audio,
	network: Thumbnails.Network,
	apikey: Thumbnails.APIKey,
	geojson: Thumbnails.GeoJSON,
};

const Asset = ({
	id,
	isUsed = false,
	onClick = () => {},
	onDelete = null,
	onDownload = () => {},
	onPreview = () => {},
	type,
}: AssetProps) => {
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onClick(id);
		},
		[onClick, id],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				onClick(id);
			}
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

	const handleDeleteKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				onDelete?.(id, isUsed);
			}
		},
		[onDelete, isUsed, id],
	);

	const handlePreview = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onPreview(id);
		},
		[onPreview, id],
	);

	const handlePreviewKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				onPreview(id);
			}
		},
		[onPreview, id],
	);

	const handleDownload = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onDownload(id);
		},
		[onDownload, id],
	);

	const handleDownloadKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				onDownload(id);
			}
		},
		[onDownload, id],
	);

	const PreviewComponent = useMemo(() => ASSET_COMPONENTS[type] || FallBackAssetComponent, [type]);

	const assetClasses = cx(
		"asset-browser-asset",
		{ "asset-browser-asset--clickable": onClick },
		{ "asset-browser-asset--is-used": isUsed },
	);

	return (
		<div onClick={handleClick} onKeyDown={handleKeyDown} className={assetClasses} role="button" tabIndex={0}>
			<div className="asset-browser-asset__preview">
				<PreviewComponent id={id} />
			</div>

			<div className="asset-browser-asset__controls">
				{onPreview && (
					<div
						className="asset-browser-asset__control"
						onClick={handlePreview}
						onKeyDown={handlePreviewKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Preview asset"
					>
						<PreviewIcon />
					</div>
				)}

				{onDownload && (
					<div
						className="asset-browser-asset__control"
						onClick={handleDownload}
						onKeyDown={handleDownloadKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Download asset"
					>
						<DownloadIcon />
					</div>
				)}

				{onDelete && (
					<div
						className="asset-browser-asset__control asset-browser-asset__control--delete"
						onClick={handleDelete}
						onKeyDown={handleDeleteKeyDown}
						role="button"
						tabIndex={0}
						aria-label={isUsed ? "This asset is in use by the protocol and cannot be deleted" : "Delete asset"}
						title={isUsed ? "This asset is in use by the protocol and cannot be deleted" : ""}
					>
						<DeleteIcon />
					</div>
				)}
			</div>
		</div>
	);
};

export default Asset;
