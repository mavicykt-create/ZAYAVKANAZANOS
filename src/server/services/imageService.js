import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { config } from '../config.js';

const imageCacheDir = path.join(config.dbDir, `image-cache-${config.imageCacheVersion}`);
fs.mkdirSync(imageCacheDir, { recursive: true });

function imageHash(url) {
  const key = `${config.imageCacheVersion}|${config.imageWidth}|${config.imageQuality}|${url}`;
  return crypto.createHash('sha1').update(key).digest('hex');
}

export function getImageCacheDir() {
  return imageCacheDir;
}

export function cacheFileNameForUrl(url) {
  return `${imageHash(url)}.webp`;
}

export function cacheWebPath(fileName) {
  return `/image-cache/${fileName}`;
}

export async function ensureCompressedImage(url) {
  if (!url) return '';
  const fileName = cacheFileNameForUrl(url);
  const fullPath = path.join(imageCacheDir, fileName);
  if (fs.existsSync(fullPath)) return fileName;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'zan-1.1/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    const inputBuffer = Buffer.from(await response.arrayBuffer());
    const outputBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: config.imageWidth,
        height: config.imageWidth,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: config.imageQuality, effort: 5 })
      .toBuffer();
    fs.writeFileSync(fullPath, outputBuffer);
    return fileName;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export function clearImageCache() {
  if (!fs.existsSync(imageCacheDir)) return 0;
  const entries = fs.readdirSync(imageCacheDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    const entryPath = path.join(imageCacheDir, entry.name);
    if (entry.isDirectory()) fs.rmSync(entryPath, { recursive: true, force: true });
    else fs.unlinkSync(entryPath);
    removed += 1;
  }
  return removed;
}

export async function preCompressImages(urls, onProgress) {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return;
  const queue = unique.slice();
  const workers = [];
  let done = 0;
  const workerCount = Math.min(6, queue.length);

  async function worker() {
    while (queue.length > 0) {
      const nextUrl = queue.shift();
      if (!nextUrl) continue;
      await ensureCompressedImage(nextUrl);
      done += 1;
      if (onProgress) onProgress(done, unique.length);
    }
  }

  for (let i = 0; i < workerCount; i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
}
