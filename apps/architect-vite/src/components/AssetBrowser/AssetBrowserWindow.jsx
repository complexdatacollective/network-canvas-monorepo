import Button from "@codaco/legacy-ui/components/Button";
import { AnimatePresence, motion } from "motion/react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { Layout } from "~/components/EditorLayout";
import ControlBar from "../ControlBar";
import Screen from "../Screen/Screen";
import { screenVariants } from "../Screens/Screens";
import AssetBrowser from "./AssetBrowser";

const AssetBrowserWindow = ({ show, type, selected, onCancel, onSelect }) => {
	const cancelButton = [
		<Button color="platinum" onClick={onCancel} key="cancel">
			Cancel
		</Button>,
	];

	if (!show) {
		return null;
	}

	return createPortal(
		<AnimatePresence>
			{show && (
				<motion.div
					variants={screenVariants}
					initial="hidden"
					animate="visible"
					exit="hidden"
					className="screens-container"
				>
					<Screen
						header={
							<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
								<Layout>
									<h2>Resource Browser</h2>
								</Layout>
							</div>
						}
						footer={<ControlBar buttons={cancelButton} />}
					>
						<Layout>
							<AssetBrowser type={type} onSelect={onSelect} selected={selected} disableDelete />
						</Layout>
					</Screen>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
};

AssetBrowserWindow.propTypes = {
	show: PropTypes.bool,
	type: PropTypes.string,
	selected: PropTypes.string,
	onSelect: PropTypes.func,
	onCancel: PropTypes.func,
};

AssetBrowserWindow.defaultProps = {
	show: true,
	type: null,
	selected: null,
	onSelect: () => {},
	onCancel: () => {},
};

export default AssetBrowserWindow;
