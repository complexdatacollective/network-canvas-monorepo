import { getNextCategoryColor } from "../../ducks/modules/protocol/utils/helpers";

type Protocol = Record<string, unknown>;

const getNewTypeTemplate = ({ protocol, entity }: { protocol: Protocol; entity: string }) => ({
	...(entity === "node" && { iconVariant: "add-a-person" }),
	color: getNextCategoryColor(protocol, entity),
});

export default getNewTypeTemplate;
