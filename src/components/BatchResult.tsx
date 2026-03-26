import { useCallback, useState } from 'react';
import JSZip from 'jszip';

interface BatchResultFile {
  fileName: string;
  mp4Blob: Blob;
}

interface BatchResultProps {
  results: BatchResultFile[];
  logs: string[];
}

export default function BatchResult({ results, logs }: BatchResultProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [zipping, setZipping] = useState(false);

  const handleDownloadZip = useCallback(async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const r of results) {
        zip.file(r.fileName, r.mp4Blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pav-converted.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }, [results]);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          변환 완료 ({results.length}개 파일)
        </h3>
        <ul className="text-sm text-gray-600 space-y-1 mb-4">
          {results.map((r, i) => (
            <li key={i}>
              {r.fileName} ({(r.mp4Blob.size / 1024).toFixed(1)} KB)
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadZip}
            disabled={zipping}
            className="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {zipping ? 'ZIP 생성 중...' : 'ZIP 다운로드'}
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
