import { get } from "es-toolkit/compat";
import timelineImages from "~/images/timeline";

type Meta = { color: string; iconSrc: string; subLabel: string };

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

const SUB_LABEL_BY_TYPE: Record<string, string> = {
	Information: "Information screen",
	NameGenerator: "Name generator",
	NameGeneratorQuickAdd: "Quick add",
	NameGeneratorRoster: "Roster",
	Sociogram: "Sociogram",
	DyadCensus: "Dyad census",
	OneToManyDyadCensus: "One-to-many dyad census",
	TieStrengthCensus: "Tie strength census",
	OrdinalBin: "Ordinal bin",
	CategoricalBin: "Categorical bin",
	Narrative: "Narrative",
	AlterForm: "Alter form",
	AlterEdgeForm: "Alter edge form",
	EgoForm: "Ego form",
	Geospatial: "Geospatial",
	Anonymisation: "Anonymisation",
	FamilyPedigree: "Family pedigree",
};

const DEFAULT_COLOR = "hsl(168 100% 39%)";

// Splits a PascalCase stage type into a sentence (e.g. "NameGenerator" -> "Name generator").
function humanizeStageType(type: string): string {
	const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
	if (!spaced) return type;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function getStageDisplayMeta(type: string): Meta {
	const iconSrc = get(timelineImages, type, timelineImages.Default);
	return {
		color: COLOR_BY_TYPE[type] ?? DEFAULT_COLOR,
		iconSrc: typeof iconSrc === "string" ? iconSrc : "",
		subLabel: SUB_LABEL_BY_TYPE[type] ?? humanizeStageType(type),
	};
}
