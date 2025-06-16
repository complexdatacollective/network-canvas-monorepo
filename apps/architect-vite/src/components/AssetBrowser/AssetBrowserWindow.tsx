import { Layout } from "~/components/EditorLayout";
import Button from "~/lib/legacy-ui/components/Button";
import ControlBar from "../ControlBar";
import Dialog from "../Dialog/Dialog";
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

	return (
		<Dialog
			show={show}
			onClose={onCancel}
			className="asset-browser-dialog"
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
		</Dialog>
	);
};


export default AssetBrowserWindow;
