import DialogManager from "~/components/DialogManager";
import Routes from "~/components/Routes";
import ScrollToTop from "~/components/ScrollToTop";
import ToastManager from "~/components/ToastManager";

const AppView = () => {
	return (
		<>
			<ScrollToTop />
			<Routes />
			<DialogManager />
			<ToastManager />
		</>
	);
};

export default AppView;
