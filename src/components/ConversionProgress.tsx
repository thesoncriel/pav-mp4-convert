interface ConversionProgressProps {
  progress: number; // 0 ~ 1
  status: 'loading' | 'converting';
}

export default function ConversionProgress({ progress, status }: ConversionProgressProps) {
  const percent = Math.round(progress * 100);
  const label = status === 'loading' ? 'FFmpeg 로딩 중...' : `변환 중... ${percent}%`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">변환 진행</h3>
      <p className="text-sm text-gray-600 mb-3">{label}</p>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="bg-blue-500 h-3 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
