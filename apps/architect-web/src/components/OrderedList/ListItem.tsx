import { GripVertical, Trash2 } from 'lucide-react';
import { motion, Reorder, useDragControls } from 'motion/react';
import type { ComponentProps } from 'react';

import { cx } from '~/utils/cva';

type ListItemProps = ComponentProps<typeof Reorder.Item> & {
  handleDelete: () => void;
  handleClick: () => void;
  sortable?: boolean;
  value: string | number | Record<string, unknown>;
  className?: string | null;
};

const ListItem = ({
  children,
  handleDelete,
  handleClick,
  className,
  sortable = true,
  value,
  ...rest
}: ListItemProps) => {
  const controls = useDragControls();

  const componentClasses = cx(
    'group',
    'bg-accent text-accent-foreground flex cursor-pointer items-center justify-between gap-4 rounded px-4 shadow select-none',
    className,
  );

  return (
    <Reorder.Item
      className={componentClasses}
      value={value}
      dragListener={false}
      dragControls={controls}
      onClick={handleClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      {...rest}
    >
      {sortable && (
        <motion.div layout>
          <GripVertical
            className="flex shrink-0 grow-0 cursor-grab"
            onPointerDown={(e) => controls.start(e)}
          />
        </motion.div>
      )}
      <motion.div layout className="shrink-1 grow-1">
        {children}
      </motion.div>
      <motion.div
        layout
        className="hover:bg-tomato aspect-square h-10 shrink-0 grow-0 cursor-pointer rounded-full p-2 opacity-0 transition-all duration-200 group-hover:opacity-100"
      >
        <Trash2
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
        />
      </motion.div>
    </Reorder.Item>
  );
};

export default ListItem;
