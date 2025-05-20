import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import ViewManager from "./components/ViewManager/ViewManager";
import { store } from "./ducks/store";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Provider store={store}>
			<ViewManager />
		</Provider>
	</React.StrictMode>,
);
