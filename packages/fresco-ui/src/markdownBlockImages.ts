/**
 * Lets markdown show some of its images as blocks drawn by the caller: a
 * file of a protocol, say, which may be an image, audio or a video, and which
 * only the caller knows how to find.
 *
 * Which images, and how one is drawn, are the caller's (`MarkdownBlockImages`).
 * What is here is how one gets from the markdown to the caller's component
 * with nothing else able to pose as one. A block can only come from an image
 * written in markdown: the image is taken out of the markdown's structure,
 * leaving a marker, and put back, as an element nothing else produces, once
 * the structure is finished. HTML written into the text is shown as the
 * characters typed (see `markdownTypedHtml`), so it cannot make one either.
 */

/** An image a caller draws as a block: its address and its description. */
export type MarkdownBlockImage = Readonly<{ url: string; alt: string }>;

// Around what stands for a block between the two passes. Private-use
// characters, removed from the text itself first, so text cannot hold them.
const OPEN = '';
const CLOSE = '';
const MARKERS = /[]/g;
const MARKED = /^([\s\S]*)$/;

// Known to no text: made when the module loads, and written into each marker,
// so that only a marker this module wrote is read as one, whatever else
// reaches the finished structure.
const NONCE = Array.from(
  globalThis.crypto.getRandomValues(new Uint32Array(4)),
  (part) => part.toString(16),
).join('');
const NONCE_PREFIX = `${NONCE}:`;

/** The element a block becomes, and the property that says which. */
export const BLOCK_IMAGE_ELEMENT = 'figure';
export const BLOCK_IMAGE_PROPERTY = 'dataBlockImage';

type TreeNode = {
  type: string;
  value?: string;
  url?: string;
  alt?: string | null;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: TreeNode[];
};

const isTreeNode = (node: unknown): node is TreeNode =>
  typeof node === 'object' &&
  node !== null &&
  'type' in node &&
  typeof node.type === 'string';

const markerFor = (image: MarkdownBlockImage): TreeNode => ({
  type: 'paragraph',
  // Percent-encoded, so nothing a later pass looks for in text (a character
  // standing for a value, say) is found inside it.
  children: [
    {
      type: 'text',
      value:
        OPEN + NONCE_PREFIX + encodeURIComponent(JSON.stringify(image)) + CLOSE,
    },
  ],
});

const isBlank = (node: TreeNode): boolean =>
  (node.type === 'text' && (node.value ?? '').trim() === '') ||
  node.type === 'break';

// The words on one side of a block, as a paragraph of their own, without the
// line break that stood between them and the image.
const paragraphOf = (children: TreeNode[]): TreeNode[] => {
  const words = [...children];
  while (words[0] !== undefined && isBlank(words[0])) words.shift();
  for (;;) {
    const last = words.at(-1);
    if (last === undefined || !isBlank(last)) break;
    words.pop();
  }
  return words.length === 0 ? [] : [{ type: 'paragraph', children: words }];
};

/**
 * A paragraph as the blocks it is shown as: each image the caller draws
 * becomes a block of its own, and the words on either side of it a paragraph
 * of their own. An image written alone in its paragraph, as an editor writes
 * it, is simply that block.
 */
const splitParagraph = (
  paragraph: TreeNode,
  isBlockImage: (url: string) => boolean,
): TreeNode[] => {
  const children = paragraph.children ?? [];
  const holdsBlock = children.some(
    (child) =>
      child.type === 'image' &&
      typeof child.url === 'string' &&
      isBlockImage(child.url),
  );
  if (!holdsBlock) return [paragraph];
  const blocks: TreeNode[] = [];
  let run: TreeNode[] = [];
  for (const child of children) {
    if (
      child.type === 'image' &&
      typeof child.url === 'string' &&
      isBlockImage(child.url)
    ) {
      blocks.push(...paragraphOf(run));
      run = [];
      blocks.push(markerFor({ url: child.url, alt: child.alt ?? '' }));
    } else {
      run.push(child);
    }
  }
  blocks.push(...paragraphOf(run));
  return blocks;
};

const markBlockImages = (
  node: TreeNode,
  isBlockImage: (url: string) => boolean,
) => {
  if (typeof node.value === 'string') {
    node.value = node.value.replace(MARKERS, '');
  }
  if (node.children === undefined) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'paragraph') {
      for (const inner of child.children ?? []) {
        markBlockImages(inner, isBlockImage);
      }
      return splitParagraph(child, isBlockImage);
    }
    markBlockImages(child, isBlockImage);
    return [child];
  });
};

/**
 * The remark half: takes each block image out of the markdown, leaving a
 * marker where it stood. Runs on the markdown's own structure.
 */
export const remarkBlockImages =
  (isBlockImage: (url: string) => boolean) => () => (tree: unknown) => {
    if (isTreeNode(tree)) markBlockImages(tree, isBlockImage);
  };

const decodeImage = (encoded: string): MarkdownBlockImage | undefined => {
  try {
    const image: unknown = JSON.parse(decodeURIComponent(encoded));
    if (
      typeof image === 'object' &&
      image !== null &&
      'url' in image &&
      typeof image.url === 'string' &&
      'alt' in image &&
      typeof image.alt === 'string'
    ) {
      return { url: image.url, alt: image.alt };
    }
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof URIError)) {
      throw error;
    }
  }
  return undefined;
};

const readMarker = (text: string): MarkdownBlockImage | undefined => {
  const marked = MARKED.exec(text)?.[1];
  if (marked === undefined || !marked.startsWith(NONCE_PREFIX)) {
    return undefined;
  }
  return decodeImage(marked.slice(NONCE_PREFIX.length));
};

const blockElement = (image: MarkdownBlockImage): TreeNode => ({
  type: 'element',
  tagName: BLOCK_IMAGE_ELEMENT,
  properties: {
    [BLOCK_IMAGE_PROPERTY]: encodeURIComponent(JSON.stringify(image)),
  },
  children: [],
});

// A marker standing in text: what the markdown's tight lists leave where a
// paragraph was, since they do not wrap an item's text in one. One text node
// may hold several, with the words around them.
const MARKER_IN_TEXT = new RegExp(
  `${OPEN}${NONCE_PREFIX}([^${CLOSE}]*)${CLOSE}`,
  'g',
);

const placeInText = (value: string): TreeNode[] => {
  const placed: TreeNode[] = [];
  let from = 0;
  const addText = (text: string) => {
    const words = text.replace(MARKERS, '');
    if (words !== '') placed.push({ type: 'text', value: words });
  };
  for (const found of value.matchAll(MARKER_IN_TEXT)) {
    const image = decodeImage(found[1] ?? '');
    addText(value.slice(from, found.index));
    if (image === undefined) addText(found[0]);
    else placed.push(blockElement(image));
    from = found.index + found[0].length;
  }
  addText(value.slice(from));
  return placed;
};

const placeBlockImages = (node: TreeNode) => {
  if (node.children === undefined) return;
  node.children = node.children.flatMap((child): TreeNode[] => {
    if (child.type === 'text' && typeof child.value === 'string') {
      return placeInText(child.value);
    }
    const only = child.children?.length === 1 ? child.children[0] : undefined;
    const image =
      child.type === 'element' && child.tagName === 'p' && only?.type === 'text'
        ? readMarker(only.value ?? '')
        : undefined;
    if (image !== undefined) return [blockElement(image)];
    placeBlockImages(child);
    return [child];
  });
};

/**
 * The rehype half: puts each block where its marker stands. Runs last, on
 * the finished structure.
 */
export const rehypeBlockImages = () => (tree: unknown) => {
  if (isTreeNode(tree)) placeBlockImages(tree);
};

/** The image a placed block's element stands for, read from its property. */
export const blockImageOf = (
  properties: Record<string, unknown> | undefined,
): MarkdownBlockImage | undefined => {
  const marked = properties?.[BLOCK_IMAGE_PROPERTY];
  return typeof marked === 'string' ? decodeImage(marked) : undefined;
};
