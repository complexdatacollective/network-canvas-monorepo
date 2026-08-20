import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  extractProtocol,
  extractProtocolFromZip,
  loadNetcanvasArchive,
  MAX_INFLATED_BYTES,
  NetcanvasInflationLimitError,
} from '../extractProtocol.ts';
import { MalformedNetcanvasError } from '../malformedNetcanvasError.ts';

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

  // Every failure below is classified rather than left to the thrower, so a
  // host can say what is wrong with the file without repeating JSZip's or V8's
  // wording. The technical text stays on `message`/`cause` for the console.
  describe('classified failures', () => {
    it('rejects a file that is not a zip archive at all', async () => {
      const notAnArchive = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const error = await extractProtocol(notAnArchive).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(MalformedNetcanvasError);
      expect((error as MalformedNetcanvasError).reason).toBe('not-an-archive');
      // The library's own message survives for support, one level down.
      expect(String((error as MalformedNetcanvasError).cause)).toMatch(
        /central directory/i,
      );
    });

    it('exposes the same classification from the shared archive loader', async () => {
      // Architect's size guard loads the archive itself, so the loader has to
      // classify too — otherwise the drop path and the package path diverge.
      await expect(
        loadNetcanvasArchive(new Uint8Array([1, 2, 3])),
      ).rejects.toBeInstanceOf(MalformedNetcanvasError);
    });

    it('rejects an archive with no protocol.json', async () => {
      const buffer = await buildZip({ 'assets/other.txt': 'hello' });

      const error = await extractProtocol(buffer).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(MalformedNetcanvasError);
      expect((error as MalformedNetcanvasError).reason).toBe(
        'missing-protocol',
      );
    });

    it('rejects a protocol.json that is not valid JSON, keeping the parser error as the cause', async () => {
      const buffer = await buildZip({ 'protocol.json': '{"name": tru' });

      const error = await extractProtocol(buffer).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(MalformedNetcanvasError);
      expect((error as MalformedNetcanvasError).reason).toBe(
        'unreadable-protocol-json',
      );
      expect((error as MalformedNetcanvasError).cause).toBeInstanceOf(
        SyntaxError,
      );
      // The parser's cursor position must not have leaked into the message.
      expect((error as MalformedNetcanvasError).message).not.toMatch(
        /position \d+/,
      );
    });

    it('rejects a manifest entry whose file is absent, naming the resource', async () => {
      const protocol = {
        schemaVersion: 8,
        assetManifest: {
          img1: {
            type: 'image',
            name: 'Village map',
            source: 'village-map.png',
          },
        },
      };
      const buffer = await buildZip({
        'protocol.json': JSON.stringify(protocol),
      });

      const error = await extractProtocol(buffer).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(MalformedNetcanvasError);
      expect((error as MalformedNetcanvasError).reason).toBe('missing-asset');
      // The manifest's display name, not the zip path — it is what the
      // researcher called the resource.
      expect((error as MalformedNetcanvasError).assetName).toBe('Village map');
    });

    it('rejects a manifest entry that is not a recognised shape', async () => {
      const buffer = await buildZip({
        'protocol.json': JSON.stringify({
          schemaVersion: 8,
          assetManifest: { broken: 'not-an-object' },
        }),
      });

      const error = await extractProtocol(buffer).catch(
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(MalformedNetcanvasError);
      expect((error as MalformedNetcanvasError).reason).toBe(
        'invalid-asset-definition',
      );
    });
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
