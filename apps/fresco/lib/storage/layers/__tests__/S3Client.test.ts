import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createS3Client } from '~/lib/storage/layers/S3Client';

const client = createS3Client({
  endpoint: 'https://fresco.example.org',
  region: 'us-east-1',
  accessKeyId: 'GK0123456789abcdef01234567',
  secretAccessKey: '0'.repeat(64),
});

describe('createS3Client', () => {
  // The browser uploads the real body to a presigned PUT; a checksum signed
  // into the URL is computed over no body at all, and Garage rejects it.
  it('signs presigned uploads without a body checksum', async () => {
    const url = new URL(
      await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: 'assets',
          Key: 'a.png',
          ContentLength: 5,
        }),
        { expiresIn: 60 },
      ),
    );
    const params = [...url.searchParams.keys()].map((k) => k.toLowerCase());
    expect(params.filter((k) => k.includes('checksum'))).toEqual([]);
    expect(url.pathname).toBe('/assets/a.png');
  });

  it('signs presigned downloads without requesting checksum validation', async () => {
    const url = new URL(
      await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: 'assets', Key: 'a.png' }),
        { expiresIn: 60 },
      ),
    );
    const params = [...url.searchParams.keys()].map((k) => k.toLowerCase());
    expect(params.filter((k) => k.includes('checksum'))).toEqual([]);
  });
});
