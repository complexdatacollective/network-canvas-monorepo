import "@codaco/tailwind-config/fresco.css";
import "@codaco/fresco-ui/styles.css";
import "@codaco/interview/styles.css";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "./components/Errors";
import { PreviewHost } from "./components/PreviewHost/PreviewHost";

const root = document.getElementById("root") as Element;

createRoot(root).render(
	<AppErrorBoundary>
		<PreviewHost />
	</AppErrorBoundary>,
);
