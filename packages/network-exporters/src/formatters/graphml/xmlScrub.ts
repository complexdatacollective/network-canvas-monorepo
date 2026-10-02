import { CharacterData, Element, type Node } from '@xmldom/xmldom';

import {
  hasXmlIllegalCharacters,
  stripXmlIllegalCharacters,
} from '@codaco/shared-consts';

export type XmlScrubSite = {
  /** The element whose own text, or one of whose attributes, changed. */
  readonly element: Element;
  /** The changed attribute's name, or null when the element's text changed. */
  readonly attribute: string | null;
};

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
    const stripped: [name: string, value: string][] = [];
    for (let index = 0; index < root.attributes.length; index += 1) {
      const attribute = root.attributes.item(index);
      if (attribute && hasXmlIllegalCharacters(attribute.value)) {
        stripped.push([
          attribute.name,
          stripXmlIllegalCharacters(attribute.value),
        ]);
      }
    }
    for (const [name, value] of stripped) {
      root.setAttribute(name, value);
      onScrub({ element: root, attribute: name });
    }
  } else if (root instanceof CharacterData) {
    if (hasXmlIllegalCharacters(root.data)) {
      root.data = stripXmlIllegalCharacters(root.data);
      if (root.parentElement) {
        onScrub({ element: root.parentElement, attribute: null });
      }
    }
    return;
  }

  for (let child = root.firstChild; child; child = child.nextSibling) {
    scrubXmlDocument(child, onScrub);
  }
}
