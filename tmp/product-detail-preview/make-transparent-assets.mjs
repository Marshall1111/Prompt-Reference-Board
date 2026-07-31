import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, 'assets');

async function removeWhiteBackground(source, target) {
  const sourcePath = path.join(assets, source);
  const metadata = await sharp(sourcePath).metadata();
  const input = sharp(sourcePath)
    .extract({ left: 8, top: 0, width: metadata.width - 16, height: metadata.height })
    .ensureAlpha();
  const { data, info } = await input.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    const neutral = max - min < 16;
    if (neutral && min > 226) {
      data[i + 3] = Math.max(0, Math.min(255, Math.round((246 - min) * 12.75)));
    }
  }
  await sharp(data, { raw: info }).png().toFile(path.join(assets, target));
}

await removeWhiteBackground('product-front.png', 'product-front-transparent.png');
await removeWhiteBackground('product-lanyard.png', 'product-lanyard-transparent.png');
