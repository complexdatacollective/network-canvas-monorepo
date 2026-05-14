import { COLOR_PALETTE_BY_ENTITY, COLOR_PALETTES } from "../../config";

const getPalette = (category: string) => {
	const name = category === "edge" ? COLOR_PALETTE_BY_ENTITY.edge : COLOR_PALETTE_BY_ENTITY.node;

	const size = COLOR_PALETTES[name as keyof typeof COLOR_PALETTES];

	return { name, size };
};

export default getPalette;
