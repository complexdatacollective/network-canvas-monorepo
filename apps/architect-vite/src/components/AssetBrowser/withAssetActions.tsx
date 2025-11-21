import { connect } from "react-redux";
import { compose, withHandlers } from "recompose";
import { actionCreators as dialogActions } from "../../ducks/modules/dialogs";
import { deleteAsset, importAssetAsync } from "../../ducks/modules/protocol/assetManifest";

type ConnectedActions = {
	deleteAsset: typeof deleteAsset;
	importAsset: typeof importAssetAsync;
	openDialog: typeof dialogActions.openDialog;
};

const connectActions = connect(null, {
	deleteAsset,
	importAsset: importAssetAsync,
	openDialog: dialogActions.openDialog,
});

const assetHandlers = withHandlers<ConnectedActions, {}>({
	onDelete:
		({ deleteAsset, openDialog }: ConnectedActions) =>
		(assetId: string, isUsed = false) => {
			if (isUsed) {
				openDialog({
					type: "Notice",
					title: "Cannot delete resource",
					message:
						"Cannot delete this resource because it is used within your interview. Remove any uses of the resource, and try again.",
					confirmLabel: "Ok",
				});
				return;
			}

			openDialog({
				type: "Warning",
				title: "Delete Resource?",
				message: "Are you sure you want to delete this resource? This action cannot be undone.",
				confirmLabel: "Delete Resource",
				onConfirm: () => deleteAsset(assetId),
			});
		},
});

const withAssets = compose(connectActions, assetHandlers);

export default withAssets;
