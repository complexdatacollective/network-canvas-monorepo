import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { scrubXmlDocument, type XmlScrubSite } from '../xmlScrub';

const control = String.fromCharCode(0x2);
const loneSurrogate = String.fromCharCode(0xdc00);

const createDocument = () =>
  new DOMImplementation().createDocument(null, 'root', null);

const sitesOf = (root: Parameters<typeof scrubXmlDocument>[0]) => {
  const sites: XmlScrubSite[] = [];
  scrubXmlDocument(root, (site) => sites.push(site));
  return sites;
};

describe('scrubXmlDocument', () => {
  it('removes the characters from text, wherever it is nested', () => {
    const document = createDocument();
    const root = document.documentElement;
    const outer = document.createElement('outer');
    const inner = document.createElement('inner');
    inner.appendChild(document.createTextNode(`in${control}ner`));
    outer.appendChild(document.createTextNode(`ou${loneSurrogate}ter`));
    outer.appendChild(inner);
    root?.appendChild(outer);

    const sites = sitesOf(document);

    expect(inner.textContent).toBe('inner');
    expect(outer.firstChild?.nodeValue).toBe('outer');
    expect(sites).toEqual([
      { element: outer, attribute: null, original: `ou${loneSurrogate}ter` },
      { element: inner, attribute: null, original: `in${control}ner` },
    ]);
  });

  it('removes the characters from attribute values and reports the attribute', () => {
    const document = createDocument();
    const element = document.createElement('item');
    element.setAttribute('first', `a${control}`);
    element.setAttribute('clean', 'kept');
    element.setAttribute('last', `${loneSurrogate}b`);
    document.documentElement?.appendChild(element);

    const sites = sitesOf(document);

    expect(element.getAttribute('first')).toBe('a');
    expect(element.getAttribute('clean')).toBe('kept');
    expect(element.getAttribute('last')).toBe('b');
    expect(sites).toEqual([
      { element, attribute: 'first', original: `a${control}` },
      { element, attribute: 'last', original: `${loneSurrogate}b` },
    ]);
  });

  it('keeps the order of the attributes', () => {
    const document = createDocument();
    const element = document.createElement('item');
    element.setAttribute('a', `1${control}`);
    element.setAttribute('b', '2');
    element.setAttribute('c', `3${control}`);
    document.documentElement?.appendChild(element);

    scrubXmlDocument(document, () => undefined);

    expect(
      Array.from(element.attributes).map((attribute) => attribute.name),
    ).toEqual(['a', 'b', 'c']);
  });

  it('cleans comments and CDATA sections, which would also end the document', () => {
    const document = createDocument();
    const root = document.documentElement;
    root?.appendChild(document.createComment(`note${control}`));
    root?.appendChild(document.createCDATASection(`raw${control}`));

    scrubXmlDocument(document, () => undefined);

    const xml = new XMLSerializer().serializeToString(document, {
      requireWellFormed: true,
    });
    expect(xml).toContain('<!--note-->');
    expect(xml).toContain('<![CDATA[raw]]>');
  });

  it('changes nothing, and reports nothing, in a document that is well-formed', () => {
    const document = createDocument();
    const element = document.createElement('item');
    element.setAttribute('name', '日本語 😀');
    element.appendChild(document.createTextNode('Café\t\n\r'));
    document.documentElement?.appendChild(element);
    const before = new XMLSerializer().serializeToString(document);

    const sites = sitesOf(document);

    expect(sites).toEqual([]);
    expect(new XMLSerializer().serializeToString(document)).toBe(before);
  });

  it('leaves an emoji whole when it sits beside a stray surrogate half', () => {
    const document = createDocument();
    const element = document.createElement('item');
    element.appendChild(document.createTextNode(`😀${loneSurrogate}😀`));
    document.documentElement?.appendChild(element);

    scrubXmlDocument(document, () => undefined);

    expect(element.textContent).toBe('😀😀');
  });
});
