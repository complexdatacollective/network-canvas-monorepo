/* global FileWriter, FileError, cordova */
/**
 * Filesystem utilities with secure API support.
 *
 * This module provides filesystem operations for both Electron and Cordova platforms.
 * In Electron, it uses the secure electronAPI (via IPC) instead of direct Node.js access.
 */

import { Buffer } from 'buffer';

import { trimChars } from 'lodash/fp';

import inEnvironment, { isElectron } from './Environment';
import environments from './environments';

const trimPath = trimChars('/ ');

const splitUrl = (targetPath) => {
  const pathParts = trimPath(targetPath).split('/');
  const baseDirectory = `${pathParts.slice(0, -1).join('/')}/`;
  const directory = `${pathParts.slice(-1)}`;
  return [baseDirectory, directory];
};

const inSequence = (items, apply) =>
  items.reduce(
    (result, item) => result.then(() => apply(item)),
    Promise.resolve(),
  );

const concatTypedArrays = (a, b) => {
  const combined = new Uint8Array(a.byteLength + b.byteLength);
  combined.set(a);
  combined.set(b, a.length);
  return combined;
};

// Path cache for frequently accessed paths (populated on first access)
let pathCache = {};

/**
 * Get the temporary data path.
 * Returns a Promise in Electron (using secure IPC).
 */
const tempDataPath = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async () => {
      if (pathCache.temp) {
        return pathCache.temp;
      }
      if (isElectron() && window.electronAPI?.app?.getPath) {
        pathCache.temp = await window.electronAPI.app.getPath('temp');
        return pathCache.temp;
      }
      throw new Error('electronAPI not available');
    };
  }

  if (environment === environments.CORDOVA) {
    return () => cordova.file.cacheDirectory;
  }

  throw new Error(`tempDataPath() not available on platform ${environment}`);
});

/**
 * Get the user data path.
 * Returns a Promise in Electron (using secure IPC).
 */
const userDataPath = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async () => {
      if (pathCache.userData) {
        return pathCache.userData;
      }
      if (isElectron() && window.electronAPI?.app?.getPath) {
        pathCache.userData = await window.electronAPI.app.getPath('userData');
        return pathCache.userData;
      }
      throw new Error('electronAPI not available');
    };
  }

  if (environment === environments.CORDOVA) {
    return () => cordova.file.dataDirectory;
  }

  throw new Error(`userDataPath() not available on platform ${environment}`);
});

const resolveFileSystemUrl = inEnvironment((environment) => {
  if (environment === environments.CORDOVA) {
    return (path) =>
      new Promise((resolve, reject) => {
        window.resolveLocalFileSystemURL(path, resolve, reject);
      });
  }

  throw new Error(
    `resolveFileSystemUrl() not available on platform ${environment}`,
  );
});

/**
 * Read a file from the filesystem.
 * In Electron, uses secure IPC.
 */
const readFile = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async (filename) => {
      if (!isElectron() || !window.electronAPI?.fs?.readFile) {
        throw new Error('electronAPI not available');
      }
      // readFile returns base64 encoded data for binary files
      const data = await window.electronAPI.fs.readFile(filename);
      // Convert base64 back to Buffer
      if (typeof data === 'string') {
        return Buffer.from(data, 'base64');
      }
      return data;
    };
  }

  if (environment === environments.CORDOVA) {
    const fileReader = (fileEntry) =>
      new Promise((resolve, reject) => {
        fileEntry.file((file) => {
          const reader = new FileReader();

          reader.onloadend = (event) => {
            resolve(Buffer.from(event.target.result));
          };

          reader.onerror = (error) => reject(error);

          reader.readAsArrayBuffer(file);
        }, reject);
      });

    return (filename) => resolveFileSystemUrl(filename).then(fileReader);
  }

  throw new Error(`readFile() not available on platform ${environment}`);
});

const makeFileWriter = (fileEntry) =>
  new Promise((resolve, reject) => {
    fileEntry.createWriter(resolve, reject);
  });

const newFile = (directoryEntry, filename) =>
  new Promise((resolve, reject) => {
    directoryEntry.getFile(filename, { create: true }, resolve, reject);
  });

/**
 * Write a file to the filesystem.
 * In Electron, uses secure IPC.
 */
const writeFile = inEnvironment((environment) => {
  if (environment === environments.CORDOVA) {
    return (fileUrl, data) => {
      const [baseDirectory, filename] = splitUrl(fileUrl);

      return resolveFileSystemUrl(baseDirectory)
        .then((directoryEntry) => newFile(directoryEntry, filename))
        .then(makeFileWriter)
        .then(
          (fileWriter) =>
            new Promise((resolve, reject) => {
              fileWriter.onwriteend = () => resolve(fileUrl);
              fileWriter.onerror = (error) => reject(error);
              fileWriter.write(data);
            }),
        );
    };
  }

  if (environment === environments.ELECTRON) {
    return async (filePath, data) => {
      if (!isElectron() || !window.electronAPI?.fs?.writeFile) {
        throw new Error('electronAPI not available');
      }
      // Binary data is base64-encoded for IPC; flag it so main decodes it
      // reliably (regardless of size) rather than guessing.
      let dataToWrite = data;
      let isBinary = false;
      if (Buffer.isBuffer(data)) {
        dataToWrite = data.toString('base64');
        isBinary = true;
      } else if (data instanceof ArrayBuffer) {
        dataToWrite = Buffer.from(data).toString('base64');
        isBinary = true;
      } else if (data instanceof Uint8Array) {
        dataToWrite = Buffer.from(data).toString('base64');
        isBinary = true;
      }
      await window.electronAPI.fs.writeFile(filePath, dataToWrite, isBinary);
      return filePath;
    };
  }

  throw new Error(`writeFile() not available on platform ${environment}`);
});

/**
 * Create a directory.
 * In Electron, uses secure IPC.
 */
const createDirectory = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async (targetPath) => {
      if (!isElectron() || !window.electronAPI?.fs?.mkdir) {
        throw new Error('electronAPI not available');
      }
      try {
        await window.electronAPI.fs.mkdir(targetPath);
        return targetPath;
      } catch (error) {
        // Ignore EEXIST errors
        if (error.code !== 'EEXIST') {
          throw error;
        }
        return targetPath;
      }
    };
  }

  if (environment === environments.CORDOVA) {
    const appendDirectory = (directoryEntry, directoryToAppend) =>
      new Promise((resolve, reject) => {
        directoryEntry.getDirectory(
          directoryToAppend,
          { create: true },
          resolve,
          reject,
        );
      });

    return (targetUrl) => {
      const [baseDirectory, directoryToAppend] = splitUrl(targetUrl);

      return resolveFileSystemUrl(baseDirectory).then((directoryEntry) =>
        appendDirectory(directoryEntry, directoryToAppend),
      );
    };
  }

  throw new Error(`createDirectory() not available on platform ${environment}`);
});

/**
 * Rename a file or directory.
 * In Electron, uses secure IPC.
 */
const rename = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async (oldPath, newPath) => {
      if (!isElectron() || !window.electronAPI?.fs?.rename) {
        throw new Error('electronAPI not available');
      }
      await window.electronAPI.fs.rename(oldPath, newPath);
      return newPath;
    };
  }

  if (environment === environments.CORDOVA) {
    return async (oldPath, newPath) => {
      const [parent, name] = splitUrl(newPath);
      const toDirectory = await resolveFileSystemUrl(parent);
      const fromDirectory = await resolveFileSystemUrl(oldPath);
      return new Promise((resolve, reject) =>
        fromDirectory.moveTo(toDirectory, name, resolve, reject),
      );
    };
  }

  throw new Error(`rename() not available on platform ${environment}`);
});

/**
 * Remove a directory recursively.
 * In Electron, uses secure IPC with safety checks.
 */
const removeDirectory = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async (targetPath) => {
      if (!isElectron() || !window.electronAPI?.fs?.rmdir) {
        throw new Error('electronAPI not available');
      }

      // Safety check: only allow removal of paths within safe directories
      const safeDirectories = [await userDataPath(), await tempDataPath()];

      const isSafe = safeDirectories.some((safePath) =>
        targetPath.includes(safePath),
      );
      if (!isSafe) {
        throw new Error(
          'Attempted to remove path outside of safe directories!',
        );
      }

      await window.electronAPI.fs.rmdir(targetPath);
      return targetPath;
    };
  }

  if (environment === environments.CORDOVA) {
    const removeRecursively = (directoryEntry) =>
      new Promise((resolve, reject) => {
        directoryEntry.removeRecursively(resolve, reject);
      });

    const ignoreMissingEntry = (e) =>
      e.code === FileError.NOT_FOUND_ERR
        ? Promise.resolve()
        : Promise.reject(e);

    return (targetUrl) =>
      resolveFileSystemUrl(targetUrl)
        .then(removeRecursively)
        .catch(ignoreMissingEntry);
  }

  throw new Error(`removeDirectory() not available on platform ${environment}`);
});

/**
 * Write a stream to a file.
 * In Electron, uses secure IPC (collects stream data and writes as single file).
 */
const writeStream = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return (destination, stream) =>
      new Promise((resolve, reject) => {
        if (!isElectron() || !window.electronAPI?.fs?.writeFile) {
          reject(new Error('electronAPI not available'));
          return;
        }

        const chunks = [];
        stream
          .on('data', (chunk) => {
            chunks.push(chunk);
          })
          .on('error', reject)
          .on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
              const base64Data = buffer.toString('base64');
              await window.electronAPI.fs.writeFile(destination, base64Data);
              resolve(destination);
            } catch (error) {
              reject(error);
            }
          });
      });
  }

  if (environment === environments.CORDOVA) {
    return (destUrl, stream) => {
      const [baseDirectory, filename] = splitUrl(destUrl);
      return new Promise((resolve, reject) => {
        resolveFileSystemUrl(baseDirectory)
          .then((directoryEntry) => newFile(directoryEntry, filename))
          .then(makeFileWriter)
          .then((fileWriter) => {
            let bufferedChunkBytes = new Uint8Array();
            let previousFileWriterLength = 0;
            let reachedEndOfInputStream = false;

            const handleError = (err) => {
              if (stream) {
                stream.pause();
              }
              if (fileWriter && fileWriter.readyState === FileWriter.WRITING) {
                fileWriter.abort();
              }
              reject(err);
            };

            const writeChunk = (chunkByteArray) => {
              previousFileWriterLength = fileWriter.length;
              const { byteLength } = chunkByteArray;
              const data = chunkByteArray.slice(0, byteLength);
              try {
                fileWriter.write(data.buffer);
              } catch (err) {
                handleError(err);
              }
            };

            const onChunkWritten = () => {
              const bytesWritten = fileWriter.length - previousFileWriterLength;
              bufferedChunkBytes = bufferedChunkBytes.slice(bytesWritten);
              if (fileWriter.error) {
                // already handled by onerror
              } else if (bufferedChunkBytes.length) {
                writeChunk(bufferedChunkBytes);
              } else if (reachedEndOfInputStream) {
                resolve(destUrl);
              } else {
                stream.resume();
              }
            };

            const onChunkReceived = (chunkByteArray) => {
              stream.pause();
              bufferedChunkBytes = concatTypedArrays(
                bufferedChunkBytes,
                chunkByteArray,
              );
              if (fileWriter.readyState !== FileWriter.WRITING) {
                writeChunk(chunkByteArray);
              }
            };

            fileWriter.onwriteend = onChunkWritten;
            fileWriter.onerror = handleError;

            stream
              .on('error', handleError)
              .on('data', onChunkReceived)
              .on('end', () => {
                if (bufferedChunkBytes.length === 0) {
                  resolve(destUrl);
                } else {
                  reachedEndOfInputStream = true;
                }
              })
              .resume();
          });
      });
    };
  }

  throw new Error(`writeStream() not available on platform ${environment}`);
});

/**
 * Ensure a path exists, creating directories as needed.
 * In Electron, uses secure IPC.
 */
const ensurePathExists = inEnvironment((environment) => {
  if (environment === environments.ELECTRON) {
    return async (targetPath) => {
      if (!targetPath) {
        throw new Error('No path provided to ensurePathExists');
      }

      if (!isElectron() || !window.electronAPI?.fs?.mkdirp) {
        throw new Error('electronAPI not available');
      }

      await window.electronAPI.fs.mkdirp(targetPath);
    };
  }

  if (environment === environments.CORDOVA) {
    return (targetUrl, basePath = cordova.file.dataDirectory) => {
      if (!targetUrl) {
        throw new Error('No path provided to ensurePathExists');
      }

      const targetUrlWithoutBasePath = targetUrl.replace(basePath, '');

      const getNestedPaths = (pathstring) => {
        const paths = [];
        const pathParts = pathstring.split('/').filter((path) => path.length);
        pathParts.reduce((prev, curr) => {
          const next = `${prev}/${curr}`;
          paths.push(next);
          return next;
        }, '');
        return paths;
      };

      const nestedPaths = getNestedPaths(targetUrlWithoutBasePath).map(
        (path) => `${basePath}${path}`,
      );

      return inSequence(nestedPaths, createDirectory);
    };
  }

  throw new Error(
    `ensurePathExists() not available on platform ${environment}`,
  );
});

export {
  userDataPath,
  tempDataPath,
  ensurePathExists,
  rename,
  removeDirectory,
  readFile,
  resolveFileSystemUrl,
  writeFile,
  writeStream,
  inSequence,
};
