import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose } from "recompose";
import { getAssetManifest } from "~/selectors/protocol";

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const source = get(assetManifest, [id, "source"], "");
	const assetPath = `assets/${source}`;

	return {
		assetPath,
	};
};

const withAssetUrl = compose(connect(mapStateToProps, {}));

export default withAssetUrl;
