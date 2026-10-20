import { CharacterData, Element, type Node } from '@xmldom/xmldom';

import {
  hasXmlIllegalCharacters,
  stripXmlIllegalCharacters,
  xmlIllegalCodePoints,
} from '@codaco/shared-consts';

export type XmlScrubSite = {
  /** The element whose own text, or one of whose attributes, changed. */
  readonly element: Element;
  /** The changed attribute's name, or null when the element's text changed. */
  readonly attribute: string | null;
  /** The text as the document now holds it, without the removed characters. */
  readonly stripped: string;
  /**
   * Each character removed, written as its code point (`U+0007`), once each,
   * in the order they first appeared.
   */
  readonly removed: readonly string[];
};

const scrubbed = (original: string) => ({
  stripped: stripXmlIllegalCharacters(original),
  removed: xmlIllegalCodePoints(original),
});

/**
 * Removes the characters XML 1.0 cannot represent from every text node,
 * attribute value and comment under `root`, and reports where it did.
 *
 * This is the one place GraphML text is made well-formed. It walks the finished
 * document rather than each place text is written, so nothing written by any
 * formatter, now or later, can be missed. It changes only the document: the
 * data the export reads from keeps its characters, so everything matched by
 * value (a categorical answer against its option) is matched as before.
 */
export function scrubXmlDocument(
  root: Node,
  onScrub: (site: XmlScrubSite) => void,
): void {
  if (root instanceof Element) {
    // Collected first: replacing an attribute while walking the live map could
    // revisit or skip one.
    const illegal: [name: string, original: string][] = [];
    for (let index = 0; index < root.attributes.length; index += 1) {
      const attribute = root.attributes.item(index);
      if (attribute && hasXmlIllegalCharacters(attribute.value)) {
        illegal.push([attribute.name, attribute.value]);
      }
    }
    for (const [name, original] of illegal) {
      const change = scrubbed(original);
      root.setAttribute(name, change.stripped);
      onScrub({ element: root, attribute: name, ...change });
    }
  } else if (root instanceof CharacterData) {
    if (hasXmlIllegalCharacters(root.data)) {
      const change = scrubbed(root.data);
      root.data = change.stripped;
      if (root.parentElement) {
        onScrub({ element: root.parentElement, attribute: null, ...change });
      }
    }
    return;
  }

  for (let child = root.firstChild; child; child = child.nextSibling) {
    scrubXmlDocument(child, onScrub);
  }
}
