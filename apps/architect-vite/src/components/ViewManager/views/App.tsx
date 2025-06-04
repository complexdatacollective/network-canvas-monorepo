import DialogManager from "~/components/DialogManager";
import Routes from "~/components/Routes";
import ToastManager from "~/components/ToastManager";

const AppView = () => {
	return (
		<>
			<Routes />
			<DialogManager />
			<ToastManager />
		</>
	);
};

export default AppView;
