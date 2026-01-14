import path from 'path';
import { app, protocol } from 'electron';
import fs from 'fs';

const userDataPath = app.getPath('userData');
const appPath = app.getAppPath();

// default to asset from factory protocol (with same name) first
export const registerProtocol = () => protocol.registerFileProtocol('asset', (request, callback) => {
  const file = request.url.substr(8);
  const decodedPath = decodeURIComponent(file);
  const appFilePath = path.normalize(path.join(appPath, 'protocols', decodedPath));
  const userDataFilePath = path.normalize(path.join(userDataPath, 'protocols', decodedPath));

  fs.access(appFilePath, fs.constants.R_OK, (err) => {
    const filePath = err ? userDataFilePath : appFilePath;
    callback({ path: filePath });
  });
});
