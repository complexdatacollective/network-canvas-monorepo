import { Component } from "react";
import Dialog from "../../NewComponents/Dialog";
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
				open={!!rule}
				onOpenChange={(open) => !open && onCancel()}
				title="Construct a Rule"
				onConfirm={onSave}
				onCancel={onCancel}
				confirmText="Finish and Close"
				cancelText="Cancel"
				confirmColor="primary"
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
					{rule?.options && <this.TypeComponent rule={rule} codebook={codebook} onChange={onChange} />}
				</div>
			</Dialog>
		);
	}
}

export default EditRule;
