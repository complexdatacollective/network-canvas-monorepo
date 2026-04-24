import { CodeXml, Trash, Wrench } from "lucide-react";
import { useState } from "react";
import { DEVELOPMENT_PROTOCOL_URL } from "~/config";
import { useAppDispatch } from "~/ducks/hooks";
import { openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import Button, { IconButton } from "~/lib/legacy-ui/components/Button";
import { clearAllStorage } from "~/utils/assetDB";
import FloatingSurface from "../FloatingSurface";

type DevToolsProps = {
	runAction: (action: () => Promise<unknown>) => Promise<void>;
};

const DevTools = ({ runAction }: DevToolsProps) => {
	const dispatch = useAppDispatch();
	const [expanded, setExpanded] = useState(false);

	if (!import.meta.env.DEV) return null;

	const installDevelopmentProtocol = () =>
		runAction(async () => {
			await dispatch(openRemoteNetcanvas(DEVELOPMENT_PROTOCOL_URL));
		});

	const handleClearStorage = () => clearAllStorage();

	return (
		<div className="fixed bottom-4 right-4 z-(--z-global-ui) flex flex-col items-end sm:flex-row sm:items-center gap-2">
			{expanded && (
				<FloatingSurface
					shape="card"
					shapeSm="pill"
					className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center"
				>
					<Button
						title="Install development protocol"
						icon={<CodeXml />}
						color="platinum"
						size="small"
						onClick={installDevelopmentProtocol}
					>
						Install Development Protocol
					</Button>
					<Button
						title="Clear Redux state, localStorage, and IndexedDB"
						icon={<Trash />}
						color="tomato"
						size="small"
						onClick={handleClearStorage}
					>
						Clear All Data
					</Button>
				</FloatingSurface>
			)}
			<IconButton
				aria-label={expanded ? "Collapse dev tools" : "Expand dev tools"}
				title={expanded ? "Collapse dev tools" : "Expand dev tools"}
				icon={<Wrench />}
				color="mustard"
				onClick={() => setExpanded((e) => !e)}
				className="shadow-sm"
			/>
		</div>
	);
};

export default DevTools;
