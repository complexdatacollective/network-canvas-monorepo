import DialogManager from "~/components/DialogManager";
import { JsonPreviewOverlay } from "~/components/JsonPreviewOverlay";
import Routes from "~/components/Routes";
import ScrollToTop from "~/components/ScrollToTop";

const AppView = () => {
	return (
		<>
			<ScrollToTop />
			<Routes />
			<DialogManager />
			<JsonPreviewOverlay />
		</>
	);
};

export default AppView;
