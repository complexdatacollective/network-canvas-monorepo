import { Component } from "react";
import Button from "~/lib/legacy-ui/components/Button";
import CollapsableHeader from "../../CollapsableHeader";
import ControlBar from "../../ControlBar";
import Dialog from "../../Dialog/Dialog";
import Layout from "../../EditorLayout/Layout";
import ExternalLink from "../../ExternalLink";
import EditEgoRule from "./EditEgoRule";
import EditEntityRule from "./EditEntityRule";

type EditRuleProps = {
	rule?: {
		type?: string;
		options?: Record<string, unknown>;
	};
	codebook: Record<string, unknown>;
	onChange: (value: any) => void;
	onSave: () => void;
	onCancel: () => void;
};

class EditRule extends Component<EditRuleProps> {
	static defaultProps = {
		rule: {
			type: null,
			options: null,
		},
	};
	get TypeComponent() {
		const {
			rule: { type },
		} = this.props;
		if (type === "ego") {
			return EditEgoRule;
		}

		return EditEntityRule;
	}

	handleSave = () => {
		const { onSave } = this.props;
		onSave();
	};

	render() {
		const { rule, codebook, onChange, onCancel, onSave } = this.props;

		return (
			<Dialog
				show={!!rule}
				onClose={onCancel}
				className="rule-dialog"
				footer={
					<ControlBar
						buttons={[
							<Button type="button" onClick={onCancel} color="platinum">
								Cancel
							</Button>,
							<Button type="button" onClick={onSave} color="primary">
								Finish and Close
							</Button>,
						]}
					/>
				}
			>
				<CollapsableHeader
					collapsedState={
						<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
							<Layout>
								<h2>Construct a Rule</h2>
							</Layout>
						</div>
					}
				>
					<div className="stage-heading stage-heading--inline">
						<Layout>
							<h1 className="screen-heading">Construct a Rule</h1>
							<p>
								For help with constructing rules, see our documentation articles on{" "}
								<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/skip-logic/">
									skip logic
								</ExternalLink>{" "}
								and{" "}
								<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/network-filtering/">
									network filtering
								</ExternalLink>
								.
							</p>
						</Layout>
					</div>
				</CollapsableHeader>
				{rule?.options && <this.TypeComponent rule={rule} codebook={codebook} onChange={onChange} />}
			</Dialog>
		);
	}
}


export default EditRule;
