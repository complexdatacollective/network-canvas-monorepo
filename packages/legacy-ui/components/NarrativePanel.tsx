import cx from "classnames";
import type { ReactNode } from "react";
import { Component } from "react";
import Expandable from "./Expandable";

interface NarrativePanelProps {
	title: string;
	children?: ReactNode;
}

interface NarrativePanelState {
	open: boolean;
}

class NarrativePanel extends Component<NarrativePanelProps, NarrativePanelState> {
	constructor(props: NarrativePanelProps) {
		super(props);

		this.state = {
			open: false,
		};
	}

	toggleOpen = () => {
		this.setState((prevState) => ({ open: !prevState.open }));
	};

	render() {
		const {
			props: { title, children },
			state,
			toggleOpen,
		} = this;

		return (
			<div className={cx("narrative-panel", { "narrative-panel--open": state.open })}>
				<div className="narrative-panel__heading" role="button" tabIndex={0} onClick={toggleOpen}>
					{title}
				</div>
				<Expandable className="narrative-panel__options" open={state.open}>
					<div className="narrative-panel__options-content">{children}</div>
				</Expandable>
			</div>
		);
	}
}

export default NarrativePanel;
