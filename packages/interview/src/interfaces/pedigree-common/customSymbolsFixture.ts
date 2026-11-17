import type { SyntheticInterview } from '@codaco/protocol-utilities';

// A drawing that fills its square symbol but for the corners beside its
// roof, which are see-through.
const HOUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 L96 42 L96 90 Q96 96 90 96 L10 96 Q4 96 4 90 L4 42 Z" fill="var(--node-color)" stroke="var(--node-color-dark)" stroke-width="4"/><rect id="label-area" x="14" y="44" width="72" height="44" fill="#ffffff"/></svg>`;

// A drawing wider than it is tall, which fills the middle of its symbol.
const PLAQUE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect x="3" y="3" width="154" height="94" rx="26" fill="var(--node-color)" stroke="var(--node-color-dark)" stroke-width="6"/><rect id="label-area" x="16" y="14" width="128" height="72" fill="#ffffff"/></svg>`;

const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * Gives a pedigree's person type two custom shapes and maps its symbol to
 * them: a circle for women, the plaque for men and the house for anyone
 * else, as a researcher might draw their own symbols in the codebook.
 */
export function addCustomSymbols(
  si: SyntheticInterview,
  people: ReturnType<SyntheticInterview['addNodeType']>,
  genderIdentity: string,
): void {
  for (const [assetId, svg] of [
    ['house-shape', HOUSE_SVG],
    ['plaque-shape', PLAQUE_SVG],
  ] as const) {
    si.addAsset({
      key: assetId,
      assetId,
      name: `${assetId}.svg`,
      type: 'image',
      url: svgUrl(svg),
      size: 0,
    });
  }
  people.setCustomShapes({
    house: { name: 'House', asset: 'house-shape' },
    plaque: { name: 'Plaque', asset: 'plaque-shape' },
  });
  people.setShape({
    default: 'custom:house',
    dynamic: {
      variable: genderIdentity,
      type: 'discrete',
      map: [
        { value: 'woman', shape: 'circle' },
        { value: 'man', shape: 'custom:plaque' },
      ],
    },
  });
}
