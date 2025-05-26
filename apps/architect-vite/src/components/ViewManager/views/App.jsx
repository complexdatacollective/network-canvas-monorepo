import cx from "classnames";
import { motion } from "motion/react";
import DialogManager from "~/src/components/DialogManager";
import { AppErrorBoundary } from "~/src/components/Errors";
import Routes from "~/src/components/Routes";
import ToastManager from "~/src/components/ToastManager";
import useUpdater from "~/src/hooks/useUpdater";
import { isMacOS } from "~/src/utils/platform";

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
