/**
 * @typedef {import('unist').Node} Node
 * @typedef {import('vfile').VFile} VFile
 */

import { matter } from 'vfile-matter';

/**
 * Parse YAML frontmatter and expose it at `file.data.matter`.
 *
 * @returns
 *   Transform.
 */
export default function processYamlMatter() {
  /**
   * Transform.
   *
   * @param {Node} tree
   *   Tree.
   * @param {VFile} file
   *   File.
   * @returns {undefined}
   *   Nothing.
   */
  return function (_tree, file) {
    matter(file, { strip: true });
  };
}
