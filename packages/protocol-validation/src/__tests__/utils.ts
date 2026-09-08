import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { Endpoints } from '@octokit/types';
import * as dotenv from 'dotenv';
import gunzip from 'gunzip-maybe';
import * as tarStream from 'tar-stream';

type GitHubRelease =
  Endpoints['GET /repos/{owner}/{repo}/releases/latest']['response']['data'];

dotenv.config();

const checkEnvVariable = (varName: string): string => {
  const value = process.env[varName];
  if (!value) {
    throw new Error(`Missing environment variable: ${varName}`);
  }
  return value;
};

const ensureFolderExists = (folderPath: string) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }
};

const checkCache = (): number => {
  const cacheFilePath = path.join(__dirname, '.cache');
  if (!fs.existsSync(cacheFilePath)) {
    return 0;
  }
  const cache = fs.readFileSync(cacheFilePath, 'utf8');
  return Number.parseInt(cache, 10);
};

const updateCache = (size: number) => {
  const cacheFilePath = path.join(__dirname, '.cache');
  fs.writeFileSync(cacheFilePath, size.toString());
};

// Utility functions for encryption handling
const decryptFile = async (encryptedBuffer: Buffer) => {
  const key = checkEnvVariable('PROTOCOL_ENCRYPTION_KEY');
  const iv = checkEnvVariable('PROTOCOL_ENCRYPTION_IV');
  const decipher = createDecipheriv(
    'aes-256-cbc',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'hex'),
  );
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};

/**
 * How long the whole corpus download may take.
 *
 * One budget for the download rather than one per request, because that is
 * what it replaces: the corpus used to be fetched inside `beforeAll(…,
 * 300_000)`, and splitting the suite into a test per protocol moved the fetch
 * to module load, where no Vitest hook or test timeout governs it at all. A
 * stalled GitHub request would then hang the run until whatever outer limit CI
 * happens to impose, and report it as the job timing out rather than as the
 * download failing.
 */
export const CORPUS_DOWNLOAD_BUDGET_MS = 300_000;

const corpusTimeoutMessage = () =>
  `The test-protocol corpus did not finish downloading within ${
    CORPUS_DOWNLOAD_BUDGET_MS / 1000
  }s. The GitHub release API or the release asset did not respond.`;

/**
 * The corpus, under a bound the suite owns.
 *
 * The signal is passed to every request, so a stalled response aborts rather
 * than waiting on the server, and the timer is cleared however this ends — a
 * pending timer would keep Node's event loop alive past the run.
 */
export async function downloadAndDecryptProtocols(): Promise<
  Map<string, Buffer>
> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(corpusTimeoutMessage())),
    CORPUS_DOWNLOAD_BUDGET_MS,
  );
  try {
    return await downloadCorpus(controller.signal);
  } catch (cause) {
    // Said in the suite's own words rather than in the runtime's: an
    // `AbortError` names neither the corpus nor the budget it exceeded.
    if (controller.signal.aborted) {
      throw new Error(corpusTimeoutMessage(), { cause });
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadCorpus(
  signal: AbortSignal,
): Promise<Map<string, Buffer>> {
  const githubToken = checkEnvVariable('GITHUB_TOKEN');
  const protocols = new Map<string, Buffer>();

  const downloadFolder = path.join(__dirname, 'data');
  // First, get the releases from the test-protocols repo. Note that this requires us to authenticate with a GitHub token.
  const res = await fetch(
    'https://api.github.com/repos/complexdatacollective/test-protocols/releases/latest',
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
      },
      signal,
    },
  );

  // A refused or rate-limited request answers with JSON that has no `assets`,
  // which reached the reader below as a TypeError about `undefined` rather
  // than as the request that failed.
  if (!res.ok) {
    throw new Error(
      `Could not read the latest test-protocols release: ${res.status} ${res.statusText}.`,
    );
  }

  const release = (await res.json()) as GitHubRelease;

  // The test protocols are stored in an asset called "protocols.tar.gz.enc" attached to each release
  const asset = release.assets.find(
    (releaseAsset) => releaseAsset.name === 'protocols.tar.gz.enc',
  );

  if (!asset) {
    throw new Error('protocols.tar.gz.enc asset not found in latest release');
  }

  const assetSize = asset.size;

  // Check the cache size and compare it with the current asset size
  const cacheSize = checkCache();
  if (cacheSize !== assetSize) {
    // If sizes are different, delete the existing data directory
    const dataFolder = path.join(__dirname, 'data');
    if (fs.existsSync(dataFolder)) {
      fs.rmSync(dataFolder, { recursive: true, force: true });
    }

    // Fetch the asset into a Buffer
    const assetRes = await fetch(asset.url, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/octet-stream',
      },
      signal,
    });

    if (!assetRes.ok) {
      throw new Error(
        `Could not download the test-protocol corpus: ${assetRes.status} ${assetRes.statusText}.`,
      );
    }

    const encryptedData = await assetRes.arrayBuffer();
    const encryptedBuffer = Buffer.from(encryptedData);

    const decryptedData = await decryptFile(encryptedBuffer);

    // Save the decrypted data to the /data folder
    ensureFolderExists(dataFolder);
    const decryptedFilePath = path.join(dataFolder, 'protocols.tar.gz');
    fs.writeFileSync(decryptedFilePath, decryptedData);

    updateCache(assetSize);
  }

  const decryptedFilePath = path.join(downloadFolder, 'protocols.tar.gz');
  const decryptedData = fs.readFileSync(decryptedFilePath);

  const readStream = Readable.from(decryptedData);
  const extract = tarStream.extract();

  await new Promise((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      if (
        header.name.startsWith('data/') &&
        header.name.endsWith('.netcanvas')
      ) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const fileName = header.name.split('/').pop() as string;
          protocols.set(fileName, Buffer.concat(chunks));
          next();
        });
      } else {
        stream.on('end', next);
      }
      stream.resume();
    });

    extract.on('finish', resolve);
    extract.on('error', reject);

    readStream.pipe(gunzip()).pipe(extract);
  });

  return protocols;
}
