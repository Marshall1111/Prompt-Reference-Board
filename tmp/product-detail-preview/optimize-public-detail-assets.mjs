import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const assets = path.join(root, 'public', 'product', 'acrylic-magnet', 'detail', 'assets');

const targets = [
  ['product-front-transparent.png', 'product-front.webp', 720, 82],
  ['product-on-fridge.png', 'product-on-fridge.webp', 760, 78],
  ['product-on-bag.png', 'product-on-bag.webp', 760, 78]
];

for (const [source, target, width, quality] of targets) {
  await sharp(path.join(assets, source))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, alphaQuality: 85, smartSubsample: true })
    .toFile(path.join(assets, target));
}
