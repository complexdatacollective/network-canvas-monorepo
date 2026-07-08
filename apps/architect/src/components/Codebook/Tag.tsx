import { cx } from '~/utils/cva';

type TagProps = {
  children?: React.ReactNode;
  notUsed?: boolean;
};

const Tag = ({ children = null, notUsed = false }: TagProps) => (
  <div
    className={cx(
      'inline-block rounded px-2.5 py-1 text-[0.9em] wrap-break-word',
      notUsed ? 'bg-warning text-white' : 'bg-platinum text-charcoal',
    )}
  >
    {children}
  </div>
);

export default Tag;
