export const TELEMETRY_EGRESS_MARKER =
  'STUDIO_QUALIFICATION_TELEMETRY_EGRESS_V1';

export const TELEMETRY_DETECTOR_SOURCE = `
const { createServer } = require('node:net');
createServer((socket) => {
  process.stdout.write(${JSON.stringify(TELEMETRY_EGRESS_MARKER)} + '\\n');
  socket.destroy();
}).listen(443, '0.0.0.0');
`;

export const TELEMETRY_CANARY_SOURCE = `
const { connect } = require('node:net');
let attempts = 0;
function attempt() {
  const socket = connect(443, 'ph-relay.networkcanvas.com');
  socket.setTimeout(1_000, () => socket.destroy(new Error('timeout')));
  socket.once('connect', () => socket.end(() => process.exit(0)));
  socket.once('error', () => {
    socket.destroy();
    if (++attempts >= 40) process.exit(1);
    setTimeout(attempt, 50);
  });
}
attempt();
`;

export function telemetryEgressCount(logs: string) {
  return logs.split(TELEMETRY_EGRESS_MARKER).length - 1;
}

export function assertNoTelemetryEgress(logs: string) {
  if (telemetryEgressCount(logs) !== 0)
    throw new Error('Running-image telemetry qualification detected egress.');
}

export function assertTelemetryDetectorPositive(logs: string) {
  if (telemetryEgressCount(logs) !== 1)
    throw new Error('Running-image telemetry detector control failed.');
}
