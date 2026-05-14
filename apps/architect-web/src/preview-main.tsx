import "@codaco/tailwind-config/fonts/inclusive-sans.css";
import "@codaco/tailwind-config/fonts/nunito.css";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "./components/Errors";
import { PreviewHost } from "./components/PreviewHost/PreviewHost";

const root = document.getElementById("root") as Element;

createRoot(root).render(
	<AppErrorBoundary>
		<PreviewHost />
	</AppErrorBoundary>,
);
