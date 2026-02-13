import { Component, type ReactNode } from "react";
import { posthog } from "~/analytics";
import { Button } from "~/lib/legacy-ui/components";

type AppErrorBoundaryProps = {
	children?: ReactNode;
};

type AppErrorBoundaryState = {
	error: Error | null;
};

function ensureError(value: unknown): Error {
	if (value instanceof Error) return value;
	try {
		return new Error(JSON.stringify(value));
	} catch {
		return new Error(String(value));
	}
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	constructor(props: AppErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
	}

	componentDidCatch(error: unknown) {
		const normalizedError = ensureError(error);
		posthog.captureException(normalizedError);
		this.setState({ error: normalizedError });
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
