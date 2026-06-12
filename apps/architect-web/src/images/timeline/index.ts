import AlterEdgeForm from './stage--AlterEdgeForm.webp';
import AlterForm from './stage--AlterForm.webp';
import Anonymisation from './stage--Anonymisation.webp';
import CategoricalBin from './stage--CategoricalBin.webp';
import Default from './stage--Default.webp';
import DyadCensus from './stage--DyadCensus.webp';
import EgoForm from './stage--EgoForm.webp';
import FamilyPedigree from './stage--FamilyPedigree.webp';
import Geospatial from './stage--Geospatial.webp';
import Information from './stage--Information.webp';
import NameGenerator from './stage--NameGenerator.webp';
import NameGeneratorQuickAdd from './stage--NameGeneratorQuickAdd.webp';
import NameGeneratorRoster from './stage--NameGeneratorRoster.webp';
import Narrative from './stage--Narrative.webp';
import OneToManyDyadCensus from './stage--OneToManyDyadCensus.webp';
import OrdinalBin from './stage--OrdinalBin.webp';
import Sociogram from './stage--Sociogram.webp';
import TieStrengthCensus from './stage--TieStrengthCensus.webp';

export type TimelineImage = {
  src: string;
  width: number;
  height: number;
};

/**
 * Stage thumbnail images, exported with their intrinsic pixel dimensions so
 * consumers can set width/height on <img> elements and avoid layout shift
 * while the image loads.
 *
 * Images are WebP, 448px wide (2x the largest rendered size of 224px/w-56).
 * If an image is replaced, its width/height here must match the new file.
 */
const timelineImages = {
  CategoricalBin: { src: CategoricalBin, width: 448, height: 307 },
  NameGenerator: { src: NameGenerator, width: 448, height: 307 },
  NameGeneratorQuickAdd: {
    src: NameGeneratorQuickAdd,
    width: 448,
    height: 307,
  },
  NameGeneratorRoster: { src: NameGeneratorRoster, width: 448, height: 309 },
  DyadCensus: { src: DyadCensus, width: 448, height: 309 },
  TieStrengthCensus: { src: TieStrengthCensus, width: 448, height: 309 },
  Narrative: { src: Narrative, width: 448, height: 307 },
  Information: { src: Information, width: 448, height: 307 },
  OrdinalBin: { src: OrdinalBin, width: 448, height: 307 },
  Sociogram: { src: Sociogram, width: 448, height: 307 },
  AlterForm: { src: AlterForm, width: 448, height: 307 },
  AlterEdgeForm: { src: AlterEdgeForm, width: 448, height: 307 },
  EgoForm: { src: EgoForm, width: 448, height: 307 },
  FamilyPedigree: { src: FamilyPedigree, width: 448, height: 302 },
  Geospatial: { src: Geospatial, width: 448, height: 304 },
  Anonymisation: { src: Anonymisation, width: 448, height: 273 },
  OneToManyDyadCensus: { src: OneToManyDyadCensus, width: 448, height: 272 },
  Default: { src: Default, width: 448, height: 307 },
} satisfies Record<string, TimelineImage>;

/**
 * Warm the browser cache for every stage thumbnail so they render
 * immediately when the timeline (or stage editor) first mounts.
 */
export const preloadTimelineImages = () => {
  for (const { src } of Object.values(timelineImages)) {
    const img = new Image();
    img.src = src;
  }
};

export default timelineImages;
