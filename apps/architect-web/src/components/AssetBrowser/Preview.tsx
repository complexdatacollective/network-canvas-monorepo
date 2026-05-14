import { compose } from "@reduxjs/toolkit";
import { CopyIcon as ContentCopyIcon, DownloadIcon } from "lucide-react";
import { useCallback } from "react";
import APIKey from "~/components/Assets/APIKey";
import Audio from "~/components/Assets/Audio";
import BackgroundImage from "~/components/Assets/BackgroundImage";
import GeoJSON from "~/components/Assets/GeoJSON";
import Network from "~/components/Assets/Network";
import Video from "~/components/Assets/Video";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import withAssetPath from "~/components/Assets/withAssetPath";
import Dialog from "~/components/NewComponents/Dialog";
import { Button } from "~/lib/legacy-ui/components";

type AssetMeta = Record<string, unknown> & {
	type?: string;
	name?: string;
	value?: string;
};

const getRenderer = (meta: AssetMeta) => {
	switch (meta.type) {
		case "image":
			return BackgroundImage;
		case "audio":
			return ({ id }: { id: string }) => <Audio id={id} controls />;
		case "video":
			return ({ id }: { id: string }) => <Video id={id} controls />;
		case "network":
			return Network;
		case "geojson":
			return GeoJSON;
		case "apikey":
			return APIKey;
		default:
			return () => <p>No preview available.</p>;
	}
};

type PreviewOwnProps = {
	id: string;
	show?: boolean;
	onDownload?: (path: string, meta: AssetMeta) => void;
	onClose?: () => void;
};

type PreviewProps = PreviewOwnProps & {
	meta: AssetMeta;
	assetPath: string;
};

const Preview = ({ id, meta, assetPath, show = true, onDownload = () => {}, onClose = () => {} }: PreviewProps) => {
	const AssetRenderer = getRenderer(meta);

	const handleDownload = useCallback(() => {
		onDownload(assetPath, meta);
	}, [onDownload, assetPath, meta]);

	const handleCopyKey = useCallback(() => {
		if (meta.value) {
			navigator.clipboard.writeText(meta.value);
		}
	}, [meta.value]);

	return (
		<Dialog
			open={show}
			onOpenChange={(open) => !open && onClose()}
			header={<h2 className="m-0">{meta.name}</h2>}
			footer={
				<>
					{meta.type !== "apikey" ? (
						<Button onClick={handleDownload} icon={<DownloadIcon />} color="sea-green">
							Download asset
						</Button>
					) : (
						<Button onClick={handleCopyKey} icon={<ContentCopyIcon />}>
							Copy API Key
						</Button>
					)}
					<Button onClick={onClose} color="platinum">
						Close preview
					</Button>
				</>
			}
		>
			<AssetRenderer id={id} />
		</Dialog>
	);
};

export default compose(withAssetMeta, withAssetPath)(Preview) as React.ComponentType<PreviewOwnProps>;
