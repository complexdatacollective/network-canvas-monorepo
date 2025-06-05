import ScreenLink from "~/components/Screens/ScreenLink";
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
	if (!inUse) {
		return (
			<Tag key="unused" notUsed>
				not in use
			</Tag>
		);
	}

	const stages = usage.map(({ id, label }) => {
		// If there is no id, don't create a link. This is the case for
		// variables that are only in use as validation options.
		if (!id) {
			return <Tag key="validation-option">{label}</Tag>;
		}
		return (
			<ScreenLink screen="stage" id={id} key={id}>
				{label}
			</ScreenLink>
		);
	});

	return (
		<div className="codebook__variables-usage-container" key="usage">
			{stages}
		</div>
	);
};


export default UsageColumn;
