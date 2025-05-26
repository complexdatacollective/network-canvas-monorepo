import { get } from "lodash";
import path from "path";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { compose, setPropTypes } from "recompose";
import { getAssetManifest } from "~/src/selectors/protocol";
import { getWorkingPath } from "~/src/selectors/session";

const mapStateToProps = (state, { id }) => {
	const assetManifest = getAssetManifest(state);
	const workingPath = getWorkingPath(state);
	const source = get(assetManifest, [id, "source"], "");
	const assetPath = path.join(workingPath, "assets", path.basename(source));
	const encodedURI = encodeURIComponent(assetPath);
	const url = source ? `asset://${encodedURI}` : "";

	return {
		url,
	};
};

const withAssetUrl = compose(
	setPropTypes({
		id: PropTypes.string.isRequired,
	}),
	connect(mapStateToProps, {}),
);

export default withAssetUrl;
