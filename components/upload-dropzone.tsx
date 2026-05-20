"use client";

import { useCallback, useState } from "react";
import { Upload } from "lucide-react";

const ACCEPT = "video/mp4,video/quicktime,video/webm";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

type Props = {
  onFile: (file: File) => void;
  onError: (message: string) => void;
};

export function UploadDropzone({ onFile, onError }: Props) {
  const [dragging, setDragging] = useState(false);

  const validate = useCallback(
    (file: File): boolean => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        onError("Only MP4, MOV, WebM supported. Convert with HandBrake or CloudConvert.");
        return false;
      }
      if (file.size > MAX_BYTES) {
        const gb = (file.size / 1024 / 1024 / 1024).toFixed(1);
        onError(`This file is huge (${gb}GB). Try a shorter clip or lower resolution.`);
        return false;
      }
      return true;
    },
    [onError]
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && validate(file)) onFile(file);
      }}
      className={`block border-2 border-dashed rounded-2xl px-8 py-16 text-center cursor-pointer transition-all ${
        dragging
          ? "border-blue-500 bg-blue-50 scale-[1.01]"
          : "border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30"
      }`}
    >
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 text-blue-600 mb-4">
        <Upload size={26} />
      </div>
      <p className="font-semibold text-gray-900">Drop a video here or click to pick</p>
      <p className="text-sm text-gray-500 mt-1.5">
        MP4, MOV, or WebM &middot; up to 15 min recommended
      </p>
      <input
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && validate(file)) onFile(file);
        }}
      />
    </label>
  );
}
