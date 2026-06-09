const VERSION_SPECS = [
  { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7, alignmentCenter: null },
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, alignmentCenter: 18 },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, alignmentCenter: 22 },
  { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, alignmentCenter: 26 }
];

const GF_EXP = new Array(512).fill(0);
const GF_LOG = new Array(256).fill(0);

let gfReady = false;

function ensureGaloisTables() {
  if (gfReady) return;
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value;
    GF_LOG[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < GF_EXP.length; index += 1) {
    GF_EXP[index] = GF_EXP[index - 255];
  }
  gfReady = true;
}

function gfMultiply(left, right) {
  if (!left || !right) return 0;
  ensureGaloisTables();
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function getVersionSpec(textBytes) {
  for (const spec of VERSION_SPECS) {
    if (createDataCodewords(textBytes, spec.version, spec.dataCodewords)) {
      return spec;
    }
  }
  throw new Error("商户二维码链接过长，当前本地二维码实现暂不支持。");
}

function createDataCodewords(textBytes, version, dataCodewords) {
  const countBits = version <= 9 ? 8 : 16;
  const capacity = dataCodewords * 8;
  const requiredBits = 4 + countBits + textBytes.length * 8;
  if (requiredBits > capacity) return null;

  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, textBytes.length, countBits);
  textBytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      value = (value << 1) | bits[index + offset];
    }
    codewords.push(value);
  }

  const padBytes = [0xec, 0x11];
  while (codewords.length < dataCodewords) {
    codewords.push(padBytes[codewords.length % 2]);
  }
  return codewords;
}

function appendBits(target, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    target.push((value >>> index) & 1);
  }
}

function buildGeneratorPolynomial(degree) {
  let generator = [1];
  ensureGaloisTables();

  for (let index = 0; index < degree; index += 1) {
    const factor = GF_EXP[index];
    const next = new Array(generator.length + 1).fill(0);
    for (let offset = 0; offset < generator.length; offset += 1) {
      next[offset] ^= generator[offset];
      next[offset + 1] ^= gfMultiply(generator[offset], factor);
    }
    generator = next;
  }

  return generator;
}

function createErrorCorrectionCodewords(dataCodewords, eccCodewords) {
  const generator = buildGeneratorPolynomial(eccCodewords);
  const message = dataCodewords.concat(new Array(eccCodewords).fill(0));

  for (let index = 0; index < dataCodewords.length; index += 1) {
    const factor = message[index];
    if (!factor) continue;
    for (let offset = 0; offset < generator.length; offset += 1) {
      message[index + offset] ^= gfMultiply(generator[offset], factor);
    }
  }

  return message.slice(-eccCodewords);
}

function createMatrix(spec, codewords) {
  const size = spec.size;
  const modules = Array.from({ length: size }, () => Array(size).fill(null));
  const functionModules = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunctionModule(x, y, value) {
    modules[y][x] = Boolean(value);
    functionModules[y][x] = true;
  }

  function drawFinder(x, y) {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const isBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const isCenter = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        setFunctionModule(xx, yy, dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (isBorder || isCenter));
      }
    }
  }

  function drawAlignment(centerX, centerY) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const isBorder = Math.max(Math.abs(dx), Math.abs(dy)) === 2;
        const isCenter = dx === 0 && dy === 0;
        setFunctionModule(centerX + dx, centerY + dy, isBorder || isCenter);
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);

  for (let index = 8; index < size - 8; index += 1) {
    const isDark = index % 2 === 0;
    setFunctionModule(6, index, isDark);
    setFunctionModule(index, 6, isDark);
  }

  if (spec.alignmentCenter) {
    drawAlignment(spec.alignmentCenter, spec.alignmentCenter);
  }

  for (let index = 0; index < 8; index += 1) {
    if (index !== 6) {
      setFunctionModule(8, index, false);
      setFunctionModule(index, 8, false);
    }
    setFunctionModule(size - 1 - index, 8, false);
    if (index < 7) setFunctionModule(8, size - 1 - index, false);
  }
  setFunctionModule(8, size - 8, true);

  const bitBuffer = [];
  codewords.forEach((codeword) => appendBits(bitBuffer, codeword, 8));

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let verticalOffset = 0; verticalOffset < size; verticalOffset += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - verticalOffset : verticalOffset;
      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const x = right - columnOffset;
        if (functionModules[y][x]) continue;
        modules[y][x] = bitIndex < bitBuffer.length ? bitBuffer[bitIndex] === 1 : false;
        bitIndex += 1;
      }
    }
  }

  return { modules, functionModules };
}

function getMaskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
    case 7: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
    default: return false;
  }
}

function applyMask(matrix, mask) {
  const size = matrix.modules.length;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix.functionModules[y][x]) continue;
      if (getMaskBit(mask, x, y)) matrix.modules[y][x] = !matrix.modules[y][x];
    }
  }
}

function calculateFormatBits(mask) {
  const data = (1 << 3) | mask;
  let bits = data << 10;
  for (let index = 14; index >= 10; index -= 1) {
    if (((bits >>> index) & 1) !== 0) bits ^= 0x537 << (index - 10);
  }
  return ((data << 10) | bits) ^ 0x5412;
}

function drawFormatBits(matrix, mask) {
  const size = matrix.modules.length;
  const bits = calculateFormatBits(mask);
  const setBit = (x, y, index) => {
    matrix.modules[y][x] = ((bits >>> index) & 1) === 1;
    matrix.functionModules[y][x] = true;
  };

  for (let index = 0; index <= 5; index += 1) setBit(8, index, index);
  setBit(8, 7, 6);
  setBit(8, 8, 7);
  setBit(7, 8, 8);
  for (let index = 9; index < 15; index += 1) setBit(14 - index, 8, index);

  for (let index = 0; index < 8; index += 1) setBit(size - 1 - index, 8, index);
  for (let index = 8; index < 15; index += 1) setBit(8, size - 15 + index, index);
  matrix.modules[size - 8][8] = true;
  matrix.functionModules[size - 8][8] = true;
}

function evaluatePenalty(matrix) {
  const size = matrix.modules.length;
  let penalty = 0;

  const evaluateRuns = (getter) => {
    for (let major = 0; major < size; major += 1) {
      let runColor = getter(major, 0);
      let runLength = 1;
      for (let minor = 1; minor < size; minor += 1) {
        const color = getter(major, minor);
        if (color === runColor) {
          runLength += 1;
          continue;
        }
        if (runLength >= 5) penalty += 3 + (runLength - 5);
        runColor = color;
        runLength = 1;
      }
      if (runLength >= 5) penalty += 3 + (runLength - 5);
    }
  };

  evaluateRuns((row, column) => matrix.modules[row][column]);
  evaluateRuns((column, row) => matrix.modules[row][column]);

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix.modules[y][x];
      if (
        color === matrix.modules[y][x + 1] &&
        color === matrix.modules[y + 1][x] &&
        color === matrix.modules[y + 1][x + 1]
      ) {
        penalty += 3;
      }
    }
  }

  const evaluateFinderLike = (getter) => {
    const pattern = [true, false, true, true, true, false, true, false, false, false, false];
    const reversePattern = [...pattern].reverse();
    for (let major = 0; major < size; major += 1) {
      for (let minor = 0; minor <= size - 11; minor += 1) {
        const slice = Array.from({ length: 11 }, (_, index) => getter(major, minor + index));
        if (matchesPattern(slice, pattern) || matchesPattern(slice, reversePattern)) penalty += 40;
      }
    }
  };

  evaluateFinderLike((row, column) => matrix.modules[row][column]);
  evaluateFinderLike((column, row) => matrix.modules[row][column]);

  let darkCount = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (matrix.modules[y][x]) darkCount += 1;
    }
  }
  const totalModules = size * size;
  const percent = (darkCount * 100) / totalModules;
  penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return penalty;
}

function matchesPattern(values, expected) {
  for (let index = 0; index < expected.length; index += 1) {
    if (values[index] !== expected[index]) return false;
  }
  return true;
}

function renderSvg(matrix, options = {}) {
  const margin = Math.max(0, Number(options.margin ?? 4));
  const dark = options.dark || "#111827";
  const light = options.light || "#ffffff";
  const size = matrix.length;
  const viewBoxSize = size + margin * 2;
  const path = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!matrix[y][x]) continue;
      path.push(`M${x + margin},${y + margin}h1v1h-1z`);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${light}"/>`,
    `<path d="${path.join(" ")}" fill="${dark}"/>`,
    "</svg>"
  ].join("");
}

export function createQrSvgMarkup(text, options = {}) {
  const bytes = Array.from(new TextEncoder().encode(String(text || "")));
  const spec = getVersionSpec(bytes);
  const dataCodewords = createDataCodewords(bytes, spec.version, spec.dataCodewords);
  const eccCodewords = createErrorCorrectionCodewords(dataCodewords, spec.eccCodewords);
  const baseMatrix = createMatrix(spec, dataCodewords.concat(eccCodewords));

  let bestSvg = "";
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const working = {
      modules: baseMatrix.modules.map((row) => row.slice()),
      functionModules: baseMatrix.functionModules.map((row) => row.slice())
    };
    applyMask(working, mask);
    drawFormatBits(working, mask);
    const penalty = evaluatePenalty(working);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestSvg = renderSvg(working.modules, options);
    }
  }

  return bestSvg;
}

export function createQrSvgDataUrl(text, options = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createQrSvgMarkup(text, options))}`;
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function downloadQrSvg(text, filename, options = {}) {
  const blob = new Blob([createQrSvgMarkup(text, options)], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export async function downloadQrPng(text, filename, options = {}) {
  const svgMarkup = createQrSvgMarkup(text, options);
  const size = Math.max(256, Number(options.pixelSize || 768));
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = options.light || "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("导出二维码 PNG 失败。"));
      }, "image/png");
    });
    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("二维码图片加载失败。"));
    image.src = src;
  });
}
