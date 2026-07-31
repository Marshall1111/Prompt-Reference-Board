import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(root, 'assets');
const W = 1440;
const H = 3350;
const svg = (content, width, height) => Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:'Microsoft YaHei','Segoe UI',sans-serif}.serif{font-family:'SimSun','Microsoft YaHei',serif}.small{font-size:16px;font-weight:700;letter-spacing:3px}.title{font-size:78px;font-weight:900}.sub{font-size:22px;fill:#625e55}.section{font-size:48px;font-weight:900}.body{font-size:18px;fill:#6d625a}</style>${content}</svg>`);
const cover = (file, width, height) => sharp(path.join(assets, file)).resize(width, height, { fit: 'cover', position: 'centre' }).png().toBuffer();
const contain = (file, width, height) => sharp(path.join(assets, file)).resize(width, height, { fit: 'contain' }).png().toBuffer();

const [front, fridgeHero, fridgeUse, lanyard] = await Promise.all([
  contain('product-front.png', 570, 780),
  cover('product-on-fridge.png', 430, 645),
  cover('product-on-fridge.png', 715, 685),
  contain('product-lanyard.png', 420, 545),
]);

const sizePanel = svg(`<rect width="500" height="425" fill="#eadcce"/><text x="42" y="65" class="small">02</text><text x="42" y="145" class="serif section">迷你尺寸，</text><text x="42" y="203" class="serif section" fill="#f57a45">刚好点亮一角</text><text x="42" y="263" class="body">6 cm × 9 cm，小巧不占空间；</text><text x="42" y="294" class="body">贴在冰箱、金属柜门上都恰到好处。</text><rect x="267" y="150" width="155" height="236" rx="16" fill="#eff7f8" stroke="#fffaf0" stroke-width="8"/><rect x="284" y="168" width="121" height="200" rx="8" fill="none" stroke="#837c72" stroke-opacity=".42"/><circle cx="285" cy="168" r="11" fill="#c19a58"/><circle cx="404" cy="168" r="11" fill="#c19a58"/><circle cx="285" cy="368" r="11" fill="#c19a58"/><circle cx="404" cy="368" r="11" fill="#c19a58"/><line x1="267" y1="120" x2="422" y2="120" stroke="#202019"/><line x1="267" y1="116" x2="267" y2="125" stroke="#202019"/><line x1="422" y1="116" x2="422" y2="125" stroke="#202019"/><text x="345" y="108" text-anchor="middle" font-size="17" font-weight="700">6 cm</text><line x1="452" y1="150" x2="452" y2="386" stroke="#202019"/><text x="474" y="266" font-size="17" font-weight="700" transform="rotate(90 474 266)">9 cm</text>`, 500, 425);
const benefitPanel = svg(`<rect width="500" height="335" fill="#f6d2b9"/><text x="42" y="65" class="small">03</text><text x="42" y="132" class="serif" font-size="39" font-weight="900">小小一贴，</text><text x="42" y="180" class="serif" font-size="39" font-weight="900">每天都想看见</text><text x="42" y="220" class="body">四角细节稳稳固定画面，透明外观不抢走作品光彩。</text><line x1="42" y1="262" x2="458" y2="262" stroke="#202019" stroke-opacity=".25"/><text x="42" y="290" fill="#f57a45" font-size="12" font-weight="700">01</text><text x="42" y="316" font-size="15">清透展示</text><text x="190" y="290" fill="#f57a45" font-size="12" font-weight="700">02</text><text x="190" y="316" font-size="15">四角固定</text><text x="337" y="290" fill="#f57a45" font-size="12" font-weight="700">03</text><text x="337" y="316" font-size="15">轻巧不占位</text>`, 500, 335);

await sharp({ create: { width: W, height: H, channels: 4, background: '#f7f3eb' } })
  .composite([
    { input: svg(`<rect width="1440" height="920" fill="#f8f5ee"/><circle cx="1095" cy="420" r="335" fill="#f0dfca"/><text x="136" y="155" class="small">FRIDGE MOMENT FRAME</text><text x="136" y="286" class="serif title">把喜欢的瞬间，</text><text x="136" y="375" class="serif title" fill="#f57a45">贴进日常。</text><text x="138" y="451" class="sub">一枚小小的冰箱贴画框，把手绘、照片</text><text x="138" y="486" class="sub">和今天的好心情，留在每天都会看到的地方。</text><rect x="138" y="545" width="174" height="38" rx="19" fill="none" stroke="#202019" stroke-opacity=".25"/><text x="159" y="570" font-size="15">6 × 9 cm 轻巧尺寸</text><rect x="327" y="545" width="138" height="38" rx="19" fill="none" stroke="#202019" stroke-opacity=".25"/><text x="349" y="570" font-size="15">冰箱贴设计</text><text x="138" y="675" font-size="18" font-weight="700">探索细节 ↓</text><text x="1160" y="638" fill="#285bd6" font-size="23" font-weight="700" transform="rotate(-12 1160 638)">MAKE HOME</text><text x="1190" y="667" fill="#285bd6" font-size="23" font-weight="700" transform="rotate(-12 1190 667)">HAPPIER</text>`, W, 920), left: 0, top: 0 },
    { input: fridgeHero, left: 785, top: 83 },
    { input: svg(`<rect width="1440" height="260" fill="#f57a45"/><text x="720" y="98" text-anchor="middle" class="serif" font-size="42" fill="#fff8ed">把喜欢贴在冰箱上，</text><text x="720" y="160" text-anchor="middle" class="serif" font-size="46" font-weight="900" fill="#202019">让日常多一点好心情。</text><text x="170" y="88" fill="#f9d433" font-size="76">✦</text><text x="1210" y="175" fill="#e93463" font-size="88">♥</text>`, W, 260), left: 0, top: 920 },
    { input: svg(`<rect width="710" height="780" fill="#eadcce"/>`, 710, 780), left: 70, top: 1250 },
    { input: front, left: 140, top: 1268, blend: 'multiply' },
    { input: svg(`<text x="112" y="1874" class="small">01</text><text x="112" y="1933" class="serif" font-size="42" font-weight="900">透明外框，</text><text x="112" y="1986" class="serif" font-size="42" font-weight="900">让画成为主角</text><text x="112" y="2020" class="body">清透边框衬托画面本身，轻轻一贴，</text><text x="112" y="2048" class="body">就把心爱的作品留在眼前。</text>`, W, H), left: 0, top: 0 },
    { input: sizePanel, left: 850, top: 1250 },
    { input: benefitPanel, left: 850, top: 1695 },
    { input: svg(`<rect width="1440" height="1110" fill="#202019"/><text x="720" y="100" text-anchor="middle" class="small" fill="#fff8ed">MADE FOR YOUR FRIDGE</text><text x="720" y="178" text-anchor="middle" class="serif" font-size="48" font-weight="900" fill="#fff8ed">贴在冰箱上，每天打开都是好心情。</text><rect x="845" y="260" width="510" height="590" fill="#ede4d5"/>`, W, 1110), left: 0, top: 2120 },
    { input: fridgeUse, left: 70, top: 2380 },
    { input: lanyard, left: 890, top: 2820, blend: 'multiply' },
    { input: svg(`<text x="95" y="3020" class="small" fill="white">贴近生活</text><text x="95" y="3070" class="serif" font-size="31" font-weight="900" fill="white">冰箱上的专属小画展</text><text x="875" y="3048" class="small" fill="#51463c">透明展示</text><text x="875" y="3096" class="serif" font-size="29" font-weight="900" fill="#202019">画面，完整被看见</text>`, W, H), left: 0, top: 0 },
  ])
  .jpeg({ quality: 91, chromaSubsampling: '4:4:4' })
  .toFile(path.join(root, 'design-preview.jpg'));
