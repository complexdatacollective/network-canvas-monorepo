"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useSession } from "~/hooks/use-auth";

type AuthGuardProps = {
	children: ReactNode;
	fallback?: ReactNode;
};

export function AuthGuard({ children, fallback }: AuthGuardProps) {
	const router = useRouter();
	const pathname = usePathname();
	const { data: session, isLoading, error } = useSession();

	useEffect(() => {
		if (!isLoading && (!session || error)) {
			const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}`;
			router.push(redirectUrl);
		}
	}, [session, isLoading, error, router, pathname]);

	if (isLoading) {
		return (
			fallback ?? (
				<div className="flex h-screen items-center justify-center bg-slate-50">
					<div className="text-center">
						<Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
						<p className="mt-4 text-sm text-slate-600">Verifying authentication...</p>
					</div>
				</div>
			)
		);
	}

	if (!session || error) {
		return null;
	}

	return <>{children}</>;
}
