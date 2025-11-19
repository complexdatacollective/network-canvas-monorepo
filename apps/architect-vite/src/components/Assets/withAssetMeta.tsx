import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose } from "recompose";
import type { RootState } from "~/ducks/modules/root";
import { getAssetManifest } from "~/selectors/protocol";

const existingMeta = {
	name: "Interview network",
};

type OwnProps = {
	id: string;
};

const mapStateToProps = (state: RootState, { id }: OwnProps) => {
	const assetManifest = getAssetManifest(state);
	const meta = get(assetManifest, id, existingMeta);

	return {
		meta,
	};
};

const withAssetMeta = compose(connect(mapStateToProps));

export default withAssetMeta;
