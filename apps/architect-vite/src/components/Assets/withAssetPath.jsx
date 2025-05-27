import { get } from "es-toolkit/compat";
import path from "path";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { compose, setPropTypes } from "recompose";
import { getAssetManifest } from "~/selectors/protocol";
import { getWorkingPath } from "~/selectors/session";

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const workingPath = getWorkingPath(state);
	const source = get(assetManifest, [id, "source"], "");
	const assetPath = path.join(workingPath, "assets", path.basename(source));

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
