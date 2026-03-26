import { useEffect, useState } from 'react';
import type { PavData } from '../lib/pavParser';

export interface BatchFileInfo {
  fileName: string;
  pavData: PavData;
}

interface ThumbnailGridProps {
  files: BatchFileInfo[];
}

function Thumbnail({ file }: { file: BatchFileInfo }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    const blob = new Blob([file.pavData.frames[0].buffer as ArrayBuffer], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="flex flex-col items-center gap-1">
      {src && (
        <img
          src={src}
          alt={file.fileName}
          className="rounded border border-gray-200 w-[110px] h-[88px] object-cover"
        />
      )}
      <span className="text-xs text-gray-500 truncate max-w-[110px]" title={file.fileName}>
        {file.fileName}
      </span>
    </div>
  );
}

export default function ThumbnailGrid({ files }: ThumbnailGridProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">
        업로드된 파일 ({files.length}개)
      </h3>
      <div className="flex flex-wrap gap-3 justify-start">
        {files.map((file, i) => (
          <Thumbnail key={i} file={file} />
        ))}
      </div>
    </div>
  );
}
