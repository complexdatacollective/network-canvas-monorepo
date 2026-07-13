import { createReadStream, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path, { extname, join } from 'node:path';

import { log } from './logger.js';

const MIME_TYPES: Record<string, string> = {
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  // Data
  '.json': 'application/json',
  '.csv': 'text/csv',
};

/**
 * Simple HTTP server for serving protocol assets during E2E tests.
 *
 * Protocol assets (images, video, audio) are extracted from .netcanvas files
 * and served from a dedicated directory so tests can reference them via HTTP.
 */
export class AssetServer {
  private server: Server;
  private port: number;
  url: string;

  private constructor(server: Server, port: number) {
    this.server = server;
    this.port = port;
    this.url = `http://localhost:${port}`;
  }

  static async start(assetDir: string, port: number): Promise<AssetServer> {
    // Ensure asset directory exists
    await fs.mkdir(assetDir, { recursive: true });

    const server = createServer((req, res) => {
      // Add CORS headers for cross-origin requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }

      const urlPath = decodeURIComponent(
        new URL(req.url ?? '/', 'http://localhost').pathname,
      );
      const filePath = join(assetDir, urlPath);

      try {
        const stat = statSync(filePath);
        // Directory requests (e.g. a health-check GET of '/') must 404
        // instead of crashing the whole server with an unhandled EISDIR
        // stream error.
        if (!stat.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`Not found: ${urlPath}`);
          return;
        }
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache',
        });

        const stream = createReadStream(filePath);
        stream.on('error', () => {
          res.destroy();
        });
        stream.pipe(res);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Not found: ${urlPath}`);
      }
    });

    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, () => {
        const assetServer = new AssetServer(server, port);
        log('setup', `Asset server started at ${assetServer.url}`);
        resolve(assetServer);
      });
    });
  }

  async stop(): Promise<void> {
    log('teardown', `Stopping asset server on port ${this.port}...`);
    return new Promise((resolve) => {
      this.server.close(() => {
        log('teardown', `Asset server on port ${this.port} stopped`);
        resolve();
      });
    });
  }

  /**
   * Intentionally disabled: e2e/.assets is shared by all parallel workers,
   * so a recursive delete here would destroy other workers' in-flight
   * fixtures. Per-protocol cleanup lives in ProtocolFixture.uninstall().
   */
  cleanup(): never {
    throw new Error(
      'AssetServer.cleanup() must not be used: e2e/.assets is shared across parallel workers.',
    );
  }

  /** Get the full URL for an asset path. */
  getAssetUrl(assetPath: string): string {
    return `${this.url}/${assetPath}`;
  }
}

// Fixed port for asset server (outside the range used by app servers)
export const ASSET_SERVER_PORT = 4200;

// Standalone entry point: invoked by Playwright's webServer config via
// `tsx e2e/helpers/assetServer.ts`. Serves assets from e2e/.assets/ at port 4200.
const assetDir = path.resolve(process.cwd(), 'e2e/.assets');
await AssetServer.start(assetDir, ASSET_SERVER_PORT);
