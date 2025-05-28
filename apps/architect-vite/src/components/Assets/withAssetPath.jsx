import { get } from "es-toolkit/compat";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { compose, setPropTypes } from "recompose";
import { getAssetManifest } from "~/selectors/protocol";

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const source = get(assetManifest, [id, "source"], "");
	const assetPath = `assets/${source}`;

	return {
		assetPath,
	};
};

const withAssetUrl = compose(
	setPropTypes({
		id: PropTypes.string.isRequired,
	}),
	connect(mapStateToProps, {}),
);

export default withAssetUrl;
