import React, { Component, ReactNode } from "react";

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
		this.setState({ error });
		console.log(error); // eslint-disable-line no-console
	}

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
					</div>
				</div>
			);
		}

		return children;
	}
}


export default AppErrorBoundary;
