import { FFmpeg } from '@ffmpeg/ffmpeg';
import type { PavData } from './pavParser';

let ffmpeg: FFmpeg | null = null;

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  console.log('[converter] FFmpeg 로딩 시작...');
  ffmpeg = new FFmpeg();

  // 모든 로그를 콘솔에 출력
  ffmpeg.on('log', ({ message }) => {
    console.log('[ffmpeg]', message);
  });

  try {
    // Vite가 .js를 ESM으로 변환하는 것을 피하기 위해
    // fetch → Blob URL로 변환하여 로드
    console.log('[converter] ffmpeg-core 파일 다운로드 중...');

    const [coreRes, wasmRes] = await Promise.all([
      fetch('/ffmpeg-core.js'),
      fetch('/ffmpeg-core.wasm'),
    ]);

    const coreBlob = new Blob([await coreRes.text()], { type: 'text/javascript' });
    const wasmBlob = new Blob([await wasmRes.arrayBuffer()], { type: 'application/wasm' });

    const coreURL = URL.createObjectURL(coreBlob);
    const wasmURL = URL.createObjectURL(wasmBlob);

    console.log('[converter] FFmpeg load() 호출...');
    await ffmpeg.load({ coreURL, wasmURL });
    console.log('[converter] FFmpeg 로딩 완료!');
  } catch (e) {
    console.error('[converter] FFmpeg 로딩 실패:', e);
    ffmpeg = null;
    throw new Error(`FFmpeg 로딩 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return ffmpeg;
}

export async function convertPavToMp4(
  pavData: PavData,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('[converter] 변환 시작 - frames:', pavData.frames.length, 'fps:', pavData.fps);

  const ff = await loadFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(Math.max(progress, 0), 1));
  };
  ff.on('progress', progressHandler);

  const padLen = Math.max(String(pavData.frames.length).length, 3);
  const padPattern = `frame_%0${padLen}d.jpg`;
  const filesToClean: string[] = [];

  try {
    // Write JPEG frames
    console.log('[converter] JPEG 프레임 쓰기 시작...');
    for (let i = 0; i < pavData.frames.length; i++) {
      const name = `frame_${String(i).padStart(padLen, '0')}.jpg`;
      await ff.writeFile(name, pavData.frames[i]);
      filesToClean.push(name);
    }
    console.log('[converter] JPEG 프레임 쓰기 완료:', pavData.frames.length, '개');

    // Write audio
    console.log('[converter] 오디오 쓰기 (audio.qcp):', pavData.audio.length, 'bytes');
    await ff.writeFile('audio.qcp', pavData.audio);
    filesToClean.push('audio.qcp');

    const fps = pavData.fps.toFixed(4);
    console.log('[converter] FFmpeg exec 시작 (오디오 포함)...');

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
    console.log('[converter] FFmpeg exec (오디오 포함) 결과:', ret);

    // Fallback: video only
    if (ret !== 0) {
      console.warn('[converter] 오디오 변환 실패, 비디오만 변환 시도...');
      ret = await ff.exec([
        '-framerate', fps,
        '-i', padPattern,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-y', 'output.mp4',
      ]);
      console.log('[converter] FFmpeg exec (비디오만) 결과:', ret);
    }

    if (ret !== 0) {
      throw new Error(`FFmpeg 변환 실패 (exit code: ${ret}). 콘솔의 [ffmpeg] 로그를 확인하세요.`);
    }

    console.log('[converter] output.mp4 읽기...');
    const outputData = await ff.readFile('output.mp4');
    filesToClean.push('output.mp4');
    console.log('[converter] 변환 완료! 크기:', (outputData as Uint8Array).length, 'bytes');

    return new Blob([outputData], { type: 'video/mp4' });
  } catch (e) {
    console.error('[converter] 변환 중 예외 발생:', e);
    throw e;
  } finally {
    ff.off('progress', progressHandler);

    for (const name of filesToClean) {
      try { await ff.deleteFile(name); } catch { /* ignore */ }
    }
  }
}
