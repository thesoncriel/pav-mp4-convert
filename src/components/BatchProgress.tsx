interface BatchProgressProps {
  fileNames: string[];
  fileProgress: number[];
  overallProgress: number;
}

export default function BatchProgress({ fileNames, fileProgress, overallProgress }: BatchProgressProps) {
  const overallPercent = Math.round(overallProgress * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">배치 변환 진행</h3>

      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>전체 진행률</span>
          <span className="font-medium">{overallPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {fileNames.map((name, i) => {
          const percent = Math.round(fileProgress[i] * 100);
          const done = percent >= 100;
          return (
            <div key={i}>
              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                <span className="truncate max-w-[70%]" title={name}>
                  {done ? '\u2705' : '\u23F3'} {name}
                </span>
                <span>{percent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${done ? 'bg-green-500' : 'bg-blue-400'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
