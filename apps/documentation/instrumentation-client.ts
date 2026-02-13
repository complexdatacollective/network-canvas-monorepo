import { createAnalytics, mergeConfig } from "@codaco/analytics";

const isProduction = process.env.NEXT_PUBLIC_IS_PRODUCTION === "true";

createAnalytics(
	mergeConfig({
		app: "Documentation",
		installationId: "documentation-production",
		disabled: !isProduction,
		posthogOptions: {
			capture_pageview: true,
			capture_pageleave: true,
		},
	}),
);
