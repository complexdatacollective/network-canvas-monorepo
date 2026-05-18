import MarkdownLabel from '../MarkdownLabel';

type TickProps = {
  tick: {
    value: number;
    percent: number;
  };
  getLabelForValue?: (value: number) => string | null;
};

const Tick = ({ tick, getLabelForValue = () => null }: TickProps) => {
  const { value, percent } = tick;
  const label = getLabelForValue(value);

  return (
    <div
      className="after:border-platinum absolute top-0 after:absolute after:top-0 after:left-0 after:h-(--space-2xl) after:w-0 after:-translate-x-1/2 after:-translate-y-1/2 after:border-l-2 after:content-['']"
      style={{ left: `${percent}%` }}
    >
      {label && (
        <MarkdownLabel
          inline
          label={label}
          className="absolute top-(--space-xl) flex min-h-(--space-xl) w-max max-w-(--space-6xl) -translate-x-1/2 justify-center text-center"
        />
      )}
    </div>
  );
};

export default Tick;
