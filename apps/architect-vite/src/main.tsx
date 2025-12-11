import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { AppErrorBoundary } from "./components/Errors";
import AppView from "./components/ViewManager/views/App";
import { store } from "./ducks/store";

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
	api_host: "https://ph-relay.networkcanvas.com",
	ui_host: "https://us.posthog.com",
	capture_pageview: true,
	capture_pageleave: true,
	disable_session_recording: false,
	capture_exceptions: true,
	debug: import.meta.env.DEV,
});

const root = document.getElementById("root") as Element;

createRoot(root).render(
	<PostHogProvider client={posthog}>
		<AppErrorBoundary>
			<Provider store={store}>
				<AppView />
			</Provider>
		</AppErrorBoundary>
	</PostHogProvider>,
);
