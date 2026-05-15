import { motion } from 'motion/react';

type InsertButtonProps = {
  onClick: () => void;
};

const InsertButton = ({ onClick }: InsertButtonProps) => (
  <motion.div
    className="group grid w-2xl cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-10 p-4"
    onClick={onClick}
  >
    <div />
    <div className="bg-timeline text-primary-foreground group-hover:bg-action flex h-10 w-10 scale-40 items-center justify-center rounded-full text-4xl font-medium transition-all duration-300 ease-in-out group-hover:scale-110">
      <span className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        +
      </span>
    </div>
    <span className="justify-self-start text-lg font-semibold opacity-0 transition-all group-hover:font-bold group-hover:opacity-100">
      Add stage here
    </span>
  </motion.div>
);

export default InsertButton;
