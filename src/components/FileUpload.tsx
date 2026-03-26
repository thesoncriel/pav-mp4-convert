import { useCallback, useRef, useState } from 'react';

interface FileUploadProps {
  onFileSelected: (files: File[]) => void;
  disabled?: boolean;
}

export default function FileUpload({ onFileSelected, disabled }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((fileList: FileList) => {
    const pavFiles = Array.from(fileList).filter((f) =>
      f.name.toLowerCase().endsWith('.pav')
    );
    if (pavFiles.length > 0) {
      onFileSelected(pavFiles);
    }
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles, disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
        ${isDragging
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pav"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <div className="text-4xl mb-4">&#128249;</div>
      <p className="text-lg font-medium text-gray-700">
        PAV 파일을 여기에 드래그하거나 클릭하여 선택
      </p>
      <p className="text-sm text-gray-500 mt-2">
        .pav 파일만 지원됩니다 (여러 파일 선택 가능)
      </p>
    </div>
  );
}
