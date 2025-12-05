import { Component } from "react";
import ExternalLink from "../../ExternalLink";
import Dialog from "../../NewComponents/Dialog";
import EditEgoRule from "./EditEgoRule";
import EditEntityRule from "./EditEntityRule";

type EditRuleProps = {
	rule?: {
		type?: string;
		options?: Record<string, unknown>;
	};
	codebook: Record<string, unknown>;
	onChange: (value: Record<string, unknown>) => void;
	onSave: () => void;
	onCancel: () => void;
};

class EditRule extends Component<EditRuleProps> {
	static defaultProps = {
		rule: undefined,
	};
	get TypeComponent() {
		const { rule } = this.props;
		if (rule?.type === "ego") {
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
				open={!!rule}
				onOpenChange={(open) => !open && onCancel()}
				title="Construct a Rule"
				onConfirm={onSave}
				onCancel={onCancel}
				confirmText="Finish and Close"
				cancelText="Cancel"
			>
				<div>
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
					{rule?.type && <this.TypeComponent rule={rule} codebook={codebook} onChange={onChange} />}
				</div>
			</Dialog>
		);
	}
}

export default EditRule;
