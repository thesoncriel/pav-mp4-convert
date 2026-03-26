import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { PavData } from './pavParser';

const FFMPEG_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

let cachedCoreURL: string | null = null;
let cachedWasmURL: string | null = null;

async function getFFmpegURLs() {
  if (!cachedCoreURL || !cachedWasmURL) {
    [cachedCoreURL, cachedWasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);
  }
  return { coreURL: cachedCoreURL, wasmURL: cachedWasmURL };
}

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  try {
    const urls = await getFFmpegURLs();
    await ffmpeg.load(urls);
  } catch (e) {
    ffmpeg = null;
    throw new Error(`FFmpeg 로딩 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return ffmpeg;
}

async function createFFmpegInstance(): Promise<FFmpeg> {
  const ff = new FFmpeg();
  const urls = await getFFmpegURLs();
  await ff.load(urls);
  return ff;
}

export interface ConvertOptions {
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
  /** 업스케일 배율 (1~5, 기본 2) */
  scale?: number;
  /** 화질 (1~100, 기본 55 = CRF 23) */
  quality?: number;
}

async function runConversion(
  ff: FFmpeg,
  pavData: PavData,
  options: { scale: number; quality: number; onProgress?: (p: number) => void; onLog?: (msg: string) => void },
): Promise<Blob> {
  const { onProgress, onLog, scale, quality } = options;
  const log = (msg: string) => onLog?.(msg);

  const clampedScale = Math.max(1, Math.min(5, Math.round(scale)));
  const clampedQuality = Math.max(1, Math.min(100, Math.round(quality)));
  const crf = String(Math.round(51 * (1 - (clampedQuality - 1) / 99)));

  log(`변환 시작 - ${pavData.frames.length} frames, ${pavData.fps.toFixed(1)} fps, ${clampedScale}x 업스케일, 화질 ${clampedQuality} (CRF ${crf})`);

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(Math.max(progress, 0), 1));
  };
  ff.on('progress', progressHandler);

  const logHandler = ({ message }: { message: string }) => {
    onLog?.(`[ffmpeg] ${message}`);
  };
  ff.on('log', logHandler);

  const padLen = Math.max(String(pavData.frames.length).length, 3);
  const padPattern = `frame_%0${padLen}d.jpg`;
  const filesToClean: string[] = [];

  try {
    log('JPEG 프레임 쓰기 시작...');
    for (let i = 0; i < pavData.frames.length; i++) {
      const name = `frame_${String(i).padStart(padLen, '0')}.jpg`;
      await ff.writeFile(name, pavData.frames[i]);
      filesToClean.push(name);
    }
    log(`JPEG 프레임 쓰기 완료: ${pavData.frames.length}개`);

    log(`오디오 쓰기 (audio.qcp): ${pavData.audio.length} bytes`);
    await ff.writeFile('audio.qcp', pavData.audio);
    filesToClean.push('audio.qcp');

    const fps = pavData.fps.toFixed(4);
    log('FFmpeg 인코딩 시작 (오디오 포함)...');

    const vf = clampedScale > 1
      ? ['-vf', `scale=iw*${clampedScale}:ih*${clampedScale}:flags=lanczos`]
      : [];

    let ret = await ff.exec([
      '-framerate', fps,
      '-i', padPattern,
      '-i', 'audio.qcp',
      '-c:v', 'libx264',
      '-crf', crf,
      ...vf,
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      '-y', 'output.mp4',
    ]);

    if (ret !== 0) {
      log('오디오 변환 실패, 비디오만 변환 시도...');
      ret = await ff.exec([
        '-framerate', fps,
        '-i', padPattern,
        '-c:v', 'libx264',
        '-crf', crf,
        ...vf,
        '-pix_fmt', 'yuv420p',
        '-y', 'output.mp4',
      ]);
    }

    if (ret !== 0) {
      throw new Error(`FFmpeg 변환 실패 (exit code: ${ret})`);
    }

    const outputData = await ff.readFile('output.mp4');
    filesToClean.push('output.mp4');
    log(`변환 완료! MP4 크기: ${((outputData as Uint8Array).length / 1024).toFixed(1)} KB`);

    const output = outputData as Uint8Array;
    return new Blob([output.buffer as ArrayBuffer], { type: 'video/mp4' });
  } finally {
    ff.off('progress', progressHandler);
    ff.off('log', logHandler);

    for (const name of filesToClean) {
      try { await ff.deleteFile(name); } catch { /* ignore */ }
    }
  }
}

export async function convertPavToMp4(
  pavData: PavData,
  options?: ConvertOptions
): Promise<Blob> {
  const { onProgress, onLog, scale = 2, quality = 55 } = options ?? {};
  const ff = await loadFFmpeg();
  return runConversion(ff, pavData, { scale, quality, onProgress, onLog });
}

export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 8;

export interface BatchItem {
  fileName: string;
  pavData: PavData;
}

export interface BatchConvertOptions {
  scale?: number;
  quality?: number;
  concurrency?: number;
  onProgress?: (overall: number) => void;
  onFileProgress?: (fileIndex: number, progress: number) => void;
  onLog?: (message: string) => void;
}

export interface BatchResult {
  fileName: string;
  mp4Blob: Blob;
}

export async function convertBatch(
  items: BatchItem[],
  options?: BatchConvertOptions,
): Promise<BatchResult[]> {
  const { scale = 2, quality = 55, concurrency = DEFAULT_CONCURRENCY, onProgress, onFileProgress, onLog } = options ?? {};
  const clampedConcurrency = Math.max(1, Math.min(MAX_CONCURRENCY, concurrency));
  const log = (msg: string) => onLog?.(msg);
  const total = items.length;
  const fileProgress = new Float32Array(total);
  const results: BatchResult[] = new Array(total);

  const reportOverall = () => {
    let sum = 0;
    for (let i = 0; i < total; i++) sum += fileProgress[i];
    onProgress?.(sum / total);
  };

  const effectiveConcurrency = Math.min(clampedConcurrency, total);
  log(`배치 변환 시작 - ${total}개 파일, 동시 ${effectiveConcurrency}개 처리`);

  // CDN URL 사전 캐싱
  log('FFmpeg WASM 리소스 캐싱 중...');
  await getFFmpegURLs();
  log('FFmpeg WASM 리소스 캐싱 완료!');

  // 세마포어: 파일마다 새 인스턴스를 생성하되 동시 실행 수 제한
  let running = 0;
  const waiting: (() => void)[] = [];

  function acquire(): Promise<void> {
    if (running < effectiveConcurrency) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiting.push(() => { running++; resolve(); });
    });
  }

  function release() {
    running--;
    const next = waiting.shift();
    if (next) next();
  }

  async function processFile(idx: number) {
    const item = items[idx];
    await acquire();

    log(`[${idx + 1}/${total}] ${item.fileName} 변환 시작 (인스턴스 생성 중...)`);
    let ff: FFmpeg | null = null;

    try {
      ff = await createFFmpegInstance();

      const blob = await runConversion(ff, item.pavData, {
        scale,
        quality,
        onProgress: (p) => {
          fileProgress[idx] = p;
          onFileProgress?.(idx, p);
          reportOverall();
        },
        onLog: (msg) => log(`[${item.fileName}] ${msg}`),
      });

      fileProgress[idx] = 1;
      onFileProgress?.(idx, 1);
      reportOverall();
      results[idx] = { fileName: item.fileName.replace(/\.pav$/i, '.mp4'), mp4Blob: blob };
      log(`[${idx + 1}/${total}] ${item.fileName} 변환 완료!`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      log(`[${idx + 1}/${total}] ${item.fileName} 변환 실패: ${errMsg}`);
      throw new Error(`${item.fileName} 변환 실패: ${errMsg}`);
    } finally {
      if (ff) {
        try { ff.terminate(); } catch { /* ignore */ }
      }
      release();
    }
  }

  await Promise.all(items.map((_, idx) => processFile(idx)));

  log(`전체 배치 변환 완료! ${total}개 파일`);
  return results;
}
