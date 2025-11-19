import { Component } from "react";
import { Flipped } from "react-flip-toolkit";
import { connect } from "react-redux";
import { type StoredProtocol, selectRecentProtocols } from "~/ducks/modules/protocols";
import type { RootState } from "~/ducks/modules/root";
import ProtocolStack from "./ProtocolStack";

// Use StoredProtocol type instead
// type RecentProtocol = {
//   filePath: string;
//   lastModified: string;
//   name: string;
//   schemaVersion: string;
// };

type RecentProtocolsProps = {
	recentProtocols: StoredProtocol[];
	show?: boolean;
};

const getRecentProtocols = (state: RootState) => selectRecentProtocols(4)(state);

class RecentProtocols extends Component<RecentProtocolsProps> {
	renderRecentProtocol = (protocol: StoredProtocol) => (
		<div key={protocol.id} className="recent-protocols__protocol">
			<Flipped flipId={protocol.id}>
				<ProtocolStack protocol={protocol} />
			</Flipped>
		</div>
	);

	renderWelcomeText = () => (
		<div className="recent-protocols__welcome">
			<h1>Getting Started</h1>
			<p>
				Welcome to Network Canvas Architect! To get started, use the buttons above to create a new interview protocol,
				or open an existing one from elsewhere. When you return to this screen later, recent protocols you have opened
				will be shown here.
			</p>
		</div>
	);

	renderProtocolList = (recentProtocols: StoredProtocol[]) => (
		<>
			<h3 className="recent-protocols__title" key="heading">
				Recently Opened Protocols
			</h3>
			<div className="recent-protocols__wrapper">{recentProtocols.map(this.renderRecentProtocol)}</div>
		</>
	);

	render() {
		const { show, recentProtocols } = this.props;

		if (!show) {
			return null;
		}

		return (
			<div className="recent-protocols">
				{recentProtocols.length === 0 ? this.renderWelcomeText() : this.renderProtocolList(recentProtocols)}
			</div>
		);
	}
}

const mapStateToProps = (state: RootState) => ({
	recentProtocols: getRecentProtocols(state),
});

// Default props handled via TypeScript default parameter values

export { RecentProtocols as UnconnectedRecentProtocols };

export default connect(mapStateToProps)(RecentProtocols);
