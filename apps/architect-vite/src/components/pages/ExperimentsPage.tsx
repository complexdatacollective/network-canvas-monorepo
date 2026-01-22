import { FlaskConical } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import { Layout } from "~/components/EditorLayout";
import Switch from "~/components/NewComponents/Switch";
import { actionCreators } from "~/ducks/modules/activeProtocol";
import { Button } from "~/lib/legacy-ui/components";
import { getExperiments, getProtocol } from "~/selectors/protocol";
import { cn } from "~/utils/cn";

const ExperimentsPage = () => {
	const [, setLocation] = useLocation();
	const dispatch = useDispatch();
	const protocol = useSelector(getProtocol);
	const experiments = useSelector(getExperiments) ?? {};

	const handleGoBack = () => {
		setLocation("/protocol");
	};

	const handleToggleExperiment = (key: string, checked: boolean) => {
		dispatch(
			actionCreators.updateProtocol({
				experiments: { ...experiments, [key]: checked },
			}),
		);
	};

	if (!protocol) {
		return (
			<Layout>
				<div className="flex flex-col items-center justify-center h-full gap-4">
					<p>No protocol loaded. Please open a protocol first.</p>
					<Button onClick={() => setLocation("/")} color="platinum">
						Go Home
					</Button>
				</div>
			</Layout>
		);
	}

	const isEncryptedEnabled = experiments.encryptedVariables ?? false;

	return (
		<div className="relative flex flex-col h-dvh">
			<div className="flex-1 overflow-y-auto">
				<Layout>
					<div
						className="flex flex-col gap-6"
						style={{
							margin: "var(--space-xl) var(--space-5xl)",
							maxWidth: "80rem",
						}}
					>
						<div className="stage-heading">
							<div className="flex items-center gap-3">
								<div className="p-2 rounded-lg bg-mustard/20">
									<FlaskConical className="w-6 h-6 text-mustard" />
								</div>
								<h1 className="screen-heading">Experimental Features</h1>
							</div>
							<p>These features are experimental and may not be fully supported.</p>
						</div>

						<div className="flex flex-col gap-4">
							<div
								className={cn(
									"flex items-center gap-4 p-4 rounded-lg transition-colors",
									isEncryptedEnabled ? "border-sea-green/50 bg-sea-green/10" : "bg-surface-1",
								)}
							>
								<div className="flex-1 min-w-0">
									<h4>Encrypted Variables</h4>
									<p className="text-sm text-muted-foreground">
										Enable support for encrypted variables in the codebook. This allows sensitive data to be collected
										securely.
									</p>
								</div>
								<Switch
									checked={isEncryptedEnabled}
									onCheckedChange={(checked) => handleToggleExperiment("encryptedVariables", checked)}
								/>
							</div>
						</div>
					</div>
				</Layout>
			</div>
			<ControlBar
				secondaryButtons={[
					<Button key="go-back" onClick={handleGoBack} color="platinum">
						Go Back
					</Button>,
				]}
			/>
		</div>
	);
};

export default ExperimentsPage;
