import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { AppErrorBoundary } from "./components/Errors";
import AppView from "./components/ViewManager/views/App";
import { store } from "./ducks/store";
import "./styles/main.css";

// TODO: Re add StrictMode when Redux form is removed
createRoot(document.getElementById("root") as Element).render(
	<AppErrorBoundary>
		<Provider store={store}>
			<AppView />
		</Provider>
	</AppErrorBoundary>,
);
