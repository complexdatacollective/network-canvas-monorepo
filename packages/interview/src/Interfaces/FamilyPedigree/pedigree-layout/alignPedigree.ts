import { sugiyamaLayout } from "~/lib/interviewer/Interfaces/FamilyPedigree/pedigree-layout/sugiyamaLayout";
import type {
	Hints,
	PedigreeInput,
	PedigreeLayout,
} from "~/lib/interviewer/Interfaces/FamilyPedigree/pedigree-layout/types";

export function alignPedigree(
	ped: PedigreeInput,
	_options: {
		packed?: boolean;
		width?: number;
		align?: boolean | number[];
		hints?: Hints;
	} = {},
): PedigreeLayout {
	return sugiyamaLayout(ped);
}
