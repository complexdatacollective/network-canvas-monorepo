import type React from "react";
import withAssetUrl from "~/components/Assets/withAssetUrl";
import { cx } from "~/utils/cva";
import { thumbnailBase, thumbnailFullWidth, thumbnailInteractive } from "./styles";

type ImageThumbnailProps = {
	url?: string;
	contain?: boolean;
	interactive?: boolean;
	fullWidth?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

const ImageThumbnail = ({ url, contain: _contain = false, interactive, fullWidth, ...props }: ImageThumbnailProps) => {
	const className = cx(
		thumbnailBase,
		"bg-no-repeat bg-contain bg-center h-(--space-6xl)",
		fullWidth && thumbnailFullWidth,
		interactive && thumbnailInteractive,
	);
	return <div className={className} style={{ backgroundImage: url ? `url(${url})` : undefined }} {...props} />;
};

export default withAssetUrl(ImageThumbnail);
