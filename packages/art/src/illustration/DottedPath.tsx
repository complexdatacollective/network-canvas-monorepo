// A dotted line whose dots march along `d` as `time` (seconds) advances.
export function DottedPath({
  d,
  time,
  className = 'stroke-navy-taupe/40',
}: {
  d: string;
  time: number;
  className?: string;
}) {
  return (
    <path
      d={d}
      fill="none"
      className={className}
      strokeWidth={5}
      strokeDasharray="2 14"
      strokeDashoffset={-time * 40}
      strokeLinecap="round"
    />
  );
}
