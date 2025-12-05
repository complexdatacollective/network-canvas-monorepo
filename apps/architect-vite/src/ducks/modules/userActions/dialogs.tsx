import type { MigrationNote } from "@codaco/protocol-validation";
import type { ComponentType, ReactNode } from "react";
import ExternalLink from "~/components/ExternalLink";
import { Markdown } from "~/components/Form/Fields";
import { openDialog } from "~/ducks/modules/dialogs";
import type { ConfirmDialog, UserErrorDialog } from "~/lib/legacy-ui/components/Dialogs";

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
			<p>It can be automatically upgraded to schema version {targetSchemaVersion} using our migration feature.</p>
			{migrationNotes.length > 0 && (
				<>
					<p>
						If you choose to migrate, the following actions will be automatically performed on your protocol. Read these
						notes carefully, as these actions may affect your data.
					</p>
					<div className="max-h-72 overflow-y-auto rounded-xl bg-surface-2 px-4 py-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-2 [&_li]:leading-relaxed">
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
				<ExternalLink href="https://documentation.networkcanvas.com/advanced-topics/protocol-schema-information/">
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
		className: "!w-4xl",
		message,
	};

	return openDialog(dialog);
};
