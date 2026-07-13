import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif'];
let processed = 0;
let skipped = 0;

async function optimizeImages() {
  console.log('🖼️  Starting image optimization...\n');

  const files = await getAllFiles(publicDir);
  const imageFiles = files.filter((file) =>
    imageExtensions.includes(path.extname(file).toLowerCase()),
  );

  console.log(`Found ${imageFiles.length} images to process\n`);

  for (const file of imageFiles) {
    await optimizeImage(file);
  }

  console.log(`\n✅ Optimization complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped: ${skipped}`);
}

async function getAllFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function optimizeImage(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    const sizeBefore = stats.size;

    let optimized;

    switch (ext) {
      case '.png':
        optimized = await sharp(filePath)
          .png({ quality: 80, compressionLevel: 9, adaptiveFiltering: true })
          .toBuffer();
        break;
      case '.jpg':
      case '.jpeg':
        optimized = await sharp(filePath)
          .jpeg({ quality: 80, progressive: true, mozjpeg: true })
          .toBuffer();
        break;
      case '.gif':
        // For GIFs, we'll just re-encode them with optimized settings
        optimized = await sharp(filePath, { animated: true })
          .gif({ effort: 10 })
          .toBuffer();
        break;
      default:
        skipped++;
        return;
    }

    const sizeAfter = optimized.length;
    const reduction = (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(
      1,
    );

    fs.writeFileSync(filePath, optimized);
    processed++;

    if (reduction > 0) {
      console.log(
        `✓ ${path.relative(process.cwd(), filePath)} (${reduction}% reduction)`,
      );
    } else {
      console.log(`• ${path.relative(process.cwd(), filePath)} (no reduction)`);
    }
  } catch (error) {
    console.error(`✗ Error processing ${filePath}: ${error.message}`);
    skipped++;
  }
}

optimizeImages().catch(console.error);
