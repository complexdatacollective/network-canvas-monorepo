import { cx } from '~/utils/cva';

export type VariableDistributionShape =
  | {
      kind: 'continuous';
      distribution: 'uniform' | 'normal' | 'lognormal' | 'constant' | 'beta';
      mean?: number;
      sd?: number;
    }
  | { kind: 'boolean'; probabilityTrue: number }
  | { kind: 'options'; weights: readonly number[] }
  | { kind: 'text' }
  | { kind: 'stageOwned' };

const WIDTH = 40;
const HEIGHT = 20;
const AXIS_LEFT = 2;
const LEFT = 5;
const RIGHT = WIDTH - LEFT;
const TOP = 2;
const BASELINE = HEIGHT - 2;
const SAMPLE_COUNT = 31;

const sample = (density: (position: number) => number) =>
  Array.from({ length: SAMPLE_COUNT }, (_, index) =>
    density(index / (SAMPLE_COUNT - 1)),
  );

const densityPath = (densities: readonly number[]) => {
  const finiteDensities = densities.map((density) =>
    Number.isFinite(density) ? Math.max(0, density) : 0,
  );
  const maximum = Math.max(...finiteDensities, 1e-9);
  const points = finiteDensities.map((density, index) => {
    const x = LEFT + (index / (finiteDensities.length - 1)) * (RIGHT - LEFT);
    const y = BASELINE - (density / maximum) * (BASELINE - TOP);
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });

  return `M ${LEFT} ${BASELINE} L ${points.join(' L ')} L ${RIGHT} ${BASELINE} Z`;
};

const normalDensities = () =>
  sample((position) => {
    const z = position * 6 - 3;
    return Math.exp(-0.5 * z * z);
  });

const lognormalDensities = (mean: number, sd: number) => {
  if (sd === 0) return [];

  const variance = sd * sd;
  const sigmaSquared = Math.log(1 + variance / (mean * mean));
  const sigma = Math.sqrt(sigmaSquared);
  const mu = Math.log(mean) - sigmaSquared / 2;
  const upper = mean + 4 * sd;

  return sample((position) => {
    const x = Math.max(upper * position, upper / 1000);
    const exponent = -((Math.log(x) - mu) ** 2) / (2 * sigmaSquared);
    return Math.exp(exponent) / (x * sigma * Math.sqrt(2 * Math.PI));
  });
};

const betaDensities = (mean: number, sd: number) => {
  if (sd === 0) return [];

  const concentration = (mean * (1 - mean)) / (sd * sd) - 1;
  const alpha = mean * concentration;
  const beta = (1 - mean) * concentration;
  const logDensities = sample((position) => {
    const x = 0.005 + position * 0.99;
    return (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x);
  });
  const maximum = Math.max(...logDensities);

  return logDensities.map((density) => Math.exp(density - maximum));
};

const bucketWeights = (weights: readonly number[]) => {
  if (weights.length <= 8) return weights;

  return Array.from({ length: 8 }, (_, bucket) => {
    const start = Math.floor((bucket * weights.length) / 8);
    const end = Math.floor(((bucket + 1) * weights.length) / 8);
    const values = weights.slice(start, end);
    return values.reduce((total, weight) => total + weight, 0) / values.length;
  });
};

function PlotAxes() {
  return (
    <path
      d={`M ${AXIS_LEFT} ${TOP} V ${BASELINE} H ${WIDTH - AXIS_LEFT}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.25"
    />
  );
}

function FilledDistribution({ path }: { path: string }) {
  return (
    <path
      d={path}
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  );
}

function ContinuousDistribution({
  distribution,
  mean,
  sd,
}: Extract<VariableDistributionShape, { kind: 'continuous' }>) {
  if (distribution === 'constant' || sd === 0) {
    return (
      <path
        d={`M ${WIDTH / 2} ${TOP + 1} V ${BASELINE}`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.25"
      />
    );
  }

  if (distribution === 'uniform') {
    return (
      <FilledDistribution
        path={`M ${LEFT} ${BASELINE} L ${LEFT} 5 L ${RIGHT} 5 L ${RIGHT} ${BASELINE} Z`}
      />
    );
  }

  if (distribution === 'lognormal') {
    return (
      <FilledDistribution
        path={densityPath(lognormalDensities(mean ?? 1, sd ?? 0.6))}
      />
    );
  }

  if (distribution === 'beta') {
    return (
      <FilledDistribution
        path={densityPath(betaDensities(mean ?? 0.5, sd ?? 0.18))}
      />
    );
  }

  return <FilledDistribution path={densityPath(normalDensities())} />;
}

function BooleanDistribution({ probabilityTrue }: { probabilityTrue: number }) {
  return (
    <>
      {[1 - probabilityTrue, probabilityTrue].map((probability, index) => {
        const height = Math.max(1.5, probability * (BASELINE - TOP));
        return (
          <rect
            key={index}
            x={index === 0 ? 7 : 24}
            y={BASELINE - height}
            width="9"
            height={height}
            rx="1"
            fill="currentColor"
            fillOpacity="0.3"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        );
      })}
    </>
  );
}

function OptionsDistribution({ weights }: { weights: readonly number[] }) {
  const buckets = bucketWeights(weights);
  const maximum = Math.max(...buckets, 1);
  const gap = 1.5;
  const barWidth = (RIGHT - LEFT - gap * (buckets.length - 1)) / buckets.length;

  return (
    <>
      {buckets.map((weight, index) => {
        const height = Math.max(1, (weight / maximum) * (BASELINE - TOP));
        return (
          <rect
            key={index}
            x={LEFT + index * (barWidth + gap)}
            y={BASELINE - height}
            width={barWidth}
            height={height}
            rx="0.75"
            fill="currentColor"
            fillOpacity="0.3"
            stroke="currentColor"
            strokeWidth="1"
          />
        );
      })}
    </>
  );
}

const shapeName = (shape: VariableDistributionShape) =>
  shape.kind === 'continuous' ? shape.distribution : shape.kind;

export function VariableDistributionIcon({
  className,
  shape,
}: {
  className?: string;
  shape: VariableDistributionShape;
}) {
  return (
    <svg
      aria-hidden
      className={cx('h-6 w-12 overflow-visible', className)}
      data-variable-pill-distribution={shapeName(shape)}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      {(shape.kind === 'continuous' ||
        shape.kind === 'boolean' ||
        shape.kind === 'options') && <PlotAxes />}
      {shape.kind === 'continuous' && <ContinuousDistribution {...shape} />}
      {shape.kind === 'boolean' && <BooleanDistribution {...shape} />}
      {shape.kind === 'options' && <OptionsDistribution {...shape} />}
      {shape.kind === 'text' && (
        <g
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.75"
        >
          <path d="M 3 5 H 27" />
          <path d="M 3 10 H 36" />
          <path d="M 3 15 H 22" />
          <path d="M 32 3 V 7 M 30 5 H 34" />
        </g>
      )}
      {shape.kind === 'stageOwned' && (
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M 8 14 L 20 5 L 32 14" />
          <circle cx="8" cy="14" r="3" fill="currentColor" fillOpacity="0.16" />
          <circle cx="20" cy="5" r="3" fill="currentColor" fillOpacity="0.16" />
          <circle
            cx="32"
            cy="14"
            r="3"
            fill="currentColor"
            fillOpacity="0.16"
          />
        </g>
      )}
    </svg>
  );
}
