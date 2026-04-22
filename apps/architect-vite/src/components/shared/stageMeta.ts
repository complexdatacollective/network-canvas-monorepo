import { get } from "es-toolkit/compat";
import timelineImages from "~/images/timeline";

type Meta = { color: string; iconSrc: string };

const COLOR_BY_TYPE: Record<string, string> = {
	Information: "hsl(237 79% 67%)",
	NameGenerator: "hsl(168 100% 39%)",
	NameGeneratorQuickAdd: "hsl(168 100% 39%)",
	NameGeneratorRoster: "hsl(168 100% 39%)",
	Sociogram: "hsl(342 77% 51%)",
	DyadCensus: "hsl(45 100% 47%)",
	OneToManyDyadCensus: "hsl(45 100% 47%)",
	TieStrengthCensus: "hsl(293 87% 50%)",
	OrdinalBin: "hsl(197 88% 47%)",
	CategoricalBin: "hsl(325 100% 46%)",
	Narrative: "hsl(237 77% 67%)",
	AlterForm: "hsl(168 100% 39%)",
	AlterEdgeForm: "hsl(168 100% 39%)",
	EgoForm: "hsl(245 35% 25%)",
	Geospatial: "hsl(168 100% 39%)",
	Anonymisation: "hsl(227 4% 44%)",
	FamilyPedigree: "hsl(237 77% 67%)",
};

const DEFAULT_COLOR = "hsl(168 100% 39%)";

export function getStageDisplayMeta(type: string): Meta {
	const iconSrc = get(timelineImages, type, timelineImages.Default);
	return {
		color: COLOR_BY_TYPE[type] ?? DEFAULT_COLOR,
		iconSrc: typeof iconSrc === "string" ? iconSrc : "",
	};
}
