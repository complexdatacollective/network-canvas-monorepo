import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose } from "recompose";
import { getAssetManifest } from "~/selectors/protocol";

const existingMeta = {
	name: "Interview network",
};

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const meta = get(assetManifest, id, existingMeta);

	return {
		meta,
	};
};

const withAssetMeta = compose(connect(mapStateToProps));

export default withAssetMeta;
