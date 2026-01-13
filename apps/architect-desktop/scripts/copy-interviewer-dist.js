/**
 * Copies interviewer dist to network-canvas/dist for path compatibility.
 * The preview window expects files at network-canvas/dist/ but interviewer
 * is now a sibling app.
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../../interviewer/dist');
const dest = path.resolve(__dirname, '../network-canvas/dist');

function copyRecursive(source, target) {
  if (!fs.existsSync(source)) {
    console.log(`Source does not exist: ${source}`);
    return;
  }

  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const items = fs.readdirSync(source);
  for (const item of items) {
    const srcPath = path.join(source, item);
    const destPath = path.join(target, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(src)) {
  copyRecursive(src, dest);
  console.log('Copied interviewer/dist to network-canvas/dist');
} else {
  console.log('Interviewer dist not found - skipping copy');
}
