import type { ComponentType } from "react";
import add from "./add.svg.react";
import addAPersonSingle from "./add-a-person-single.svg.react";
import AddAPlaceSingle from "./add-a-place-single.svg.react";
import arrowRight from "./arrow-right.svg.react";
import cross from "./cross.svg.react";
import remove from "./delete.svg.react";
import edit from "./edit.svg.react";
import error from "./error.svg.react";
import info from "./info.svg.react";
import links from "./links.svg.react";
import menuCustomInterface from "./menu-custom-interface.svg.react";
import menuMap from "./menu-map.svg.react";
import menuSociogram from "./menu-sociogram.svg.react";
import protocolCard from "./protocol-card.svg.react";
import tick from "./tick.svg.react";
import warning from "./warning.svg.react";

type IconsMap = Record<string, ComponentType<Record<string, unknown>>>;

const icons: IconsMap = {
	add,
	"add-a-person": addAPersonSingle,
	"add-a-place": AddAPlaceSingle,
	"arrow-right": arrowRight,
	cross,
	delete: remove,
	edit,
	error,
	info,
	links,
	"menu-custom-interface": menuCustomInterface,
	"menu-map": menuMap,
	"menu-sociogram": menuSociogram,
	"protocol-card": protocolCard,
	tick,
	warning,
};

export default icons;
