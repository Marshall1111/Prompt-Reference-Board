import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rm, stat } from "node:fs/promises";
import sharp from "sharp";

const FPS = 30;
const SAMPLE_RATE = 22050;
const MAX_SOURCE_EDGE = 2400;
const ZOOM_SUPERSAMPLE = 4;
const FFMPEG_MISSING_MESSAGE = "服务器未找到 ffmpeg：请安装 ffmpeg（apt install -y ffmpeg），或在 .env 配置 FFMPEG_PATH";
let activeEncoder = null;

function emit(line) {
  process.stdout.write(`${line}\n`);
}

function reportProgress(value) {
  emit(`PROGRESS ${Math.max(0, Math.min(99, Math.round(value)))}`);
}

function message(text) {
  emit(`MESSAGE ${text}`);
}

function fail(text) {
  emit(`ERROR ${text}`);
  process.exitCode = 1;
}

function runFfmpeg(args, { collect = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, { stdio: ["ignore", collect ? "pipe" : "ignore", "pipe"] });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    if (collect) {
      child.stdout.on("data", (chunk) => {
        stdout = Buffer.concat([stdout, chunk]);
      });
    }
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (error) => reject(error?.code === "ENOENT" ? new Error(FFMPEG_MISSING_MESSAGE) : error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`));
    });
  });
}

async function detectAudioStart(bgmPath) {
  try {
    const { stdout } = await runFfmpeg([
      "-v", "error",
      "-i", bgmPath,
      "-t", "3",
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "f32le",
      "-"
    ], { collect: true });
    const total = Math.floor(stdout.length / 4);
    if (total < 1024) return 0.04;
    const samples = new Float32Array(stdout.buffer, stdout.byteOffset, total);
    const windowSize = 512;
    const hop = 128;
    const frames = [];
    for (let start = 0; start + windowSize <= total; start += hop) {
      let sum = 0;
      for (let index = start; index < start + windowSize; index += 1) {
        sum += samples[index] * samples[index];
      }
      frames.push(Math.sqrt(sum / windowSize));
    }
    if (!frames.length) return 0.04;
    const logs = frames.map((value) => Math.log(value + 1e-9));
    const diffs = logs.map((value, index) => (index === 0 ? 0 : Math.max(0, value - logs[index - 1])));
    const max = Math.max(...diffs);
    if (!Number.isFinite(max) || max <= 0.05) return 0.04;
    const threshold = max * 0.5;
    for (let index = 2; index < diffs.length - 1; index += 1) {
      if (diffs[index] >= threshold && diffs[index] >= diffs[index - 1] && diffs[index] >= diffs[index + 1]) {
        const seconds = (index * hop + windowSize / 2) / SAMPLE_RATE - 0.03;
        return Math.max(0, seconds);
      }
    }
    return 0.04;
  } catch (error) {
    return 0.04;
  }
}

function orientedSize(metadata) {
  const orientation = Number(metadata.orientation || 1);
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (orientation >= 5 && orientation <= 8) return { width: height, height: width };
  return { width, height };
}

async function loadRawImage(inputPath) {
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = orientedSize(metadata);
  if (!width || !height) throw new Error(`无法读取图片尺寸：${path.basename(inputPath)}`);
  const { data, info } = await sharp(inputPath)
    .rotate()
    .resize({ width: MAX_SOURCE_EDGE, height: MAX_SOURCE_EDGE, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function renderFrame(raw, canvasWidth, canvasHeight, scale) {
  const fit = Math.min(canvasWidth / raw.width, canvasHeight / raw.height);
  const targetWidth = Math.max(1, Math.round(raw.width * fit * scale));
  const targetHeight = Math.max(1, Math.round(raw.height * fit * scale));
  let pipeline = sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels }
  }).resize({ width: targetWidth, height: targetHeight, fit: "fill" });

  const cropWidth = Math.min(targetWidth, canvasWidth);
  const cropHeight = Math.min(targetHeight, canvasHeight);
  if (targetWidth > canvasWidth || targetHeight > canvasHeight) {
    pipeline = pipeline.extract({
      left: Math.floor((targetWidth - cropWidth) / 2),
      top: Math.floor((targetHeight - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight
    });
  }
  const resized = await pipeline
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // composite 会给画布补 alpha 通道，必须显式去掉，否则输出的帧比 rgb24 多一个通道，
  // 写进 ffmpeg 后会整体错位并提前结束。
  const frame = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
    .composite([{
      input: resized.data,
      raw: {
        width: resized.info.width,
        height: resized.info.height,
        channels: resized.info.channels
      },
      left: Math.floor((canvasWidth - cropWidth) / 2),
      top: Math.floor((canvasHeight - cropHeight) / 2)
    }])
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer();

  const expected = canvasWidth * canvasHeight * 3;
  if (frame.length !== expected) {
    throw new Error(`帧尺寸不匹配：${frame.length}，应为 ${expected}`);
  }
  return frame;
}

function buildZoomFilter({ canvasWidth, canvasHeight, frames, zoom }) {
  // 4 倍超采样在默认 1080×1620 下约 28MP；更大画布时自动降倍，避免 ffmpeg 占用过多内存。
  const maxSourcePixels = 28000000;
  const supersample = Math.max(1, Math.min(ZOOM_SUPERSAMPLE, Math.floor(Math.sqrt(maxSourcePixels / (canvasWidth * canvasHeight)))));
  const sourceWidth = canvasWidth * supersample;
  const sourceHeight = canvasHeight * supersample;
  const last = Math.max(1, frames - 1);
  const progress = `(on/${last})`;
  const eased = `(3*${progress}*${progress}-2*${progress}*${progress}*${progress})`;
  return [
    `scale=${sourceWidth}:${sourceHeight}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${sourceWidth}:${sourceHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `zoompan=z='1+${zoom}*${eased}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${canvasWidth}x${canvasHeight}:fps=${FPS}`,
    "format=rgb24"
  ].join(",");
}

// zoompan 的裁剪坐标是整数像素，1080 宽画布上 4% 的慢速推进每帧只移动 1~2px，
// 直接逐帧缩放会看到台阶。先把源图放大 4 倍再做 zoompan，把位移精度提高到 0.25px，
// 最后由 zoompan 缩回画布尺寸，推进就连续了。
function streamZoomFrames(filePath, { frames, canvasWidth, canvasHeight, zoom, onFrame }) {
  const frameSize = canvasWidth * canvasHeight * 3;
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
      "-y", "-v", "error",
      "-i", filePath,
      "-vf", buildZoomFilter({ canvasWidth, canvasHeight, frames, zoom }),
      "-frames:v", String(frames),
      "-f", "rawvideo",
      "-pix_fmt", "rgb24",
      "-"
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    let pendingBuffer = null;
    let filled = 0;
    let delivered = 0;
    let settled = false;
    let writeChain = Promise.resolve();

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.stdout.on("data", (chunk) => {
      let position = 0;
      while (position < chunk.length) {
        if (!pendingBuffer) pendingBuffer = Buffer.allocUnsafe(frameSize);
        const take = Math.min(frameSize - filled, chunk.length - position);
        chunk.copy(pendingBuffer, filled, position, position + take);
        filled += take;
        position += take;
        if (filled === frameSize) {
          const frame = pendingBuffer;
          pendingBuffer = null;
          filled = 0;
          delivered += 1;
          child.stdout.pause();
          writeChain = writeChain
            .then(() => onFrame(frame))
            .then(() => {
              child.stdout.resume();
            }, (error) => {
              child.kill("SIGKILL");
              finish(error);
            });
        }
      }
    });
    child.on("error", (error) => {
      finish(error?.code === "ENOENT" ? new Error(FFMPEG_MISSING_MESSAGE) : error);
    });
    child.on("close", (code) => {
      writeChain.then(() => {
        if (code !== 0) finish(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`));
        else if (delivered !== frames) finish(new Error(`缩放帧数不足：${delivered}/${frames}`));
        else finish(null);
      }, () => {});
    });
  });
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    fail("缺少渲染输入参数。");
    return;
  }
  const input = JSON.parse(await readFile(inputPath, "utf-8"));
  const pairs = Array.isArray(input.pairs) ? input.pairs : [];
  const params = input.params || {};
  const canvasWidth = Math.max(2, Math.trunc(Number(params.width) || 1080));
  const canvasHeight = Math.max(2, Math.trunc(Number(params.height) || 1620));
  const framesPer = Math.max(1, Math.trunc(Number(params.framesPer) || 24));
  const endFrames = Math.max(1, Math.trunc(Number(params.endFrames) || 92));
  const zoom = Math.max(0, Number(params.zoom) || 0);
  const rawCoverSeconds = Number(params.coverSeconds);
  const coverSeconds = Number.isFinite(rawCoverSeconds) && rawCoverSeconds >= 0 ? rawCoverSeconds : 2;
  const coverFrames = input.coverPath ? Math.min(Math.round(coverSeconds * FPS), endFrames) : 0;
  const endPageFrames = Math.max(0, endFrames - coverFrames);

  if (pairs.length !== 6) {
    fail(`需要 6 组素材，当前 ${pairs.length} 组。`);
    return;
  }

  const totalFrames = pairs.length * framesPer * 2 + endFrames;
  const totalSeconds = totalFrames / FPS;
  const tempAudioPath = path.join(path.dirname(input.outputPath), "_audio_tmp.wav");

  message("分析音频起点");
  const audioStart = await detectAudioStart(input.bgmPath);

  try {
    message("准备音轨");
    await runFfmpeg([
      "-y",
      "-v", "error",
      "-i", input.bgmPath,
      "-vn",
      "-af", `atrim=start=${audioStart.toFixed(3)},asetpts=PTS-STARTPTS,apad=whole_dur=${totalSeconds.toFixed(3)}`,
      "-ac", "2",
      "-ar", "44100",
      "-c:a", "pcm_s16le",
      tempAudioPath
    ]);
    reportProgress(4);

    const encoder = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
      "-y",
      "-v", "error",
      "-f", "rawvideo",
      "-pixel_format", "rgb24",
      "-video_size", `${canvasWidth}x${canvasHeight}`,
      "-framerate", String(FPS),
      "-i", "-",
      "-i", tempAudioPath,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-profile:v", "high",
      "-level", "4.1",
      "-r", String(FPS),
      "-g", String(FPS * 2),
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-shortest",
      "-movflags", "+faststart",
      input.outputPath
    ], { stdio: ["pipe", "ignore", "pipe"] });
    activeEncoder = encoder;

    let encoderError = "";
    encoder.stderr.setEncoding("utf-8");
    encoder.stderr.on("data", (chunk) => {
      encoderError = (encoderError + chunk).slice(-4000);
    });
    encoder.on("error", (error) => {
      encoderError = error?.code === "ENOENT"
        ? FFMPEG_MISSING_MESSAGE
        : `ffmpeg 启动失败：${error?.message || error}`;
    });
    const encoderClosed = new Promise((resolve, reject) => {
      encoder.on("error", (error) => reject(new Error(encoderError.trim() || error?.message || "ffmpeg 启动失败")));
      encoder.on("close", (code) => {
        if (process.env.VW_DEBUG) emit(`ENCODER_CLOSE ${code}`);
        if (code === 0) resolve();
        else reject(new Error(encoderError.trim() || `ffmpeg 退出码 ${code}`));
      });
    });

    let written = 0;
    const writeFrame = async (frame) => {
      if (process.env.VW_DEBUG) emit(`FRAME ${written} ${frame.length}`);
      if (!encoder.stdin.write(frame)) {
        await once(encoder.stdin, "drain");
      }
      written += 1;
    };

    let cachedPath = "";
    let cachedRaw = null;
    const getRaw = async (filePath) => {
      if (cachedPath !== filePath) {
        cachedRaw = await loadRawImage(filePath);
        cachedPath = filePath;
      }
      return cachedRaw;
    };

    try {
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
        const pair = pairs[pairIndex];
        message(`渲染第 ${pairIndex + 1}/6 组`);
        await streamZoomFrames(pair.before, {
          frames: framesPer,
          canvasWidth,
          canvasHeight,
          zoom,
          onFrame: async (frame) => {
            await writeFrame(frame);
            reportProgress(4 + 72 * (written / totalFrames));
          }
        });

        const after = await getRaw(pair.after);
        const afterFrame = await renderFrame(after, canvasWidth, canvasHeight, 1);
        for (let frameIndex = 0; frameIndex < framesPer; frameIndex += 1) {
          await writeFrame(afterFrame);
          reportProgress(4 + 72 * (written / totalFrames));
        }
      }

      if (coverFrames > 0) {
        message("渲染结尾页封面");
        await streamZoomFrames(input.coverPath, {
          frames: coverFrames,
          canvasWidth,
          canvasHeight,
          zoom,
          onFrame: async (frame) => {
            await writeFrame(frame);
            reportProgress(4 + 72 * (written / totalFrames));
          }
        });
      }

      if (endPageFrames > 0) {
        message("渲染结尾页");
        const endPage = await getRaw(input.endPagePath);
        const endFrame = await renderFrame(endPage, canvasWidth, canvasHeight, 1);
        for (let frameIndex = 0; frameIndex < endPageFrames; frameIndex += 1) {
          await writeFrame(endFrame);
          reportProgress(4 + 72 * (written / totalFrames));
        }
      }

      encoder.stdin.end();
      await encoderClosed;
      activeEncoder = null;
    } catch (error) {
      if (encoderError.trim()) throw new Error(encoderError.trim());
      if (error?.code === "ENOENT") throw new Error(FFMPEG_MISSING_MESSAGE);
      throw error;
    }
    reportProgress(99);

    const info = await stat(input.outputPath);
    if (!info.size) {
      fail("成片文件为空。");
      return;
    }
    emit(`DONE ${info.size}`);
  } finally {
    await rm(tempAudioPath, { force: true }).catch(() => {});
  }
}

main().catch((error) => {
  if (activeEncoder) {
    activeEncoder.kill("SIGKILL");
    activeEncoder = null;
  }
  fail(String(error?.message || error));
});
