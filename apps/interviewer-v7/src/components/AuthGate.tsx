import Spinner from "@codaco/fresco-ui/Spinner";
import type { ReactNode } from "react";
import { useAuth } from "~/lib/auth/AuthContext";
import { LockScreen } from "./LockScreen";
import { SetupScreen } from "./SetupScreen";

export function AuthGate({ children }: { children: ReactNode }) {
	const { kind } = useAuth();

	if (kind === "loading") {
		return (
			<div className="flex min-h-dvh items-center justify-center bg-background">
				<Spinner size="lg" />
			</div>
		);
	}
	if (kind === "unconfigured") return <SetupScreen />;
	if (kind === "locked") return <LockScreen />;
	return <>{children}</>;
}
