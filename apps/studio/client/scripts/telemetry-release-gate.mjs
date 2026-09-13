import { runTelemetryBrowserQualification } from './telemetry-egress.mjs';

await runTelemetryBrowserQualification({
  image: process.env.STUDIO_TELEMETRY_RELEASE_IMAGE,
});
