import type { MigrationNote } from "@codaco/protocol-validation";
import type { ComponentType, ReactNode } from "react";
import ExternalLink from "~/components/ExternalLink";
import { Markdown } from "~/components/Form/Fields";
import { openDialog } from "~/ducks/modules/dialogs";
import type { ConfirmDialog, UserErrorDialog } from "~/lib/legacy-ui/components/Dialogs";

export const generalErrorDialog = (title: string, errorMessage: string) => {
	const message: ReactNode = (
		<>
			<p>{errorMessage}</p>
			<p className="text-sm mt-4">
				If the problem persists, reach out on our&nbsp;
				<ExternalLink href="https://community.networkcanvas.com/">community website.</ExternalLink>
			</p>
		</>
	);

	const dialog: Omit<UserErrorDialog, "id"> = {
		type: "UserError",
		title,
		message,
	};

	return openDialog(dialog);
};

export const validationErrorDialog = (errorMessage: string) => {
	const message: ReactNode = (
		<>
			<p>The protocol file could not be opened due to validation errors:</p>
			<pre className="bg-surface-1 p-4 rounded-md text-sm overflow-auto max-h-64">{errorMessage}</pre>

			<p className="text-sm">
				If the problem persists, reach out on our&nbsp;
				<ExternalLink href="https://community.networkcanvas.com/">community website.</ExternalLink>
			</p>
		</>
	);

	const dialog: Omit<UserErrorDialog, "id"> = {
		type: "UserError",
		title: "Protocol Validation Failed",
		message,
	};

	return openDialog(dialog);
};

export const appUpgradeRequiredDialog = (protocolSchemaVersion: number) => {
	const message: ReactNode = (
		<>
			<p>This protocol is not compatible with the current version of Architect.</p>

			<p>
				In order to open it, you will need to install a version of Architect that supports schema version{" "}
				{protocolSchemaVersion}.
			</p>
			<p>
				Please see our{" "}
				<ExternalLink href="https://documentation.networkcanvas.com/reference/protocol-schema-information/">
					documentation on protocol schemas
				</ExternalLink>{" "}
				to locate an appropriate version, and for further information on this topic.
			</p>
		</>
	);

	const dialog: Omit<UserErrorDialog, "id"> = {
		type: "UserError",
		title: "Protocol not compatible with current version",
		message,
	};

	return openDialog(dialog);
};

export const mayUpgradeProtocolDialog = (
	protocolSchemaVersion: number,
	targetSchemaVersion: number,
	migrationNotes: MigrationNote[] = [],
) => {
	const message: ReactNode = (
		<>
			<p>
				This protocol uses schema version {protocolSchemaVersion}
				{", "}
				which is not compatible with this version of Architect.
			</p>
			<p>
				It can be automatically upgraded to schema version {targetSchemaVersion} using our migration feature, OR you can
				downgrade your version of Architect to continue editing this protocol without changing its schema version.
			</p>
			{migrationNotes.length > 0 && (
				<>
					<p>
						If you choose to migrate, the following actions will be automatically performed on your protocol. Read these
						notes carefully, as these actions may affect your data.
					</p>
					<div className="migration-panel">
						{migrationNotes.map(({ version, notes }) => (
							<div key={version}>
								<h4>Migrating to schema Version {version} will:</h4>
								<Markdown label={notes} markdownRenderers={{ a: ExternalLink as ComponentType<unknown> }} />
							</div>
						))}
					</div>
				</>
			)}
			<p>
				If you choose to continue, an upgraded copy of your protocol will be created and then opened. Your original
				protocol will not be changed, and can still be opened and modified using an older version of Architect. Please
				see our{" "}
				<ExternalLink href="https://documentation.networkcanvas.com/reference/protocol-schema-information/">
					documentation on protocol schemas
				</ExternalLink>{" "}
				for more information on this topic.
			</p>
		</>
	);

	const dialog: Omit<ConfirmDialog, "id"> = {
		type: "Confirm",
		title: "Upgrade to continue",
		confirmLabel: "Create upgraded copy",
		message,
	};

	return openDialog(dialog);
};
