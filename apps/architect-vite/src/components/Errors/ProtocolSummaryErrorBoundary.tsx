import { Component, type ReactNode } from "react";
import Button from "~/lib/legacy-ui/components/Button";

// Browser-only implementation - electron functionality removed
const closeWindow = () => {
	console.log("Window close requested - needs reimplementation for web");
	window.close();
};

type ProtocolSummaryErrorBoundaryProps = {
	children?: ReactNode;
};

type ProtocolSummaryErrorBoundaryState = {
	error: Error | null;
};

class ProtocolSummaryErrorBoundary extends Component<
	ProtocolSummaryErrorBoundaryProps,
	ProtocolSummaryErrorBoundaryState
> {
	constructor(props: ProtocolSummaryErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
	}

	componentDidCatch(error: Error) {
		this.setState({ error });
	}

	render() {
		const { error } = this.state;
		const { children } = this.props;

		if (error) {
			return (
				<div className="error">
					<div className="error__layout">
						<h1 className="error__title">There was an error creating the protocol summary.</h1>
						<div className="error__message">
							<p>
								The following &quot;
								{error.message}
								&quot; error occurred:
							</p>
						</div>
						<pre className="error__stack allow-text-selection">
							<code>{error.stack}</code>
						</pre>
						<p>
							Please help us to find and fix this error by contacting the Network Canvas team and providing the text
							above.
						</p>
						<Button color="platinum" onClick={closeWindow}>
							Close Window
						</Button>
					</div>
				</div>
			);
		}

		return children;
	}
}

export default ProtocolSummaryErrorBoundary;
