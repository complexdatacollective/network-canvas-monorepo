import posthog from "posthog-js";

const POSTHOG_API_KEY = "phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c";
const POSTHOG_HOST = "https://ph-relay.networkcanvas.com";

if (process.env.NEXT_PUBLIC_IS_PRODUCTION === "true") {
	posthog.init(POSTHOG_API_KEY, {
		api_host: POSTHOG_HOST,
		capture_pageview: true,
		capture_pageleave: true,
		capture_exceptions: true,
		autocapture: true,
		disable_session_recording: false,
		session_recording: {
			recordCrossOriginIframes: false,
		},
		cross_subdomain_cookie: false,
		persistence: "localStorage+cookie",
	});

	posthog.register({
		app: "Documentation",
		installation_id: "documentation-production",
	});
}
