import type React from "react";
import withAssetUrl from "./withAssetUrl";

type BackgroundImageProps = {
	url?: string;
} & React.HTMLAttributes<HTMLDivElement>;

const BackgroundImage = ({ url, className, ...props }: BackgroundImageProps) => {
	if (!url) {
		return <div className={className} {...props} />;
	}

	return (
		<div
			className={className}
			{...props}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
		</div>
	);
};

export default withAssetUrl(BackgroundImage);
