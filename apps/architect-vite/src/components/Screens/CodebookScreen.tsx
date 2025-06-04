import { Button } from "@codaco/legacy-ui/components";
import Codebook from "~/components/Codebook/Codebook";
import { Layout } from "~/components/EditorLayout";
import Screen from "~/components/Screen/Screen";
import ControlBar from "../ControlBar";
import CollapsableHeader from "../Screen/CollapsableHeader";

type CodebookScreenProps = {
	layoutId?: string | null;
	onComplete?: () => void;
};

/**
 * This component acts as an index for types. i.e. Nodes and Edges,
 * and links to the EditType.
 */
const CodebookScreen = ({ layoutId = null, onComplete = () => {} }: CodebookScreenProps) => {

	const buttons = [
		<Button key="done" onClick={onComplete} color="platinum">
			Close
		</Button>,
	];

	return (
		<Screen layoutId={layoutId} footer={<ControlBar buttons={buttons} />} onComplete={onComplete}>
			<CollapsableHeader
				collapsedState={
					<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
						<Layout>
							<h2>Codebook</h2>
						</Layout>
					</div>
				}
			>
				<div className="stage-heading stage-heading--inline">
					<Layout>
						<h1 className="screen-heading">Codebook</h1>
						<p>
							Below you can find an overview of the node and edge types that you have defined while creating your
							interview. Entities that are unused may be deleted.
						</p>
					</Layout>
				</div>
			</CollapsableHeader>
			<Layout>
				<Codebook />
			</Layout>
		</Screen>
	);
};


export default CodebookScreen;
