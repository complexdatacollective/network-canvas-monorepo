import { compose } from "@reduxjs/toolkit";
import cx from "classnames";
import { CopyIcon as ContentCopyIcon, DownloadIcon } from "lucide-react";
import { useCallback } from "react";
import * as Assets from "~/components/Assets";
import withAssetMeta from "~/components/Assets/withAssetMeta";
import withAssetPath from "~/components/Assets/withAssetPath";
import Dialog from "~/components/Dialog/Dialog";
import { Button } from "~/lib/legacy-ui/components";

type AssetMeta = Record<string, unknown> & {
	type?: string;
	name?: string;
	value?: string;
};

const getRenderer = (meta: AssetMeta) => {
	switch (meta.type) {
		case "image":
			return Assets.BackgroundImage;
		case "audio":
			// eslint-disable-next-line
			return ({ id }: { id: string }) => <Assets.Audio id={id} controls />;
		case "video":
			// eslint-disable-next-line
			return ({ id }: { id: string }) => <Assets.Video id={id} controls />;
		case "network":
			return Assets.Network;
		case "geojson":
			return Assets.GeoJSON;
		case "apikey":
			return Assets.APIKey;
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

	const primaryButtons = [
		<Button onClick={onClose} color="platinum" key="close">
			Close preview
		</Button>,
	];

	// API keys are copied instead of downloaded
	const secondaryButtons =
		meta.type !== "apikey"
			? [
					<Button onClick={handleDownload} icon={<DownloadIcon />} key="download" color="sea-green">
						Download asset
					</Button>,
				]
			: [
					<Button onClick={handleCopyKey} icon={<ContentCopyIcon />} key="copy">
						Copy API Key
					</Button>,
				];

	const className = cx("asset-browser-preview", `asset-browser-preview--type-${meta.type}`);

	const header = (
		<div className="window__heading stage-heading stage-heading--inline stage-heading--collapsed">
			<div className="stage-editor">
				<h2>{meta.name}</h2>
			</div>
		</div>
	);

	const footer = (
		<div className="window__controls">
			{secondaryButtons.length > 0 && <div className="window__controls-left">{secondaryButtons}</div>}
			{primaryButtons.length > 0 && <div className="window__controls-right">{primaryButtons}</div>}
		</div>
	);

	return (
		<Dialog show={show} onClose={onClose} className={cx("window-dialog", className)} header={header} footer={footer}>
			<div className="window__content">
				<AssetRenderer id={id} />
			</div>
		</Dialog>
	);
};

export default compose(withAssetMeta, withAssetPath)(Preview as React.ComponentType<unknown>) as React.ComponentType<PreviewOwnProps>;
