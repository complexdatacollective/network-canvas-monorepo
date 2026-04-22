import type { ReactNode } from "react";
import ExternalLink from "~/components/ExternalLink";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { Button } from "~/lib/legacy-ui/components";

const basename = (filePath: string | null | undefined) => {
	if (filePath == null) return filePath;

	// Trim trailing path separators so behavior matches node:path.basename
	const trimmedPath = String(filePath).replace(/[\\/]+$/, "");
	const parts = trimmedPath.split(/[\\/]/);

	return parts.pop() ?? trimmedPath;
};

const genericAssetMessage = (
	<>
		<p>
			Please see our{" "}
			<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/#supported-file-types">
				documentation page
			</ExternalLink>{" "}
			on using external data by clicking the button below.
		</p>
		<p>
			If you believe you are seeing this message in error, please help us to troubleshoot this issue by creating a topic
			on our&nbsp;
			<ExternalLink href="https://community.networkcanvas.com/">community website</ExternalLink>
			&nbsp; with further details.
		</p>
		<p>
			<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/#supported-file-types">
				<Button>View documentation</Button>
			</ExternalLink>
		</p>
	</>
);

const assetErrorMessages = {
	VARIABLE_NAME: (
		<>
			<p>The file you attempted to import contained invalid variable names.</p>
			{genericAssetMessage}
		</>
	),
	COLUMN_MISMATCHED: (
		<>
			<p>The file you attempted to import contained data with a different number of columns to the header row.</p>
			{genericAssetMessage}
		</>
	),
	default: (
		<>
			<p>The file you attempted to import is not in a format supported by Interviewer.</p>
			{genericAssetMessage}
		</>
	),
};

type AssetError = Error & { friendlyMessage?: ReactNode; code?: string };

export const invalidAssetErrorDialog = (e: AssetError, filePath: string) => {
	const errorCode = e.code as keyof typeof assetErrorMessages | undefined;
	e.friendlyMessage = (errorCode && assetErrorMessages[errorCode]) ?? assetErrorMessages.default;

	return dialogActions.openDialog({
		type: "Error",
		title: `Error: ${basename(filePath)} is not formatted correctly`,
		error: e,
	});
};

export const duplicateRowsWarningDialog = (filePath: string, count: number) => {
	return dialogActions.openDialog({
		type: "Warning",
		title: `Warning: ${basename(filePath)} contains duplicate rows`,
		message: (
			<>
				<p>
					The file contains {count} duplicate {count === 1 ? "row" : "rows"}. Duplicate rows will be removed when this
					roster is used in Fresco.
				</p>
				<p>Consider removing duplicates from your CSV file before importing.</p>
			</>
		),
	});
};

export const importAssetErrorDialog = (e: AssetError, filePath: string) => {
	e.friendlyMessage = (
		<>
			The file <strong>{basename(filePath)}</strong> could not be imported.
		</>
	);
	return dialogActions.openDialog({
		type: "Error",
		error: e,
	});
};
