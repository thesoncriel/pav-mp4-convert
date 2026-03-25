import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { PavData } from './pavParser';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  try {
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
  } catch (e) {
    ffmpeg = null;
    throw new Error(`FFmpeg 로딩 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return ffmpeg;
}

export interface ConvertOptions {
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export async function convertPavToMp4(
  pavData: PavData,
  options?: ConvertOptions
): Promise<Blob> {
  const { onProgress, onLog } = options ?? {};
  const log = (msg: string) => {
    onLog?.(msg);
  };

  log(`변환 시작 - ${pavData.frames.length} frames, ${pavData.fps.toFixed(1)} fps`);

  const ff = await loadFFmpeg();

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
    // Write JPEG frames
    log('JPEG 프레임 쓰기 시작...');
    for (let i = 0; i < pavData.frames.length; i++) {
      const name = `frame_${String(i).padStart(padLen, '0')}.jpg`;
      await ff.writeFile(name, pavData.frames[i]);
      filesToClean.push(name);
    }
    log(`JPEG 프레임 쓰기 완료: ${pavData.frames.length}개`);

    // Write audio
    log(`오디오 쓰기 (audio.qcp): ${pavData.audio.length} bytes`);
    await ff.writeFile('audio.qcp', pavData.audio);
    filesToClean.push('audio.qcp');

    const fps = pavData.fps.toFixed(4);
    log('FFmpeg 인코딩 시작 (오디오 포함)...');

    // Try with audio first
    let ret = await ff.exec([
      '-framerate', fps,
      '-i', padPattern,
      '-i', 'audio.qcp',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      '-shortest',
      '-y', 'output.mp4',
    ]);

    // Fallback: video only
    if (ret !== 0) {
      log('오디오 변환 실패, 비디오만 변환 시도...');
      ret = await ff.exec([
        '-framerate', fps,
        '-i', padPattern,
        '-c:v', 'libx264',
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

    return new Blob([outputData], { type: 'video/mp4' });
  } catch (e) {
    throw e;
  } finally {
    ff.off('progress', progressHandler);
    ff.off('log', logHandler);

    for (const name of filesToClean) {
      try { await ff.deleteFile(name); } catch { /* ignore */ }
    }
  }
}
