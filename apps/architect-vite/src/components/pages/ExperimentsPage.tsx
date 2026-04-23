import { useLocation } from "wouter";
import Switch from "~/components/NewComponents/Switch";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { actionCreators } from "~/ducks/modules/activeProtocol";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getExperiments, getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const ExperimentsPage = () => {
	useProtocolLoader();
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const experiments = useAppSelector(getExperiments) ?? {};

	const handleToggleExperiment = (key: string, checked: boolean) => {
		dispatch(
			actionCreators.updateProtocol({
				experiments: { ...experiments, [key]: checked },
			}),
		);
	};

	const isEncryptedEnabled = experiments.encryptedVariables ?? false;

	return (
		<div className="flex h-dvh flex-col pt-16">
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Experiments"
				actions={<SubRouteNav active="experiments" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto">
				<div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
					<Card padding="lg">
						<div className="flex items-center justify-between gap-4">
							<div className="flex flex-col">
								<span className="font-heading text-base font-extrabold">Encrypted Variables</span>
								<span className="text-xs" style={{ color: "hsl(220 4% 44%)" }}>
									Enable support for encrypted variables in the codebook. This allows sensitive data to be collected
									securely.
								</span>
							</div>
							<Switch
								checked={isEncryptedEnabled}
								onCheckedChange={(checked) => handleToggleExperiment("encryptedVariables", checked)}
							/>
						</div>
					</Card>
				</div>
			</main>
		</div>
	);
};

export default ExperimentsPage;
