import React, { useEffect, useState } from "react";
import { getAssetBlobUrl, revokeBlobUrl } from "~/utils/assetUtils";

type AssetUrlProps = {
	id: string;
};

type WithAssetUrlProps = {
	url?: string;
};

const withAssetUrl = <P extends WithAssetUrlProps>(
	WrappedComponent: React.ComponentType<P>
) => {
	const WithAssetUrlComponent = (props: Omit<P, keyof WithAssetUrlProps> & AssetUrlProps) => {
		const { id, ...restProps } = props;
		const [url, setUrl] = useState<string | undefined>();

		useEffect(() => {
			let isMounted = true;
			let currentUrl: string | null = null;

			const loadAsset = async () => {
				if (!id) return;
				
				try {
					const blobUrl = await getAssetBlobUrl(id);
					
					if (!isMounted) return;
					
					if (blobUrl) {
						currentUrl = blobUrl;
						setUrl(blobUrl);
					}
				} catch (err) {
					// Silently fail
					console.warn('Failed to load asset:', id, err);
				}
			};

			loadAsset();

			return () => {
				isMounted = false;
				if (currentUrl) {
					revokeBlobUrl(currentUrl);
				}
			};
		}, [id]);

		return (
			<WrappedComponent
				{...(restProps as P)}
				url={url}
			/>
		);
	};

	WithAssetUrlComponent.displayName = `withAssetUrl(${WrappedComponent.displayName || WrappedComponent.name})`;

	return WithAssetUrlComponent;
};

export default withAssetUrl;
