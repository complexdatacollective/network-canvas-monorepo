import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { AppErrorBoundary } from "./components/Errors";
import AppView from "./components/ViewManager/views/App";
import { store } from "./ducks/store";
import "./styles/main.scss";

createRoot(document.getElementById("root") as Element).render(
  
	<StrictMode>
    <AppErrorBoundary>
		<Provider store={store}>
			<AppView />
		</Provider>
    </AppErrorBoundary>
	</StrictMode>,
);
