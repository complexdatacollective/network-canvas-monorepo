import type { CurrentProtocol } from "@codaco/protocol-validation";
import { getNextCategoryColor } from "../../ducks/modules/protocol/utils/helpers";

const getNewTypeTemplate = ({ protocol, entity }: { protocol: CurrentProtocol; entity: "node" | "edge" }) => ({
	...(entity === "node" && { icon: "add-a-person" }),
	...(entity === "node" && { shape: { default: "circle" } }),
	color: getNextCategoryColor(protocol, entity),
});

export default getNewTypeTemplate;
