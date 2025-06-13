import { Link, useLocation } from "wouter";
import Tag from "./Tag";

type UsageItem = {
	id?: string;
	label: string;
};

type UsageColumnProps = {
	usage: UsageItem[];
	inUse: boolean;
};

const UsageColumn = ({ inUse, usage }: UsageColumnProps) => {
	const [location] = useLocation();
	
	if (!inUse) {
		return (
			<Tag key="unused" notUsed>
				not in use
			</Tag>
		);
	}

	// Extract protocol ID from current location
	const getProtocolId = () => {
		const match = location.match(/\/protocol\/([^\/]+)/);
		return match ? match[1] : null;
	};

	const stages = usage.map(({ id, label }) => {
		// If there is no id, don't create a link. This is the case for
		// variables that are only in use as validation options.
		if (!id) {
			return <Tag key="validation-option">{label}</Tag>;
		}
		
		const protocolId = getProtocolId();
		const href = protocolId ? `/protocol/${protocolId}/stages/${id}` : '#';
		
		return (
			<Link key={id} href={href}>
				<Tag>{label}</Tag>
			</Link>
		);
	});

	return (
		<div className="codebook__variables-usage-container" key="usage">
			{stages}
		</div>
	);
};


export default UsageColumn;
