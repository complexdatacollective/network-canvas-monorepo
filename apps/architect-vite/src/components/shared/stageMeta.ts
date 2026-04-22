import categoricalIcon from "~/images/landing/categorical.svg";
import interfaceIcon from "~/images/landing/interface.svg";
import menuOrdIcon from "~/images/landing/menu-ord.svg";
import menuSociogramIcon from "~/images/landing/menu-sociogram.svg";
import nameGeneratorIcon from "~/images/landing/name-generator.svg";
import relationshipIcon from "~/images/landing/relationship.svg";

type Meta = { color: string; iconSrc: string; subLabel: string };

const COLOR_BY_TYPE: Record<string, string> = {
	Information: "hsl(237 79% 67%)",
	NameGenerator: "hsl(342 77% 51%)",
	NameGeneratorQuickAdd: "hsl(342 77% 51%)",
	NameGeneratorRoster: "hsl(342 77% 51%)",
	Sociogram: "hsl(46 100% 47%)",
	DyadCensus: "hsl(46 100% 47%)",
	OneToManyDyadCensus: "hsl(46 100% 47%)",
	TieStrengthCensus: "hsl(46 100% 47%)",
	OrdinalBin: "hsl(27 93% 54%)",
	CategoricalBin: "hsl(103 46% 56%)",
	Narrative: "hsl(237 79% 67%)",
	AlterForm: "hsl(237 79% 67%)",
	AlterEdgeForm: "hsl(237 79% 67%)",
	EgoForm: "hsl(237 79% 67%)",
	Geospatial: "hsl(46 100% 47%)",
	Anonymisation: "hsl(237 79% 67%)",
	FamilyPedigree: "hsl(237 79% 67%)",
};

const ICON_BY_TYPE: Record<string, string> = {
	Information: interfaceIcon,
	NameGenerator: nameGeneratorIcon,
	NameGeneratorQuickAdd: nameGeneratorIcon,
	NameGeneratorRoster: nameGeneratorIcon,
	Sociogram: menuSociogramIcon,
	DyadCensus: menuSociogramIcon,
	OneToManyDyadCensus: menuSociogramIcon,
	TieStrengthCensus: menuSociogramIcon,
	OrdinalBin: menuOrdIcon,
	CategoricalBin: categoricalIcon,
	Narrative: relationshipIcon,
	AlterForm: interfaceIcon,
	AlterEdgeForm: interfaceIcon,
	EgoForm: interfaceIcon,
	Geospatial: menuSociogramIcon,
	Anonymisation: interfaceIcon,
	FamilyPedigree: relationshipIcon,
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
const DEFAULT_ICON = interfaceIcon;

function humanizeStageType(type: string): string {
	const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
	if (!spaced) return type;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function getStageDisplayMeta(type: string): Meta {
	return {
		color: COLOR_BY_TYPE[type] ?? DEFAULT_COLOR,
		iconSrc: ICON_BY_TYPE[type] ?? DEFAULT_ICON,
		subLabel: SUB_LABEL_BY_TYPE[type] ?? humanizeStageType(type),
	};
}
