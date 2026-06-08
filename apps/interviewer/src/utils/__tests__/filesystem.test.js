import { Buffer } from 'buffer';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../Environment');
import { getEnvironment, isCapacitor } from '../Environment';
import environments from '../environments';

const fsMock = vi.hoisted(() => ({
  writeFile: vi.fn(() => Promise.resolve({ uri: 'file:///x' })),
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: fsMock,
  Directory: { Data: 'DATA', Cache: 'CACHE' },
}));

import { writeStream } from '../filesystem';

beforeEach(() => {
  vi.clearAllMocks();
  isCapacitor.mockReturnValue(true);
  getEnvironment.mockReturnValue(environments.CAPACITOR);
});

describe('filesystem', () => {
  describe('Capacitor', () => {
    it('implements stream writing', async () => {
      const chunk = Buffer.from('hello');
      const mockZipStream = {
        on: vi.fn().mockImplementation((evt, cb) => {
          if (evt === 'data') {
            cb(chunk);
          }
          if (evt === 'end') {
            cb();
          }
          return mockZipStream;
        }),
      };

      const result = await writeStream('protocols/p/foo.mp4', mockZipStream);

      expect(mockZipStream.on).toHaveBeenCalledWith(
        'data',
        expect.any(Function),
      );
      expect(fsMock.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'protocols/p/foo.mp4',
          directory: 'DATA',
          data: chunk.toString('base64'),
          recursive: true,
        }),
      );
      expect(result).toBe('protocols/p/foo.mp4');
    });
  });
});
