import { Fragment, type CSSProperties, useId, useMemo } from 'react';

import createNetworkWeaveScene, {
  clampNetworkWeaveValue,
  formatNetworkWeaveValue,
  type NetworkWeaveConvergence,
  NETWORK_WEAVE_HEIGHT,
  type NetworkWeaveOrientation,
  NETWORK_WEAVE_WIDTH,
  resolveNetworkWeaveConvergence,
} from './networkWeaveScene';

export type { NetworkWeaveConvergence } from './networkWeaveScene';

const DEFAULT_COMPLEXITY = 28;
const DEFAULT_STRANDS = 4;
const RIBBON_FLOW_DURATION = 9;
const TRIBUTARY_FLOW_DURATION = 4.5;

const DEFAULT_COLORS = [
  'var(--node-1, oklch(0.5733 0.2584 11.57))',
  'var(--edge-1, oklch(0.81 0.17 86.39))',
  'var(--ord-1, oklch(0.7 0.2 171.52))',
  'var(--edge-8, oklch(0.55 0.198 281))',
  'var(--node-6, oklch(0.5824 0.229 260.09))',
];

type NetworkWeaveBackgroundProps = {
  seed?: string;
  complexity?: number;
  strands?: number;
  convergence?: NetworkWeaveConvergence;
  orientation?: NetworkWeaveOrientation;
  reverse?: boolean;
  colors?: readonly string[];
  backgroundColor?: string;
  intensity?: number;
  flare?: number;
  blendMode?: CSSProperties['mixBlendMode'];
  animated?: boolean;
  speedFactor?: number;
  className?: string;
  style?: CSSProperties;
};

const NetworkWeaveBackground = ({
  seed = 'network-canvas',
  complexity = DEFAULT_COMPLEXITY,
  strands = DEFAULT_STRANDS,
  convergence,
  orientation = 'horizontal',
  reverse = false,
  colors,
  backgroundColor = 'transparent',
  intensity = 0.72,
  flare = 1,
  blendMode = 'multiply',
  animated = true,
  speedFactor = 1,
  className,
  style,
}: NetworkWeaveBackgroundProps) => {
  const activeColors = colors && colors.length > 0 ? colors : DEFAULT_COLORS;
  const resolvedComplexity = Math.floor(
    clampNetworkWeaveValue(complexity, 8, 64, DEFAULT_COMPLEXITY),
  );
  const resolvedStrands = Math.floor(
    clampNetworkWeaveValue(strands, 2, 6, DEFAULT_STRANDS),
  );
  const { x: resolvedConvergenceX, y: resolvedConvergenceY } =
    resolveNetworkWeaveConvergence(convergence);
  const resolvedIntensity = clampNetworkWeaveValue(intensity, 0, 1, 0.72);
  const resolvedFlare = clampNetworkWeaveValue(flare, 0, 2, 1);
  const resolvedSpeedFactor = clampNetworkWeaveValue(speedFactor, 0.1, 4, 1);
  const rawId = useId().replace(/:/g, '');
  const ribbonFlowClass = `network-weave-ribbon-flow-${rawId}`;
  const ribbonFlowKeyframes = `network-weave-ribbon-drift-${rawId}`;
  const tributaryFlowClass = `network-weave-tributary-flow-${rawId}`;
  const tributaryFlowKeyframes = `network-weave-tributary-drift-${rawId}`;
  const ribbonAnimationDuration = formatNetworkWeaveValue(
    RIBBON_FLOW_DURATION / resolvedSpeedFactor,
  );
  const tributaryAnimationDuration = formatNetworkWeaveValue(
    TRIBUTARY_FLOW_DURATION / resolvedSpeedFactor,
  );
  const scene = useMemo(
    () =>
      createNetworkWeaveScene({
        seed,
        complexity: resolvedComplexity,
        strands: resolvedStrands,
        colorCount: activeColors.length,
        convergence: {
          x: resolvedConvergenceX,
          y: resolvedConvergenceY,
        },
        orientation,
        reverse,
        flare: resolvedFlare,
      }),
    [
      seed,
      resolvedComplexity,
      resolvedStrands,
      activeColors.length,
      resolvedConvergenceX,
      resolvedConvergenceY,
      orientation,
      reverse,
      resolvedFlare,
    ],
  );

  return (
    <svg
      viewBox={`0 0 ${NETWORK_WEAVE_WIDTH} ${NETWORK_WEAVE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className={className}
      style={{ width: '100%', height: '100%', ...style, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {animated && (
        <style>{`
          .${ribbonFlowClass} { animation: ${ribbonFlowKeyframes} ${ribbonAnimationDuration}s linear infinite; }
          .${tributaryFlowClass} { animation: ${tributaryFlowKeyframes} ${tributaryAnimationDuration}s linear infinite; }
          @keyframes ${ribbonFlowKeyframes} { from { offset-distance: 0%; transform: scale(0.55, 0.35); } to { offset-distance: 100%; transform: scale(1.4, 3.8); } }
          @keyframes ${tributaryFlowKeyframes} { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -159; } }
          @media (prefers-reduced-motion: reduce) { .${ribbonFlowClass} { animation: none; visibility: hidden; } .${tributaryFlowClass} { animation: none; } }
        `}</style>
      )}
      <defs>
        {scene.ribbons.map((ribbon, index) => {
          const color = activeColors[ribbon.colorIndex] ?? DEFAULT_COLORS[0];
          return (
            <Fragment key={`ribbon-definition-${index}`}>
              <linearGradient
                id={`network-weave-ribbon-${rawId}-${index}`}
                gradientUnits="userSpaceOnUse"
                x1={formatNetworkWeaveValue(ribbon.gradientStart.x)}
                y1={formatNetworkWeaveValue(ribbon.gradientStart.y)}
                x2={formatNetworkWeaveValue(ribbon.gradientEnd.x)}
                y2={formatNetworkWeaveValue(ribbon.gradientEnd.y)}
              >
                <stop offset="0" stopColor={color} stopOpacity="0.1" />
                <stop offset="0.38" stopColor={color} stopOpacity="0.78" />
                <stop offset="0.72" stopColor={color} stopOpacity="0.58" />
                <stop offset="1" stopColor={color} stopOpacity="0.18" />
              </linearGradient>
            </Fragment>
          );
        })}
      </defs>

      <rect
        width={NETWORK_WEAVE_WIDTH}
        height={NETWORK_WEAVE_HEIGHT}
        fill={backgroundColor}
      />

      <g opacity={formatNetworkWeaveValue(resolvedIntensity)}>
        <g>
          {scene.tributaries.map((tributary, index) => (
            <path
              key={`tributary-${index}`}
              className="network-weave__tributary"
              d={tributary.d}
              fill="none"
              stroke={activeColors[tributary.colorIndex]}
              strokeWidth={formatNetworkWeaveValue(tributary.width)}
              strokeOpacity={formatNetworkWeaveValue(tributary.opacity)}
              strokeLinecap="round"
            />
          ))}
        </g>

        {animated && (
          <g>
            {scene.tributaries.map((tributary, index) => (
              <path
                key={`tributary-flow-${index}`}
                className={`network-weave__tributary-flow ${tributaryFlowClass}`}
                d={tributary.d}
                fill="none"
                stroke={activeColors[tributary.colorIndex]}
                strokeWidth={formatNetworkWeaveValue(
                  Math.max(5.2, tributary.width * 1.25),
                )}
                strokeOpacity="0.64"
                strokeDasharray="1 52"
                strokeLinecap="round"
                style={{
                  animationDelay: `${formatNetworkWeaveValue(
                    -(index / scene.tributaries.length) *
                      tributaryAnimationDuration,
                  )}s`,
                }}
              />
            ))}
          </g>
        )}

        <g>
          {scene.ribbons.map((ribbon, index) => (
            <path
              key={`ribbon-${index}`}
              className="network-weave__ribbon"
              d={ribbon.d}
              fill={`url(#network-weave-ribbon-${rawId}-${index})`}
              style={{ mixBlendMode: blendMode }}
            />
          ))}
        </g>

        <g>
          {scene.ribbons.map((ribbon, index) => {
            const color = activeColors[ribbon.colorIndex] ?? DEFAULT_COLORS[0];
            return (
              <g key={`ribbon-detail-${index}`}>
                <path
                  className="network-weave__ribbon-guide"
                  d={ribbon.guideD}
                  data-centerline={ribbon.centerlineD}
                  fill={color}
                  fillOpacity="0.18"
                  style={{ mixBlendMode: blendMode }}
                />
                {animated &&
                  Array.from({ length: 3 }, (_, signalIndex) => {
                    const phase = (signalIndex / 3 + ribbon.phase / 3) % 1;
                    return (
                      <rect
                        key={`ribbon-flow-${signalIndex}`}
                        className={`network-weave__ribbon-flow ${ribbonFlowClass}`}
                        x="-40"
                        y="-6"
                        width="80"
                        height="12"
                        rx="16"
                        ry="6"
                        fill={color}
                        fillOpacity="0.78"
                        style={{
                          offsetPath: `path('${ribbon.centerlineD}')`,
                          offsetRotate: 'auto',
                          transformBox: 'fill-box',
                          transformOrigin: 'center',
                          animationDelay: `${formatNetworkWeaveValue(
                            -phase * ribbonAnimationDuration,
                          )}s`,
                          mixBlendMode: blendMode,
                        }}
                      />
                    );
                  })}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
};

export default NetworkWeaveBackground;
