import posthog from "posthog-js";
import { Component, type ReactNode } from "react";
import { Button } from "~/lib/legacy-ui/components";

type AppErrorBoundaryProps = {
	children?: ReactNode;
};

type AppErrorBoundaryState = {
	error: Error | null;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	constructor(props: AppErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
	}

	componentDidCatch(error: Error) {
		posthog.captureException(error);
		this.setState({ error });
	}

	resetError = () => {
		this.setState({ error: null });
	};

	render() {
		const { error } = this.state;
		const { children } = this.props;

		if (error) {
			return (
				<div className="error">
					<div className="error__layout">
						<h1 className="error__title">Something went wrong.</h1>
						<div className="error__message">
							<p>
								The following &quot;
								{error.message}
								&quot; error occurred:
							</p>
						</div>
						<pre className="error__stack">
							<code>{error.stack}</code>
						</pre>
						<Button size="small" color="platinum" onClick={this.resetError}>
							OK
						</Button>
					</div>
				</div>
			);
		}

		return children;
	}
}

export default AppErrorBoundary;
