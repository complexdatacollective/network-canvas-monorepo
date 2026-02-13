import "./analytics";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { AppErrorBoundary } from "./components/Errors";
import AppView from "./components/ViewManager/views/App";
import { store } from "./ducks/store";

const root = document.getElementById("root") as Element;

createRoot(root).render(
	<AppErrorBoundary>
		<Provider store={store}>
			<AppView />
		</Provider>
	</AppErrorBoundary>,
);
