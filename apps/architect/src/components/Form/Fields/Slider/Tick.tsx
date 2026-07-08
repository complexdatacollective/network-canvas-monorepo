import MarkdownLabel from '../MarkdownLabel';

type TickProps = {
  tick: {
    percent: number;
  };
  label?: string | null;
};

const Tick = ({ tick, label = null }: TickProps) => {
  const { percent } = tick;

  return (
    <div
      className="after:border-platinum absolute top-0 after:absolute after:top-0 after:left-0 after:h-14 after:w-0 after:-translate-x-1/2 after:-translate-y-1/2 after:border-l-2 after:content-['']"
      style={{ left: `${percent}%` }}
    >
      {label && (
        <MarkdownLabel
          inline
          label={label}
          className="absolute top-10 flex min-h-10 w-max max-w-34 -translate-x-1/2 justify-center text-center"
        />
      )}
    </div>
  );
};

export default Tick;
