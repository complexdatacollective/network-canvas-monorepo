import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  extractProtocol,
  extractProtocolFromZip,
  MAX_INFLATED_BYTES,
  NetcanvasInflationLimitError,
} from '../extractProtocol.ts';

const buildZip = async (entries: Record<string, string>): Promise<Buffer> => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

describe('extractProtocol', () => {
  it('extracts a protocol from a valid zip buffer', async () => {
    const protocol = {
      schemaVersion: 8,
      name: 'Test Protocol',
      stages: [],
      codebook: { node: {}, edge: {}, ego: {} },
    };
    const buffer = await buildZip({
      'protocol.json': JSON.stringify(protocol),
    });

    const result = await extractProtocol(buffer);
    expect(result).toEqual({ protocol, assets: [] });
  });

  it('throws when protocol.json is not present', async () => {
    const buffer = await buildZip({ 'assets/other.txt': 'hello' });

    await expect(extractProtocol(buffer)).rejects.toThrow(
      'protocol.json not found in zip',
    );
  });

  it('throws when protocol.json contains invalid JSON', async () => {
    const buffer = await buildZip({ 'protocol.json': 'invalid json {' });

    await expect(extractProtocol(buffer)).rejects.toThrow();
  });

  it('inflates asset files declared in the manifest', async () => {
    const protocol = {
      schemaVersion: 8,
      assetManifest: {
        img1: { type: 'image', name: 'photo.png', source: 'photo.png' },
      },
    };
    const buffer = await buildZip({
      'protocol.json': JSON.stringify(protocol),
      'assets/photo.png': 'PNGDATA',
    });

    const result = await extractProtocol(buffer);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]!.id).toBe('img1');
    expect(result.assets[0]!.name).toBe('photo.png');
    expect(result.assets[0]!.data).toBeInstanceOf(Blob);
    expect(await (result.assets[0]!.data as Blob).text()).toBe('PNGDATA');
  });

  it('restores the SVG MIME type from the manifest source filename', async () => {
    const protocol = {
      schemaVersion: 8,
      assetManifest: {
        background: {
          type: 'image',
          name: 'Responsive background',
          source: 'BACKGROUND.SVG',
        },
      },
    };
    const buffer = await buildZip({
      'protocol.json': JSON.stringify(protocol),
      'assets/BACKGROUND.SVG': '<svg xmlns="http://www.w3.org/2000/svg" />',
    });

    const result = await extractProtocol(buffer);
    expect(result.assets[0]!.data).toBeInstanceOf(Blob);
    expect((result.assets[0]!.data as Blob).type).toBe('image/svg+xml');
  });

  it('passes through apikey assets without inflating a file', async () => {
    const protocol = {
      schemaVersion: 8,
      assetManifest: {
        key1: { type: 'apikey', name: 'My Key', value: 'secret-value' },
      },
    };
    const buffer = await buildZip({
      'protocol.json': JSON.stringify(protocol),
    });

    const result = await extractProtocol(buffer);
    expect(result.assets).toEqual([
      { id: 'key1', name: 'My Key', data: 'secret-value' },
    ]);
  });

  describe('inflation cap (deflate-bomb defence)', () => {
    it('aborts inflation when the actual decompressed output exceeds the cap', async () => {
      // A tiny compressed archive whose entry inflates to 2MB. With a 1MB cap the
      // stream must abort part-way through inflation rather than buffering it all.
      const bomb = '0'.repeat(2 * 1024 * 1024);
      const buffer = await buildZip({
        'protocol.json': '{"schemaVersion":8}',
        'assets/bomb.bin': bomb,
      });
      expect(buffer.byteLength).toBeLessThan(bomb.length);

      const protocol = {
        schemaVersion: 8,
        assetManifest: {
          b: { type: 'file', name: 'bomb.bin', source: 'bomb.bin' },
        },
      };
      const bombBuffer = await buildZip({
        'protocol.json': JSON.stringify(protocol),
        'assets/bomb.bin': bomb,
      });

      await expect(
        extractProtocol(bombBuffer, 1024 * 1024),
      ).rejects.toBeInstanceOf(NetcanvasInflationLimitError);
    });

    it('does not trust the declared central-directory size — the cap is driven by streamed bytes', async () => {
      // Under-declare the entry's uncompressed size in the central directory so
      // any header-only check would wave the bomb through. The incremental cap
      // must still fire because it counts bytes as they are actually inflated.
      const bomb = '0'.repeat(2 * 1024 * 1024);
      const protocol = {
        schemaVersion: 8,
        assetManifest: {
          b: { type: 'file', name: 'bomb.bin', source: 'bomb.bin' },
        },
      };
      const buffer = await buildZip({
        'protocol.json': JSON.stringify(protocol),
        'assets/bomb.bin': bomb,
      });
      const zip = await JSZip.loadAsync(buffer);

      const bombEntry = zip.file('assets/bomb.bin')!;
      // Lie about the size the way an attacker would; the header now claims 1 byte.
      (
        bombEntry as unknown as { _data: { uncompressedSize: number } }
      )._data.uncompressedSize = 1;

      await expect(
        extractProtocolFromZip(zip, 1024 * 1024),
      ).rejects.toBeInstanceOf(NetcanvasInflationLimitError);
    });

    it('counts bytes across every entry so a bomb split over multiple files is caught', async () => {
      const half = '0'.repeat(700 * 1024);
      const protocol = {
        schemaVersion: 8,
        assetManifest: {
          a: { type: 'file', name: 'a.bin', source: 'a.bin' },
          b: { type: 'file', name: 'b.bin', source: 'b.bin' },
        },
      };
      const buffer = await buildZip({
        'protocol.json': JSON.stringify(protocol),
        'assets/a.bin': half,
        'assets/b.bin': half,
      });

      // Each entry (700KB) is under a 1MB cap, but together they exceed it.
      await expect(extractProtocol(buffer, 1024 * 1024)).rejects.toBeInstanceOf(
        NetcanvasInflationLimitError,
      );
    });

    it('allows an archive whose total inflated size stays within the cap', async () => {
      const payload = '0'.repeat(200 * 1024);
      const protocol = {
        schemaVersion: 8,
        assetManifest: {
          a: { type: 'file', name: 'a.bin', source: 'a.bin' },
        },
      };
      const buffer = await buildZip({
        'protocol.json': JSON.stringify(protocol),
        'assets/a.bin': payload,
      });

      const result = await extractProtocol(buffer, 1024 * 1024);
      expect(result.assets).toHaveLength(1);
    });

    it('defaults to MAX_INFLATED_BYTES when no cap is provided', async () => {
      expect(MAX_INFLATED_BYTES).toBe(1024 * 1024 * 1024);
      const buffer = await buildZip({
        'protocol.json': '{"schemaVersion":8}',
      });
      const result = await extractProtocol(buffer);
      expect(result.protocol).toEqual({ schemaVersion: 8 });
    });
  });
});
