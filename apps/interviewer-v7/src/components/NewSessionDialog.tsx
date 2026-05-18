import Button from "@codaco/fresco-ui/Button";
import Dialog from "@codaco/fresco-ui/dialogs/Dialog";
import Field from "@codaco/fresco-ui/form/Field/Field";
import { FormWithoutProvider } from "@codaco/fresco-ui/form/Form";
import InputField from "@codaco/fresco-ui/form/fields/InputField";
import SubmitButton from "@codaco/fresco-ui/form/SubmitButton";
import FormStoreProvider from "@codaco/fresco-ui/form/store/formStoreProvider";
import { useToast } from "@codaco/fresco-ui/Toast";
import { createInitialNetwork } from "@codaco/interview";
import { useEffect, useState } from "react";
import { createSession, getProtocolByHash } from "~/lib/db/api";
import type { StoredSession } from "~/lib/db/types";

type NewSessionDialogProps = {
	open: boolean;
	protocolHash: string;
	onClose: () => void;
	onCreated: (session: StoredSession) => void;
};

const FORM_ID = "new-session-form";

export function NewSessionDialog({ open, protocolHash, onClose, onCreated }: NewSessionDialogProps) {
	const [protocolName, setProtocolName] = useState<string>("");
	const toast = useToast();

	useEffect(() => {
		if (!open) return;
		void getProtocolByHash(protocolHash).then((p) => setProtocolName(p?.name ?? ""));
	}, [open, protocolHash]);

	return (
		<FormStoreProvider>
			<Dialog
				open={open}
				closeDialog={onClose}
				title="Start a new interview"
				description={protocolName ? `Using ${protocolName}` : undefined}
				footer={
					<>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<SubmitButton form={FORM_ID}>Start interview</SubmitButton>
					</>
				}
			>
				<FormWithoutProvider
					id={FORM_ID}
					onSubmit={async (values) => {
						const caseId = String(values.caseId ?? "").trim();
						if (!caseId) {
							return { success: false, fieldErrors: { caseId: ["Case ID is required"] } };
						}
						const protocol = await getProtocolByHash(protocolHash);
						if (!protocol) {
							toast.add({
								title: "Protocol missing",
								description: "Cannot find the selected protocol.",
								variant: "destructive",
							});
							return { success: false };
						}
						const session = await createSession({
							protocolHash,
							protocolName: protocol.name,
							caseId,
							initialNetwork: createInitialNetwork(),
						});
						onCreated(session);
						return { success: true };
					}}
				>
					<Field
						name="caseId"
						label="Case ID"
						hint="A label used to identify this interview in exports."
						component={InputField}
						required="Case ID is required"
						minLength={1}
						validateOnChange
					/>
				</FormWithoutProvider>
			</Dialog>
		</FormStoreProvider>
	);
}
