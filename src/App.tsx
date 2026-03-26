import { useState, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import FramePreview from './components/FramePreview';
import ConversionProgress from './components/ConversionProgress';
import VideoPreview from './components/VideoPreview';
import ThumbnailGrid, { type BatchFileInfo } from './components/ThumbnailGrid';
import BatchProgress from './components/BatchProgress';
import BatchResultView from './components/BatchResult';
import { parsePavFile, type PavData } from './lib/pavParser';
import { loadFFmpeg, convertPavToMp4, convertBatch, DEFAULT_CONCURRENCY, MAX_CONCURRENCY, type BatchResult } from './lib/converter';
import { version } from '../package.json';

type AppState =
  | { step: 'idle' }
  // Single file
  | { step: 'uploaded'; pavData: PavData; fileName: string }
  | { step: 'loading'; pavData: PavData; fileName: string }
  | { step: 'converting'; pavData: PavData; fileName: string; progress: number }
  | { step: 'done'; pavData: PavData; fileName: string; mp4Blob: Blob }
  // Batch
  | { step: 'batch-uploaded'; files: BatchFileInfo[] }
  | { step: 'batch-converting'; files: BatchFileInfo[]; progress: number; fileProgress: number[] }
  | { step: 'batch-done'; files: BatchFileInfo[]; results: BatchResult[] }
  // Error
  | { step: 'error'; message: string };

function App() {
  const [state, setState] = useState<AppState>({ step: 'idle' });
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>([]);
  const [scale, setScale] = useState(() => Number(sessionStorage.getItem('pav-scale')) || 2);
  const [quality, setQuality] = useState(() => Number(sessionStorage.getItem('pav-quality')) || 55);
  const [concurrency, setConcurrency] = useState(() => Number(sessionStorage.getItem('pav-concurrency')) || DEFAULT_CONCURRENCY);

  const handleScaleChange = (value: number) => {
    setScale(value);
    sessionStorage.setItem('pav-scale', String(value));
  };
  const handleQualityChange = (value: number) => {
    setQuality(value);
    sessionStorage.setItem('pav-quality', String(value));
  };
  const handleConcurrencyChange = (value: number) => {
    setConcurrency(value);
    sessionStorage.setItem('pav-concurrency', String(value));
  };

  const appendLog = useCallback((msg: string) => {
    logsRef.current = [...logsRef.current, msg];
    setLogs(logsRef.current);
  }, []);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    try {
      const parsed: BatchFileInfo[] = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const pavData = parsePavFile(buffer);
        if (pavData.frames.length === 0) continue;
        parsed.push({ fileName: file.name, pavData });
      }

      if (parsed.length === 0) {
        setState({ step: 'error', message: '유효한 PAV 파일이 없습니다.' });
        return;
      }

      if (parsed.length === 1) {
        setState({ step: 'uploaded', pavData: parsed[0].pavData, fileName: parsed[0].fileName });
      } else {
        setState({ step: 'batch-uploaded', files: parsed });
      }
    } catch (e) {
      setState({ step: 'error', message: `PAV 파일 파싱 실패: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (state.step !== 'uploaded') return;
    const { pavData, fileName } = state;

    try {
      logsRef.current = [];
      setLogs([]);

      appendLog('FFmpeg 로딩 시작...');
      setState({ step: 'loading', pavData, fileName });
      await loadFFmpeg();
      appendLog('FFmpeg 로딩 완료!');

      setState({ step: 'converting', pavData, fileName, progress: 0 });
      const mp4Blob = await convertPavToMp4(pavData, {
        scale,
        quality,
        onProgress: (progress) => {
          setState((prev) =>
            prev.step === 'converting' ? { ...prev, progress } : prev
          );
        },
        onLog: appendLog,
      });

      setState({ step: 'done', pavData, fileName, mp4Blob });
    } catch (e) {
      const message = e instanceof Error ? e.message : '변환 중 오류가 발생했습니다.';
      setState({ step: 'error', message });
    }
  }, [state, scale, quality, appendLog]);

  const handleBatchConvert = useCallback(async () => {
    if (state.step !== 'batch-uploaded') return;
    const { files } = state;

    try {
      logsRef.current = [];
      setLogs([]);

      setState({ step: 'batch-converting', files, progress: 0, fileProgress: new Array(files.length).fill(0) });

      const results = await convertBatch(
        files.map((f) => ({ fileName: f.fileName, pavData: f.pavData })),
        {
          scale,
          quality,
          concurrency,
          onProgress: (progress) => {
            setState((prev) =>
              prev.step === 'batch-converting' ? { ...prev, progress } : prev
            );
          },
          onFileProgress: (fileIndex, progress) => {
            setState((prev) => {
              if (prev.step !== 'batch-converting') return prev;
              const fileProgress = [...prev.fileProgress];
              fileProgress[fileIndex] = progress;
              return { ...prev, fileProgress };
            });
          },
          onLog: appendLog,
        },
      );

      setState({ step: 'batch-done', files, results });
    } catch (e) {
      const message = e instanceof Error ? e.message : '변환 중 오류가 발생했습니다.';
      setState({ step: 'error', message });
    }
  }, [state, scale, quality, concurrency, appendLog]);

  const handleReset = () => {
    setState({ step: 'idle' });
  };

  const isBatch = state.step === 'batch-uploaded' || state.step === 'batch-converting' || state.step === 'batch-done';
  const isUploaded = state.step === 'uploaded' || state.step === 'batch-uploaded';
  const isProcessing = state.step === 'loading' || state.step === 'converting' || state.step === 'batch-converting';

  // Get representative width/height for options display
  const previewWidth = state.step === 'uploaded' ? state.pavData.width
    : state.step === 'batch-uploaded' ? state.files[0].pavData.width
    : 0;
  const previewHeight = state.step === 'uploaded' ? state.pavData.height
    : state.step === 'batch-uploaded' ? state.files[0].pavData.height
    : 0;

  return (
    <div className="min-h-screen bg-gray-100">
      <a
        href="https://github.com/thesoncriel/pav-mp4-convert"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-600 hover:text-gray-900 hover:shadow-md transition-all"
        title="GitHub"
      >
        <svg viewBox="0 0 16 16" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <header className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            PAV to MP4 Converter
            <span className="text-lg font-normal text-gray-400 ml-2">v{version.split('.').slice(0, 2).join('.')}</span>
          </h1>
          <p className="text-gray-600 mt-2">구형 휴대폰 PAV 동영상을 MP4로 변환합니다</p>
        </header>

        <div className="space-y-6">
          <FileUpload
            onFileSelected={handleFilesSelected}
            disabled={state.step !== 'idle'}
          />

          {/* Single file preview */}
          {state.step !== 'idle' && state.step !== 'error' && !isBatch && 'pavData' in state && (
            <FramePreview
              frame={state.pavData.frames[0]}
              fileName={state.fileName}
              frameCount={state.pavData.frames.length}
              fps={state.pavData.fps}
              width={state.pavData.width}
              height={state.pavData.height}
              duration={state.pavData.duration}
            />
          )}

          {/* Batch thumbnail grid */}
          {isBatch && 'files' in state && (
            <ThumbnailGrid files={state.files} />
          )}

          {/* Convert options + button */}
          {isUploaded && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">변환 옵션</h3>

                <div>
                  <label className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>업스케일</span>
                    <span className="font-medium text-gray-900">{scale}x ({previewWidth * scale} x {previewHeight * scale})</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={scale}
                    onChange={(e) => handleScaleChange(Number(e.target.value))}
                    className="w-full accent-green-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>1x</span>
                    <span>2x</span>
                    <span>3x</span>
                    <span>4x</span>
                    <span>5x</span>
                  </div>
                </div>

                <div>
                  <label className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>화질</span>
                    <span className="font-medium text-gray-900">{quality}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={quality}
                    onChange={(e) => handleQualityChange(Number(e.target.value))}
                    className="w-full accent-green-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                    <span>낮음</span>
                    <span>높음</span>
                  </div>
                </div>

                {state.step === 'batch-uploaded' && (
                  <div>
                    <label className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>동시 작업 수</span>
                      <span className="font-medium text-gray-900">{concurrency}개</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={MAX_CONCURRENCY}
                      step={1}
                      value={concurrency}
                      onChange={(e) => handleConcurrencyChange(Number(e.target.value))}
                      className="w-full accent-green-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                      {Array.from({ length: MAX_CONCURRENCY }, (_, i) => (
                        <span key={i}>{i + 1}</span>
                      ))}
                    </div>
                    {concurrency > DEFAULT_CONCURRENCY && (
                      <p className="mt-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        &#x26A0; 주의! 동시 작업 수가 많으면 메모리 사용량이 크게 증가하여 웹 브라우저 작동이 중지될 수 있습니다.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={state.step === 'batch-uploaded' ? handleBatchConvert : handleConvert}
                className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors cursor-pointer"
              >
                {state.step === 'batch-uploaded'
                  ? `${state.files.length}개 파일 MP4로 변환하기`
                  : 'MP4로 변환하기'
                }
              </button>
            </div>
          )}

          {/* Single conversion progress */}
          {(state.step === 'loading' || state.step === 'converting') && (
            <ConversionProgress
              progress={state.step === 'converting' ? state.progress : 0}
              status={state.step === 'loading' ? 'loading' : 'converting'}
              logs={logs}
            />
          )}

          {/* Batch conversion progress */}
          {state.step === 'batch-converting' && (
            <BatchProgress
              fileNames={state.files.map((f) => f.fileName)}
              fileProgress={state.fileProgress}
              overallProgress={state.progress}
            />
          )}

          {/* Single done */}
          {state.step === 'done' && (
            <VideoPreview blob={state.mp4Blob} fileName={state.fileName} logs={logs} />
          )}

          {/* Batch done */}
          {state.step === 'batch-done' && (
            <BatchResultView results={state.results} logs={logs} />
          )}

          {state.step === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-700 whitespace-pre-wrap break-all">{state.message}</p>
            </div>
          )}

          {state.step !== 'idle' && (
            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다른 파일 변환하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
