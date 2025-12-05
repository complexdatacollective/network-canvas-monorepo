import cx from "classnames";
import type React from "react";
import withAssetUrl from "~/components/Assets/withAssetUrl";

type ImageThumbnailProps = {
	url?: string;
	contain?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

const ImageThumbnail = ({ url, contain = false, ...props }: ImageThumbnailProps) => {
	const className = cx("thumbnail", "thumbnail--image", {
		"thumbnail--contain": contain,
	});

	return <div className={className} style={{ backgroundImage: url ? `url(${url})` : undefined }} {...props} />;
};

export default withAssetUrl(ImageThumbnail);
