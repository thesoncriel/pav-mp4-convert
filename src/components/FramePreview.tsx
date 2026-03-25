import { useEffect, useState } from 'react';

interface FramePreviewProps {
  frame: Uint8Array;
  fileName: string;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  duration: number;
}

export default function FramePreview({
  frame, fileName, frameCount, fps, width, height, duration,
}: FramePreviewProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const blob = new Blob([frame], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [frame]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">미리보기 (1프레임)</h3>
      <div className="flex flex-col sm:flex-row gap-6 items-center">
        {src && (
          <img
            src={src}
            alt="첫 번째 프레임"
            className="rounded-lg border border-gray-200 max-w-[280px] w-full h-auto"
            style={{ imageRendering: 'auto' }}
          />
        )}
        <div className="text-sm text-gray-600 space-y-1.5">
          <p><span className="font-medium text-gray-800">파일명:</span> {fileName}</p>
          <p><span className="font-medium text-gray-800">해상도:</span> {width} x {height}</p>
          <p><span className="font-medium text-gray-800">프레임 수:</span> {frameCount}</p>
          <p><span className="font-medium text-gray-800">FPS:</span> {fps.toFixed(1)}</p>
          <p><span className="font-medium text-gray-800">길이:</span> {duration.toFixed(1)}초</p>
        </div>
      </div>
    </div>
  );
}
