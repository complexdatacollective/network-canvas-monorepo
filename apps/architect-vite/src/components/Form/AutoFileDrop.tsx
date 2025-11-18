import { bindActionCreators } from "@reduxjs/toolkit";
import { has } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose, withHandlers, withProps } from "recompose";
import { SUPPORTED_EXTENSION_TYPE_MAP } from "~/config";
import { actionCreators as assetActions } from "~/ducks/modules/protocol/assetManifest";
import Dropzone from "./Dropzone";

const mapDispatchToProps = (dispatch) => ({
	importAsset: bindActionCreators(assetActions.importAsset, dispatch),
});

const autoFileDrop = compose(
	withProps(({ type }: { type?: string }) => {
		// Handle no 'type' required - still enforce only allowing supported file types
		if (!type || !has(SUPPORTED_EXTENSION_TYPE_MAP, type)) {
			const consolidatedList = [].concat(...Object.values(SUPPORTED_EXTENSION_TYPE_MAP));
			return { accepts: consolidatedList };
		}

		return {
			accepts: [...SUPPORTED_EXTENSION_TYPE_MAP[type]],
		};
	}),
	connect(null, mapDispatchToProps),
	withHandlers({
		onDrop:
			({ importAsset, onDrop }: { importAsset: any; onDrop: (ids: string[]) => void }) =>
			(filePaths: string[]) =>
				Promise.all(filePaths.map((filePath) => importAsset(filePath).then(({ id }: { id: string }) => id))).then(
					(ids) => onDrop(ids),
				),
	}),
);

export { autoFileDrop };

export default autoFileDrop(Dropzone);
