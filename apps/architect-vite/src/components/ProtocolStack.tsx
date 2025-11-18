import { Flipped } from "react-flip-toolkit";
import { useLocation } from "wouter";
import type { StoredProtocol } from "~/ducks/modules/protocols";
import protocolCover from "~/images/NC-File.svg";

type ProtocolStackProps = {
	protocol: StoredProtocol;
};

const ProtocolStack = ({ protocol }: ProtocolStackProps) => {
	const [, navigate] = useLocation();

	const handleClick = () => {
		navigate(`/protocol/${protocol.id}`);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			navigate(`/protocol/${protocol.id}`);
		}
	};

	return (
		<div
			className="protocol-stack"
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			role="button"
			tabIndex={0}
			aria-label={`Open protocol ${protocol.name}`}
		>
			<div className="protocol-stack__preview">
				<Flipped flipId={protocol.id}>
					<div className="protocol-stack__stack">
						<div className="protocol-stack__stack-cover">
							<img src={protocolCover} alt="" />
						</div>
					</div>
				</Flipped>
			</div>
			<h4 className="protocol-stack__label">{protocol.name}</h4>
			<p className="protocol-stack__filepath" alt={protocol.description || "No description"}>
				{protocol.description || "No description"}
			</p>
		</div>
	);
};

export default ProtocolStack;
