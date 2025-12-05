import DialogManager from "~/components/DialogManager";
import Routes from "~/components/Routes";
import ScrollToTop from "~/components/ScrollToTop";

const AppView = () => {
	return (
		<>
			<ScrollToTop />
			<Routes />
			<DialogManager />
		</>
	);
};

export default AppView;
