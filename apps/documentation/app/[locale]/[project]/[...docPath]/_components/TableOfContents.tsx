import { type HeadingNode } from '@/lib/tableOfContents';
import TOCLink from './TOCLink';

interface TableOfContentsProps {
  nodes: HeadingNode[] | null;
}

const TableOfContents = ({ nodes }: TableOfContentsProps) => {
  if (!nodes) return null;

  return (
    <div
      className={`toc-component group overflow-x-hidden pb-5 ${
        nodes.length > 10 && 'h-[750px]'
      } min-w-[300px] overflow-y-auto`}
    >
      <h3 className="text-sm uppercase text-slate-400">Table of contents</h3>
      {renderNodes(nodes)}
    </div>
  );
};

function renderNodes(nodes: HeadingNode[]) {
  return (
    <ul className="mx-6">
      {nodes.map((node) => (
        <li key={node.data.id}>
          <TOCLink node={node} />
          {node.children?.length > 0 && renderNodes(node.children)}
        </li>
      ))}
    </ul>
  );
}

export default TableOfContents;
