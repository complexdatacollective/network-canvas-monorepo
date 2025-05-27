import cx from "classnames";
import { motion } from "motion/react";
import DialogManager from "~/components/DialogManager";
import { AppErrorBoundary } from "~/components/Errors";
import Routes from "~/components/Routes";
import ToastManager from "~/components/ToastManager";
import useUpdater from "~/hooks/useUpdater";
import { isMacOS } from "~/utils/platform";

const appVariants = {
	show: {
		opacity: 1,
		transition: {
			when: "beforeChildren",
		},
	},
	hide: {
		opacity: 0,
	},
};

const AppView = () => {
	const appClasses = cx("app");

	useUpdater("https://api.github.com/repos/complexdatacollective/Architect/releases/latest", 2500);

	return (
		<>
			{isMacOS() && <div className="electron-titlebar" />}
			<motion.div className={appClasses} variants={appVariants} initial="hide" animate="show">
				<AppErrorBoundary>
					<Routes />
				</AppErrorBoundary>
			</motion.div>
			<DialogManager />
			<ToastManager />
		</>
	);
};

export default AppView;
