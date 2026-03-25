import { useState, useCallback, useRef } from 'react';
import FileUpload from './components/FileUpload';
import FramePreview from './components/FramePreview';
import ConversionProgress from './components/ConversionProgress';
import VideoPreview from './components/VideoPreview';
import { parsePavFile, type PavData } from './lib/pavParser';
import { loadFFmpeg, convertPavToMp4 } from './lib/converter';

type AppState =
  | { step: 'idle' }
  | { step: 'uploaded'; pavData: PavData; fileName: string }
  | { step: 'loading'; pavData: PavData; fileName: string }
  | { step: 'converting'; pavData: PavData; fileName: string; progress: number }
  | { step: 'done'; pavData: PavData; fileName: string; mp4Blob: Blob }
  | { step: 'error'; message: string };

function App() {
  const [state, setState] = useState<AppState>({ step: 'idle' });
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>([]);

  const handleFileSelected = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const pavData = parsePavFile(buffer);

      if (pavData.frames.length === 0) {
        setState({ step: 'error', message: '유효한 PAV 파일이 아닙니다.' });
        return;
      }

      setState({ step: 'uploaded', pavData, fileName: file.name });
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

      const appendLog = (msg: string) => {
        logsRef.current = [...logsRef.current, msg];
        setLogs(logsRef.current);
      };

      appendLog('FFmpeg 로딩 시작...');
      setState({ step: 'loading', pavData, fileName });
      await loadFFmpeg();
      appendLog('FFmpeg 로딩 완료!');

      setState({ step: 'converting', pavData, fileName, progress: 0 });
      const mp4Blob = await convertPavToMp4(pavData, {
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
  }, [state]);

  const handleReset = () => {
    setState({ step: 'idle' });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <header className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">PAV to MP4 Converter</h1>
          <p className="text-gray-600 mt-2">구형 휴대폰 PAV 동영상을 MP4로 변환합니다</p>
        </header>

        <div className="space-y-6">
          <FileUpload
            onFileSelected={handleFileSelected}
            disabled={state.step !== 'idle'}
          />

          {state.step !== 'idle' && state.step !== 'error' && (
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

          {state.step === 'uploaded' && (
            <button
              onClick={handleConvert}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors cursor-pointer"
            >
              MP4로 변환하기
            </button>
          )}

          {(state.step === 'loading' || state.step === 'converting') && (
            <ConversionProgress
              progress={state.step === 'converting' ? state.progress : 0}
              status={state.step === 'loading' ? 'loading' : 'converting'}
              logs={logs}
            />
          )}

          {state.step === 'done' && (
            <VideoPreview blob={state.mp4Blob} fileName={state.fileName} logs={logs} />
          )}

          {state.step === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-700 whitespace-pre-wrap break-all">{state.message}</p>
            </div>
          )}

          {state.step !== 'idle' && (
            <button
              onClick={handleReset}
              className="w-full py-2 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
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
