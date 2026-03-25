import { useEffect, useRef, useState } from 'react';

interface VideoPreviewProps {
  blob: Blob;
  fileName: string;
  logs: string[];
}

export default function VideoPreview({ blob, fileName, logs }: VideoPreviewProps) {
  const [src, setSrc] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    if (showLogs && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [showLogs]);

  const mp4FileName = fileName.replace(/\.pav$/i, '.mp4');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = mp4FileName;
    a.click();
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">변환 완료</h3>
        {src && (
          <video
            src={src}
            controls
            className="rounded-lg border border-gray-200 max-w-[400px] w-full mx-auto mb-4"
          />
        )}
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {mp4FileName} 다운로드
          </button>
          <button
            onClick={() => setShowLogs(true)}
            className="px-4 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors cursor-pointer"
          >
            변환 로그 보기
          </button>
        </div>
      </div>

      {showLogs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowLogs(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">변환 로그</h3>
              <button
                onClick={() => setShowLogs(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
              >
                &#x2715;
              </button>
            </div>
            <div className="p-4 flex-1 min-h-0">
              <textarea
                ref={textareaRef}
                readOnly
                value={logs.join('\n')}
                className="w-full h-[60vh] text-xs font-mono bg-gray-900 text-green-400 rounded-lg p-3 resize-none focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
