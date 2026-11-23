import { Fragment, type CSSProperties, useId, useMemo } from 'react';

import NetworkWeaveDots, {
  NETWORK_WEAVE_DOT_SPACING,
} from './NetworkWeaveDots';
import createNetworkWeaveScene, {
  clampNetworkWeaveValue,
  formatNetworkWeaveValue,
  type NetworkWeaveConvergence,
  NETWORK_WEAVE_HEIGHT,
  type NetworkWeaveOrientation,
  NETWORK_WEAVE_SIGNAL_SEGMENTS,
  type NetworkWeaveSignalStop,
  NETWORK_WEAVE_WIDTH,
  resolveNetworkWeaveConvergence,
} from './networkWeaveScene';
import NetworkWeaveSignalStage from './NetworkWeaveSignalStage';

export type {
  NetworkWeaveConvergence,
  NetworkWeaveOrientation,
} from './networkWeaveScene';

// How the background is drawn decides what it costs to leave open. It moves
// for as long as the page is on screen, so anything it repaints, it repaints
// continuously. The ribbons, with their gradients and blending, are by far
// the most expensive part to paint, and they do not move; so they are painted
// once, in a layer of their own, and the two things that do move are kept
// out of that layer:
//
//   - the signals that travel along the ribbons are separate elements moved
//     only by `transform`, which a browser animates on its compositor without
//     repainting anything;
//   - the dots that travel along the tributaries cannot be moved that way (a
//     dash sliding along a curve is not a transform), so they are repainted,
//     but alone, a few times a second (see NetworkWeaveDots).
//
// The signals also move in steps rather than on every screen refresh. On a
// 120Hz display a continuously moving element makes the browser produce 120
// whole frames a second; these move about a pixel per step at the rate
// below, which reads as continuous at a quarter of that. All of them step
// together, so the steps of one never fall between the steps of another.
const SIGNAL_STEPS_PER_SECOND = 30;

const DEFAULT_COMPLEXITY = 20;
const DEFAULT_STRANDS = 4;
const RIBBON_FLOW_DURATION = 9;
const TRIBUTARY_FLOW_DURATION = 4.5;
// How far a tributary's dots travel in one tributary flow duration.
const TRIBUTARY_FLOW_DISTANCE = NETWORK_WEAVE_DOT_SPACING * 3;
const SIGNALS_PER_RIBBON = 3;

// A signal at the size it reaches at the end of its ribbon. It is drawn at
// this size and scaled down for the rest of its journey, so that it is never
// a small image stretched larger.
const SIGNAL_START_SCALE = { x: 0.55, y: 0.35 };
const SIGNAL_END_SCALE = { x: 1.4, y: 3.8 };
const SIGNAL_WIDTH = 80 * SIGNAL_END_SCALE.x;
const SIGNAL_HEIGHT = 12 * SIGNAL_END_SCALE.y;
const SIGNAL_RADIUS_X = 16 * SIGNAL_END_SCALE.x;
const SIGNAL_RADIUS_Y = 6 * SIGNAL_END_SCALE.y;

const signalScaleAt = (progress: number) => ({
  x:
    (SIGNAL_START_SCALE.x +
      (SIGNAL_END_SCALE.x - SIGNAL_START_SCALE.x) * progress) /
    SIGNAL_END_SCALE.x,
  y:
    (SIGNAL_START_SCALE.y +
      (SIGNAL_END_SCALE.y - SIGNAL_START_SCALE.y) * progress) /
    SIGNAL_END_SCALE.y,
});

// One keyframe per stop on a ribbon's centreline. The stops themselves are
// custom properties on each ribbon's signals (see `signalStopVariables`), so
// every ribbon shares these keyframes and a ribbon that changes shape changes
// only its properties.
const signalKeyframes = (name: string) =>
  `@keyframes ${name} { ${Array.from(
    { length: NETWORK_WEAVE_SIGNAL_SEGMENTS + 1 },
    (_, stop) => {
      const progress = stop / NETWORK_WEAVE_SIGNAL_SEGMENTS;
      const scale = signalScaleAt(progress);
      return `${Number((progress * 100).toFixed(3))}% { transform: translate(var(--weave-stop-${stop})) rotate(var(--weave-turn-${stop})) scale(${Number(scale.x.toFixed(4))}, ${Number(scale.y.toFixed(4))}); }`;
    },
  ).join(' ')} }`;

const signalStopVariables = (stops: readonly NetworkWeaveSignalStop[]) => {
  const variables: Record<string, string> = {};
  stops.forEach((stop, index) => {
    variables[`--weave-stop-${index}`] =
      `${formatNetworkWeaveValue(stop.x)}px, ${formatNetworkWeaveValue(stop.y)}px`;
    variables[`--weave-turn-${index}`] =
      `${formatNetworkWeaveValue(stop.angle)}deg`;
  });
  return variables as CSSProperties;
};

const DEFAULT_COLORS = [
  'var(--node-1)',
  'var(--edge-1)',
  'var(--ord-1)',
  'var(--edge-8)',
  'var(--node-6)',
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
  const resolvedFlare = clampNetworkWeaveValue(flare, 0, 4, 1);
  const resolvedSpeedFactor = clampNetworkWeaveValue(speedFactor, 0.1, 4, 1);
  const rawId = useId().replace(/:/g, '');
  const ribbonFlowClass = `network-weave-ribbon-flow-${rawId}`;
  const ribbonFlowKeyframes = `network-weave-ribbon-drift-${rawId}`;
  // Rounded here, once, so that the steps below divide the duration the
  // stylesheet actually states.
  const ribbonFlowDuration = formatNetworkWeaveValue(
    RIBBON_FLOW_DURATION / resolvedSpeedFactor,
  );
  // Each stretch between two stops is taken in a whole number of steps, and
  // every signal starts a whole number of steps into its journey.
  const stepsPerSegment = Math.max(
    1,
    Math.round(
      (ribbonFlowDuration * SIGNAL_STEPS_PER_SECOND) /
        NETWORK_WEAVE_SIGNAL_SEGMENTS,
    ),
  );
  const signalSteps = NETWORK_WEAVE_SIGNAL_SEGMENTS * stepsPerSegment;
  const signalStepDuration = ribbonFlowDuration / signalSteps;
  const dotUnitsPerSecond =
    (TRIBUTARY_FLOW_DISTANCE * resolvedSpeedFactor) / TRIBUTARY_FLOW_DURATION;
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
    <div
      aria-hidden
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor,
        ...style,
        pointerEvents: 'none',
      }}
    >
      {/* Reduced motion follows AnimationProvider: its `data-reduced-motion`
          on the document root when it overrides the operating system,
          otherwise the system preference. The dots follow it too, in
          NetworkWeaveDots. */}
      {animated && (
        <style>{`
          .${ribbonFlowClass} { position: absolute; left: ${formatNetworkWeaveValue(-SIGNAL_WIDTH / 2)}px; top: ${formatNetworkWeaveValue(-SIGNAL_HEIGHT / 2)}px; width: ${formatNetworkWeaveValue(SIGNAL_WIDTH)}px; height: ${formatNetworkWeaveValue(SIGNAL_HEIGHT)}px; border-radius: ${formatNetworkWeaveValue(SIGNAL_RADIUS_X)}px / ${formatNetworkWeaveValue(SIGNAL_RADIUS_Y)}px; opacity: 0.78; will-change: transform; animation: ${ribbonFlowKeyframes} ${ribbonFlowDuration}s steps(${stepsPerSegment}) infinite; }
          ${signalKeyframes(ribbonFlowKeyframes)}
          .network-weave__signals:not([data-measured]) { visibility: hidden; }
          :root[data-reduced-motion='always'] .${ribbonFlowClass} { animation: none; visibility: hidden; }
          @media (prefers-reduced-motion: reduce) { :root:not([data-reduced-motion='never']) .${ribbonFlowClass} { animation: none; visibility: hidden; } }
        `}</style>
      )}

      {/* One group for the whole scene, so the layers below blend with each
          other and fade together, as the shapes of a single drawing would. */}
      <div
        className="network-weave__scene"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: formatNetworkWeaveValue(resolvedIntensity),
          isolation: 'isolate',
        }}
      >
        <svg
          viewBox={`0 0 ${NETWORK_WEAVE_WIDTH} ${NETWORK_WEAVE_HEIGHT}`}
          preserveAspectRatio="none"
          focusable="false"
          className="network-weave__ribbons"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {scene.ribbons.map((ribbon, index) => {
              const color =
                activeColors[ribbon.colorIndex] ?? DEFAULT_COLORS[0];
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
            {scene.ribbons.map((ribbon, index) => (
              <path
                key={`ribbon-guide-${index}`}
                className="network-weave__ribbon-guide"
                d={ribbon.guideD}
                data-centerline={ribbon.centerlineD}
                fill={activeColors[ribbon.colorIndex] ?? DEFAULT_COLORS[0]}
                fillOpacity="0.18"
                style={{ mixBlendMode: blendMode }}
              />
            ))}
          </g>
        </svg>

        {animated && scene.tributaryBounds && (
          <NetworkWeaveDots
            bounds={scene.tributaryBounds}
            unitsPerSecond={dotUnitsPerSecond}
            dots={scene.tributaries.map((tributary, index) => ({
              d: tributary.d,
              color: activeColors[tributary.colorIndex],
              phase:
                ((index / scene.tributaries.length) * TRIBUTARY_FLOW_DISTANCE) %
                NETWORK_WEAVE_DOT_SPACING,
            }))}
          />
        )}

        {animated && (
          <NetworkWeaveSignalStage>
            {scene.ribbons.map((ribbon, index) => (
              <div
                key={`ribbon-signals-${index}`}
                style={signalStopVariables(ribbon.signalStops)}
              >
                {Array.from(
                  { length: SIGNALS_PER_RIBBON },
                  (_, signalIndex) => {
                    const phase =
                      (signalIndex / SIGNALS_PER_RIBBON +
                        ribbon.phase / SIGNALS_PER_RIBBON) %
                      1;
                    return (
                      <div
                        key={`ribbon-flow-${signalIndex}`}
                        className={`network-weave__ribbon-flow ${ribbonFlowClass}`}
                        style={{
                          backgroundColor:
                            activeColors[ribbon.colorIndex] ??
                            DEFAULT_COLORS[0],
                          // In milliseconds, to a precision far finer than a
                          // frame: a delay rounded any more coarsely would
                          // put this signal's steps between the others'.
                          animationDelay: `${Number(
                            (
                              -Math.round(phase * signalSteps) *
                              signalStepDuration *
                              1000
                            ).toFixed(4),
                          )}ms`,
                          mixBlendMode: blendMode,
                        }}
                      />
                    );
                  },
                )}
              </div>
            ))}
          </NetworkWeaveSignalStage>
        )}
      </div>
    </div>
  );
};

export default NetworkWeaveBackground;
