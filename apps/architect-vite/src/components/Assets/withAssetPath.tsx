import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose } from "recompose";
import type { RootState } from "~/ducks/modules/root";
import { getAssetManifest } from "~/selectors/protocol";

type OwnProps = {
	id: string;
};

const mapStateToProps = (state: RootState, { id }: OwnProps) => {
	const assetManifest = getAssetManifest(state);
	const source = get(assetManifest, [id, "source"], "");
	const assetPath = `assets/${source}`;

	return {
		assetPath,
		assetId: id,
		assetName: source,
	};
};

const withAssetUrl = compose(connect(mapStateToProps, {}));

export default withAssetUrl;
