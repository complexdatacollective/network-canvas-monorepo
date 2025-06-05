import React from "react";
import withAssetUrl from "./withAssetUrl";

const backgroundStyles = (url: string): React.CSSProperties => ({
	backgroundImage: `url(${url})`,
	backgroundRepeat: "no-repeat",
	backgroundSize: "contain",
	backgroundPosition: "center",
});

type BackgroundImageProps = {
	url: string;
} & React.HTMLAttributes<HTMLDivElement>;

const BackgroundImage = ({ url, ...props }: BackgroundImageProps) => (
	<div
		style={backgroundStyles(url)}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);

export { BackgroundImage };

export default withAssetUrl(BackgroundImage);
