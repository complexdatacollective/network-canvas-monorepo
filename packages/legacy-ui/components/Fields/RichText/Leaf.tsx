/* eslint-disable react/jsx-props-no-spreading, no-param-reassign */

import { ReactNode } from "react";
import { RenderLeafProps } from "slate-react";

interface CustomLeaf {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  text: string;
}

interface LeafProps extends RenderLeafProps {
  leaf: CustomLeaf;
}

const withMarks = (content: ReactNode, leaf: CustomLeaf) => {
  if (leaf.bold) {
    if (leaf.italic) {
      return (
        <strong>
          <em>{content}</em>
        </strong>
      );
    }

    return <strong>{content}</strong>;
  }

  if (leaf.italic) {
    return <em>{content}</em>;
  }

  return content;
};

const Leaf = ({ attributes, children, leaf }: LeafProps) => <span {...attributes}>{withMarks(children, leaf)}</span>;

export default Leaf;