import { get } from "es-toolkit/compat";
import { Flipped } from "react-flip-toolkit";
import { connect } from "react-redux";
import { actionCreators as sessionActions } from "~/ducks/modules/session";
import protocolCover from "~/images/NC-File.svg";

type Protocol = {
	filePath: string;
};

type ProtocolStackProps = {
	protocol: Protocol;
	openNetcanvas: (filePath: string) => void;
};

const getFilename = (path = "") => get(path.match(/([^/\\]+)$/), 1, path);

const ProtocolStack = ({ openNetcanvas, protocol: { filePath } }: ProtocolStackProps) => (
	<div className="protocol-stack" onClick={() => openNetcanvas(filePath)}>
		<div className="protocol-stack__preview">
			<Flipped flipId={encodeURIComponent(filePath)}>
				<div className="protocol-stack__stack">
					<div className="protocol-stack__stack-cover">
						<img src={protocolCover} alt="" />
					</div>
				</div>
			</Flipped>
		</div>
		<h4 className="protocol-stack__label">{getFilename(filePath)}</h4>
		<p className="protocol-stack__filepath" alt={filePath}>
			{filePath}
		</p>
	</div>
);


const mapDispatchToProps = {
	openNetcanvas: sessionActions.openNetcanvas,
};

export default connect(null, mapDispatchToProps)(ProtocolStack);
