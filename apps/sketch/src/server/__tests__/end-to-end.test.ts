// @vitest-environment node
// The whole round trip with fake providers: POST /api/jobs, the background
// run, GET /api/jobs/:id, then the .netcanvas file the page builds from the
// result, read back the way Architect and Interviewer read an archive.
import { describe, expect, it } from 'vitest';

import {
  extractProtocol,
  loadNetcanvasArchive,
  validateProtocol,
} from '@codaco/protocol-validation';

import { buildNetcanvas } from '../../handoff/netcanvas.ts';
import type { CreateJobResponse, JobStatus } from '../../shared/api.ts';
import { coverageDesign } from '../design/__fixtures__/cases.ts';
import {
  friendshipDescription,
  friendshipDesign,
  friendshipWording,
} from '../design/__fixtures__/example.ts';
import { handleCreateJob, handleGenerate, handleGetJob } from '../handlers.ts';
import {
  memoryStore,
  reply,
  scriptedAdapter,
  STUDY_SCREENING,
} from './fakes.ts';

const post = (path: string, body: unknown) =>
  new Request(`https://sketch.test${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('Sketch end to end with fake providers', () => {
  it.each([
    { name: 'the worked example', design: friendshipDesign, assets: 0 },
    // A roster and a geospatial stage: the archive carries both files.
    { name: 'the coverage design', design: coverageDesign, assets: 2 },
  ])(
    'turns $name into a .netcanvas that validates',
    async ({ design, assets }) => {
      const jobs = memoryStore();
      const log = memoryStore();
      const { adapters } = scriptedAdapter({
        screening: [reply(STUDY_SCREENING)],
        study_design: [reply(design)],
        wording: [reply(friendshipWording)],
      });
      const started: string[] = [];

      const created = await handleCreateJob(
        post('/api/jobs', {
          description: friendshipDescription,
          provider: 'anthropic',
        }),
        {
          jobs,
          adapters,
          startBackground: async (jobId) => {
            started.push(jobId);
          },
        },
      );
      expect(created.status).toBe(202);
      const { jobId } = (await created.json()) as CreateJobResponse;
      expect(started).toEqual([jobId]);

      const generated = await handleGenerate(post('/bg', { jobId }), {
        jobs,
        log,
        adapters,
      });
      expect(generated.status).toBe(200);

      const polled = await handleGetJob(jobId, { jobs });
      const status = (await polled.json()) as JobStatus;
      expect(status.status).toBe('succeeded');
      expect(status.steps.every((s) => s.state === 'done')).toBe(true);
      expect(status.result?.attempts).toBe(1);
      expect(status.usage?.costUsd).toBeGreaterThan(0);
      const result = status.result;
      if (!result) throw new Error('no result');
      expect(result.assets).toHaveLength(assets);

      // What the page downloads, read back as a host reads it.
      const bytes = await buildNetcanvas(result.protocol, result.assets);
      const zip = await loadNetcanvasArchive(bytes);
      expect(Object.keys(zip.files)).toContain('protocol.json');
      const extracted = await extractProtocol(Buffer.from(bytes));
      expect(extracted.missingAssets).toEqual([]);
      // Every generated file comes back out under its manifest key (the
      // manifest may also hold file-less entries, such as a map token).
      const fileAssets = extracted.assets.filter((a) => a.data instanceof Blob);
      expect(fileAssets.map((a) => a.id).toSorted()).toEqual(
        result.assets.map((a) => a.id).toSorted(),
      );
      const validation = await validateProtocol(extracted.protocol);
      expect(validation.success).toBe(true);

      // Every asset the handoff sends is one the manifest names.
      const manifest = (result.protocol.assetManifest ?? {}) as Record<
        string,
        { source?: string }
      >;
      for (const asset of result.assets) {
        expect(manifest[asset.id]?.source).toBe(asset.name);
      }
    },
  );
});
