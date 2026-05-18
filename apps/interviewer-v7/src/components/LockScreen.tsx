import Button from "@codaco/fresco-ui/Button";
import Surface from "@codaco/fresco-ui/layout/Surface";
import { useToast } from "@codaco/fresco-ui/Toast";
import Heading from "@codaco/fresco-ui/typography/Heading";
import Paragraph from "@codaco/fresco-ui/typography/Paragraph";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "~/lib/auth/AuthContext";

export function LockScreen() {
	const { unlockWithAuthenticator } = useAuth();
	const toast = useToast();
	const [busy, setBusy] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	const handleUnlock = async () => {
		setErrorMessage(null);
		setBusy(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const result = await unlockWithAuthenticator(controller.signal);
			if (result.ok) return;
			const message = result.message ?? "";
			if (/NotAllowedError/i.test(message)) {
				toast.add({ title: "Unlock cancelled", variant: "default" });
				return;
			}
			setErrorMessage(message || "Could not unlock. Please try again.");
		} finally {
			setBusy(false);
			abortRef.current = null;
		}
	};

	return (
		<div className="flex min-h-dvh items-center justify-center">
			<Surface level={1} spacing="lg" maxWidth="sm">
				<Heading level="h1">Device locked</Heading>
				<Paragraph intent="lead">Authenticate to unlock this device and resume your work.</Paragraph>

				{errorMessage && (
					<div className="bg-destructive text-destructive-contrast mb-4 rounded p-4" role="alert">
						<Paragraph margin="none">{errorMessage}</Paragraph>
					</div>
				)}

				<Button type="button" color="primary" onClick={handleUnlock} disabled={busy}>
					{busy ? "Waiting for authenticator…" : "Unlock with authenticator"}
				</Button>
			</Surface>
		</div>
	);
}
