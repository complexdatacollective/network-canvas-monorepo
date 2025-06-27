import type React from "react";
import withAssetUrl from "./withAssetUrl";

type ImageProps = {
	alt?: string;
	url: string;
} & React.ImgHTMLAttributes<HTMLImageElement>;

const Image = ({ url, alt = "", ...props }: ImageProps) => (
	<img
		src={url}
		alt={alt}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);

export { Image };

export default withAssetUrl(Image);
