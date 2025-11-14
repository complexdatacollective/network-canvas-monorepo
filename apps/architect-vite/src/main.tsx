import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { AppErrorBoundary } from "./components/Errors";
import AppView from "./components/ViewManager/views/App";
import { store } from "./ducks/store";

if (import.meta.env.PROD) {
	posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
		api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
		defaults: "2025-05-24",
	});
} else {
	// dev: disable sending events
	posthog.init("dev-disabled", {
		loaded: (client) => client.opt_out_capturing(),
	});
}

// TODO: Re add StrictMode when Redux form is removed
createRoot(document.getElementById("root") as Element).render(
	<PostHogProvider client={posthog}>
		<AppErrorBoundary>
			<Provider store={store}>
				<AppView />
			</Provider>
		</AppErrorBoundary>
	</PostHogProvider>,
);
