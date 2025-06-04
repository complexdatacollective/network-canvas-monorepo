/* eslint-disable jsx-a11y/media-has-caption */

import React from "react";
import withAssetUrl from "./withAssetUrl";

type AudioProps = {
	description?: string;
	url: string;
} & React.AudioHTMLAttributes<HTMLAudioElement>;

const Audio = ({ url, description = "", ...props }: AudioProps) => (
	<audio
		src={url}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	>
		{description}
	</audio>
);

export { Audio };

export default withAssetUrl(Audio);
