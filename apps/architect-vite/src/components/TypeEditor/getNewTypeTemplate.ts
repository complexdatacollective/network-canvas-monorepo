import type { CurrentProtocol } from "@codaco/protocol-validation";
import { getNextCategoryColor } from "../../ducks/modules/protocol/utils/helpers";

const getNewTypeTemplate = ({ protocol, entity }: { protocol: CurrentProtocol; entity: "node" | "edge" }) => ({
	...(entity === "node" && { iconVariant: "add-a-person" }),
	color: getNextCategoryColor(protocol, entity),
});

export default getNewTypeTemplate;
