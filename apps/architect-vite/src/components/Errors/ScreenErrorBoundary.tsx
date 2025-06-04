import { Button } from "@codaco/legacy-ui/components";
import React, { Component, ReactNode } from "react";

type CardErrorBoundaryProps = {
	children?: ReactNode;
	onAcknowledge?: (() => void) | null;
};

type CardErrorBoundaryState = {
	error: Error | null;
};

class CardErrorBoundary extends Component<CardErrorBoundaryProps, CardErrorBoundaryState> {
	constructor(props: CardErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
	}

	componentDidCatch(error: Error) {
		this.setState({ error });
		console.log(error); // eslint-disable-line no-console
	}

	canAcknowledge = () => {
		const { onAcknowledge } = this.props;
		return !!onAcknowledge;
	};

	render() {
		const { error } = this.state;
		const { onAcknowledge, children } = this.props;

		if (error) {
			return (
				<div className="error">
					<div className="error__layout">
						<h1 className="error__title">Something went wrong.</h1>
						<div className="error__message">
							{error.message && <p>{error.message}</p>}
							{this.canAcknowledge() && (
								<Button size="small" color="platinum" onClick={onAcknowledge}>
									OK
								</Button>
							)}
						</div>
					</div>
				</div>
			);
		}

		return children;
	}
}


export default CardErrorBoundary;
