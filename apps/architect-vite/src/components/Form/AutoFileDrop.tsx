import { bindActionCreators, type Dispatch } from "@reduxjs/toolkit";
import { has } from "es-toolkit/compat";
import { connect } from "react-redux";
import { compose, withHandlers, withProps } from "recompose";
import { SUPPORTED_EXTENSION_TYPE_MAP } from "~/config";
import { importAssetAsync } from "~/ducks/modules/protocol/assetManifest";
import Dropzone from "./Dropzone";

const mapDispatchToProps = (dispatch: Dispatch) => ({
	importAsset: bindActionCreators(importAssetAsync, dispatch),
});

type BaseProps = {
	type?: string;
	onDrop: (ids: string[]) => void;
};

type WithAcceptsProps = BaseProps & {
	accepts: string[];
};

type WithImportAssetProps = WithAcceptsProps & {
	importAsset: (file: File) => Promise<{ id: string }>;
};

type DropzoneInputProps = {
	accepts: string[];
	onDrop: (files: File[]) => Promise<unknown>;
	className?: string;
	disabled?: boolean;
};

const autoFileDrop = compose<DropzoneInputProps, BaseProps>(
	withProps<{ accepts: string[] }, BaseProps>(({ type }) => {
		// Handle no 'type' required - still enforce only allowing supported file types
		if (!type || !has(SUPPORTED_EXTENSION_TYPE_MAP, type)) {
			const values = Object.values(SUPPORTED_EXTENSION_TYPE_MAP) as string[][];
			const consolidatedList: string[] = values.flat();
			return { accepts: consolidatedList };
		}

		const extensionKey = type as keyof typeof SUPPORTED_EXTENSION_TYPE_MAP;
		const extensions = SUPPORTED_EXTENSION_TYPE_MAP[extensionKey];
		return {
			accepts: Array.isArray(extensions) ? extensions : Array.from(extensions as Iterable<string>),
		};
	}),
	connect(null, mapDispatchToProps),
	withHandlers({
		onDrop:
			({ importAsset, onDrop }: WithImportAssetProps) =>
			(files: File[]) =>
				Promise.all(files.map((file) => importAsset(file).then(({ id }: { id: string }) => id))).then((ids) =>
					onDrop(ids),
				),
	}),
)(Dropzone);

export default autoFileDrop;
