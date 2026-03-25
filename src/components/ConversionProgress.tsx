import { useEffect, useRef } from 'react';

interface ConversionProgressProps {
  progress: number; // 0 ~ 1
  status: 'loading' | 'converting';
  logs: string[];
}

export default function ConversionProgress({ progress, status, logs }: ConversionProgressProps) {
  const percent = Math.round(progress * 100);
  const label = status === 'loading' ? 'FFmpeg 로딩 중...' : `변환 중... ${percent}%`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">변환 진행</h3>
      <p className="text-sm text-gray-600 mb-3">{label}</p>
      <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      {logs.length > 0 && (
        <textarea
          ref={textareaRef}
          readOnly
          value={logs.join('\n')}
          className="w-full h-40 text-xs font-mono bg-gray-900 text-green-400 rounded-lg p-3 resize-none focus:outline-none"
        />
      )}
    </div>
  );
}
