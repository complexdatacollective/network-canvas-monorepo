import type { NodeShape, NodeShapeProp } from '@codaco/fresco-ui/Node';
import { parseNodeShapeSvg } from '@codaco/fresco-ui/node/nodeShapeSvg';
import type { NodeDefinition } from '@codaco/protocol-validation';

import { resolveNodeShape } from '../../selectors/session';
import type { Person } from '../FamilyPedigree/model';
import type { PedigreeSymbolShape } from '../FamilyPedigree/pedigree-layout/types';

/**
 * The shape each person's symbol is drawn with, by person id, as the
 * codebook's person type sets it (a circle without one). `shapeSvgs` holds
 * the loaded drawings of the protocol's custom shapes (see
 * `useCustomShapeSvgs`).
 */
export function symbolShapesOf(
  people: readonly Pick<Person, 'id' | 'attributes'>[],
  personDefinition: Pick<NodeDefinition, 'shape' | 'customShapes'> | undefined,
  shapeSvgs: Readonly<Record<string, string>>,
): Map<string, NodeShapeProp> {
  return new Map(
    people.map((person) => [
      person.id,
      personDefinition
        ? resolveNodeShape(personDefinition, person.attributes, shapeSvgs)
        : 'circle',
    ]),
  );
}

/** The box a drawing's viewBox fills once fitted, centred, into the square
 * symbol, as Node draws it; a drawing Node cannot read is drawn as a
 * circle. */
function outlineOfDrawing(svg: string): PedigreeSymbolShape {
  const parsed = parseNodeShapeSvg(svg);
  if (!parsed.success) return 'circle';
  const { width, height } = parsed.shape.viewBox;
  const side = Math.max(width, height);
  return { width: width / side, height: height / side };
}

/**
 * The outline of each person's symbol, by person id, which the lines that
 * meet it are laid out against. A pedigree draws each symbol with
 * `symbolShapesOf` and lays its lines out with this map of the same shapes,
 * so the lines meet the edge of the symbol actually drawn: a line into a
 * square ends on its flat top, and a line into a custom shape on the box its
 * drawing fills.
 */
export function symbolOutlinesOf(
  shapes: ReadonlyMap<string, NodeShapeProp>,
): Map<string, PedigreeSymbolShape> {
  const outlines = new Map<string, PedigreeSymbolShape>();
  return new Map(
    [...shapes].map(([personId, shape]) => {
      if (typeof shape === 'string') return [personId, shape];
      const outline = outlines.get(shape.svg) ?? outlineOfDrawing(shape.svg);
      outlines.set(shape.svg, outline);
      return [personId, outline];
    }),
  );
}

/**
 * The shapes of the standard notation symbols, which are drawn as a circle,
 * a square or a diamond only: a person whose shape is a custom drawing takes
 * the circle.
 */
export function notationShapesOf(
  shapes: ReadonlyMap<string, NodeShapeProp>,
): Map<string, NodeShape> {
  return new Map(
    [...shapes].map(([personId, shape]) => [
      personId,
      typeof shape === 'string' ? shape : 'circle',
    ]),
  );
}
