import { withProps } from "recompose";

type MapOptions = {
	tokenAssetId?: string;
};

type PropsWithMapOptions = {
	mapOptions?: MapOptions;
};

const withDisabledAPIKeyRequired = withProps<{ disabled: boolean }, PropsWithMapOptions>(({ mapOptions }) => {
	const tokenAssetId = mapOptions?.tokenAssetId;
	return { disabled: !tokenAssetId };
});

export default withDisabledAPIKeyRequired;
