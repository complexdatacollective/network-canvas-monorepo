import Button from "@codaco/legacy-ui/components/Button";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { Layout } from "~/components/EditorLayout";
import ControlBar from "../ControlBar";
import Screen from "../Screen/Screen";
import { screenVariants } from "../Screens/Screens";
import AssetBrowser from "./AssetBrowser";

type AssetBrowserWindowProps = {
	show?: boolean;
	type?: string | null;
	selected?: string | null;
	onCancel?: () => void;
	onSelect?: () => void;
};

const AssetBrowserWindow = ({ 
	show = true, 
	type = null, 
	selected = null, 
	onCancel = () => {}, 
	onSelect = () => {} 
}: AssetBrowserWindowProps) => {
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


export default AssetBrowserWindow;
