type Stat = {
  name: string;
  value: number;
  unit?: string;
};

const Stats: React.FC<{ stats: Stat[] }> = ({ stats }) => {
  return (
    <div className="bg-gray-800 border border-white/5">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-px bg-white/5 grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.name} className="bg-gray-800 py-6 sm:px-6 lg:px-8">
              <p className="text-sm font-medium leading-6 text-gray-400">
                {stat.name}
              </p>
              <p className="mt-2 flex items-baseline gap-x-2">
                <span className="text-4xl font-semibold tracking-tight text-white">
                  {stat.value}
                </span>
                {stat.unit ? (
                  <span className="text-sm text-gray-400">{stat.unit}</span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Stats;
