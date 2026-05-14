/* eslint-disable jsx-a11y/media-has-caption */

import type React from "react";
import withAssetUrl from "./withAssetUrl";

type VideoProps = {
	description?: string;
	url: string;
} & React.VideoHTMLAttributes<HTMLVideoElement>;

const Video = ({ url, description = "", ...props }: VideoProps) => (
	<video
		src={url}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
		playsInline
	>
		{description}
	</video>
);

export default withAssetUrl(Video);
