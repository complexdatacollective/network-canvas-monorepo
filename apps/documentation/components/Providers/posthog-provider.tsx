"use client";

import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import type { ReactNode } from "react";

export function PostHogClientProvider({ children }: { children: ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<PostHogErrorBoundary>{children}</PostHogErrorBoundary>
		</PostHogProvider>
	);
}
