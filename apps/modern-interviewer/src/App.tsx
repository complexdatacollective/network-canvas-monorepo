import DialogProvider from "@codaco/fresco-ui/dialogs/DialogProvider";
import { Route, Switch } from "wouter";
import AppShell from "./components/AppShell";
import DashboardPage from "./pages/DashboardPage";
import ExportPage from "./pages/ExportPage";
import InterviewRunnerPage from "./pages/InterviewRunnerPage";
import InterviewsPage from "./pages/InterviewsPage";
import ProtocolDetailPage from "./pages/ProtocolDetailPage";
import ProtocolsPage from "./pages/ProtocolsPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
	return (
		<DialogProvider>
			<Switch>
				{/* Runner page lives outside the dashboard chrome — the interview
					Shell takes the whole viewport. */}
				<Route path="/interview/:id">{(params) => <InterviewRunnerPage interviewId={params.id} />}</Route>

				<Route>
					<AppShell>
						<Switch>
							<Route path="/" component={DashboardPage} />
							<Route path="/protocols" component={ProtocolsPage} />
							<Route path="/protocols/:id">{(params) => <ProtocolDetailPage protocolId={params.id} />}</Route>
							<Route path="/interviews" component={InterviewsPage} />
							<Route path="/export" component={ExportPage} />
							<Route path="/settings" component={SettingsPage} />
							<Route>{() => <DashboardPage />}</Route>
						</Switch>
					</AppShell>
				</Route>
			</Switch>
		</DialogProvider>
	);
}
