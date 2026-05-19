import { Plus } from 'lucide-react';
import { motion, type Variants } from 'motion/react';

type InsertButtonProps = {
  onClick: () => void;
  variants?: Variants;
};

const InsertButton = ({ onClick, variants }: InsertButtonProps) => (
  <motion.div
    className="group grid w-2xl cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-10 px-4 py-1"
    onClick={onClick}
    variants={variants}
  >
    <div />
    <div className="bg-timeline text-primary-foreground group-hover:bg-action flex h-10 w-10 scale-40 items-center justify-center rounded-full transition-all duration-300 ease-in-out group-hover:scale-110">
      <Plus
        className="h-6 w-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        strokeWidth={2.5}
      />
    </div>
    <span className="justify-self-start text-lg font-semibold opacity-0 transition-all group-hover:font-bold group-hover:opacity-100">
      Add stage here
    </span>
  </motion.div>
);

export default InsertButton;
