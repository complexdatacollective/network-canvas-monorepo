import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose } from "recompose";
import { getAssetManifest } from "~/selectors/protocol";

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const source = get(assetManifest, [id, "source"], "");
	
	// TODO: When assets are stored remotely, this will be:
	// const url = source ? `https://assets.example.com/${encodeURIComponent(source)}` : "";
	
	// For now, return a web-compatible path that won't cause errors
	const url = source ? `/assets/${source}` : "";

	return {
		url,
	};
};

const withAssetUrl = compose(connect(mapStateToProps, {}));

export default withAssetUrl;
