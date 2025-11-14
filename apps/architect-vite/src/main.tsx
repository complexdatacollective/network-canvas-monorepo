import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { AppErrorBoundary } from "./components/Errors";
import AppView from "./components/ViewManager/views/App";
import { store } from "./ducks/store";

const isProd = import.meta.env.PROD;

// Initialize PostHog only in production
if (isProd) {
	posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
		api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
		defaults: "2025-05-24",
	});
}

const root = document.getElementById("root") as Element;

createRoot(root).render(
	isProd ? (
		<PostHogProvider client={posthog}>
			<AppErrorBoundary>
				<Provider store={store}>
					<AppView />
				</Provider>
			</AppErrorBoundary>
		</PostHogProvider>
	) : (
		<AppErrorBoundary>
			<Provider store={store}>
				<AppView />
			</Provider>
		</AppErrorBoundary>
	),
);
