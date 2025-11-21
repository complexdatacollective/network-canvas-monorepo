import { bindActionCreators, type Dispatch } from "@reduxjs/toolkit";
import { has } from "es-toolkit/compat";
import type React from "react";
import { connect } from "react-redux";
import { compose, withHandlers, withProps } from "recompose";
import { SUPPORTED_EXTENSION_TYPE_MAP } from "~/config";
import { importAssetAsync } from "~/ducks/modules/protocol/assetManifest";
import Dropzone from "./Dropzone";

const mapDispatchToProps = (dispatch: Dispatch) => ({
	importAsset: bindActionCreators(importAssetAsync, dispatch),
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
			({
				importAsset,
				onDrop,
			}: {
				importAsset: (file: File) => Promise<{ id: string }>;
				onDrop: (ids: string[]) => void;
			}) =>
			(files: File[]) =>
				Promise.all(files.map((file) => importAsset(file).then(({ id }: { id: string }) => id))).then((ids) =>
					onDrop(ids),
				),
	}),
);

export default autoFileDrop(Dropzone as React.ComponentType<unknown>);
