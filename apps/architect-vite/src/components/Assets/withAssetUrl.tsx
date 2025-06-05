import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose } from "recompose";
import { getAssetManifest } from "~/selectors/protocol";

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const source = get(assetManifest, [id, "source"], "");
	const assetPath = `assets/${source}`;
	const encodedURI = encodeURIComponent(assetPath);
	const url = source ? `asset://${encodedURI}` : "";

	return {
		url,
	};
};

const withAssetUrl = compose(connect(mapStateToProps, {}));

export default withAssetUrl;
