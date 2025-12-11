import { AnalyticsContext } from "@codaco/analytics";
import { Component, type ReactNode, useContext, useEffect } from "react";
import { Button } from "~/lib/legacy-ui/components";

type AppErrorBoundaryProps = {
	children?: ReactNode;
};

type AppErrorBoundaryState = {
	error: Error | null;
};

/**
 * Component to track errors via analytics when they occur.
 * Rendered inside the error boundary to access the analytics context.
 * Gracefully handles the case where analytics isn't available (e.g., dev mode).
 */
function ErrorTracker({ error }: { error: Error }) {
	const analytics = useContext(AnalyticsContext);

	useEffect(() => {
		if (!analytics) return;

		analytics.trackError(error, {
			metadata: {
				errorName: error.name,
				source: "app_error_boundary",
			},
		});
	}, [error, analytics]);

	return null;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	constructor(props: AppErrorBoundaryProps) {
		super(props);
		this.state = { error: null };
	}

	componentDidCatch(error: Error) {
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
					<ErrorTracker error={error} />
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
