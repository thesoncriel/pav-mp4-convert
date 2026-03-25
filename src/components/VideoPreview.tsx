import { useEffect, useState } from 'react';

interface VideoPreviewProps {
  blob: Blob;
  fileName: string;
}

export default function VideoPreview({ blob, fileName }: VideoPreviewProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const mp4FileName = fileName.replace(/\.pav$/i, '.mp4');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = mp4FileName;
    a.click();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">변환 완료</h3>
      {src && (
        <video
          src={src}
          controls
          className="rounded-lg border border-gray-200 max-w-[400px] w-full mx-auto mb-4"
        />
      )}
      <button
        onClick={handleDownload}
        className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors cursor-pointer"
      >
        {mp4FileName} 다운로드
      </button>
    </div>
  );
}
