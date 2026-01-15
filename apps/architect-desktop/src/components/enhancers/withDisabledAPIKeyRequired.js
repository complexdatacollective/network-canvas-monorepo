import { withProps } from "recompose";

const withDisabledAPIKeyRequired = withProps(({ mapOptions }) => {
	const tokenAssetId = mapOptions?.tokenAssetId;
	return { disabled: !tokenAssetId };
});

export default withDisabledAPIKeyRequired;
