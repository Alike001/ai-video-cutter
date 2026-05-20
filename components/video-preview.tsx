"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Sentence } from "@/lib/types";

export type VideoPreviewHandle = {
  seekTo: (seconds: number) => void;
};

type Props = {
  videoBlob: Blob;
  sentences: Sentence[];
  playKeptOnly: boolean;
  onPlayKeptOnlyChange: (v: boolean) => void;
};

export const VideoPreview = forwardRef<VideoPreviewHandle, Props>(
  function VideoPreview(
    { videoBlob, sentences, playKeptOnly, onPlayKeptOnlyChange },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
      const u = URL.createObjectURL(videoBlob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }, [videoBlob]);

    useImperativeHandle(ref, () => ({
      seekTo(seconds: number) {
        const v = videoRef.current;
        if (v) {
          v.currentTime = seconds;
          void v.play();
        }
      },
    }));

    const keptRanges = useMemo(() => {
      return sentences
        .filter((s) => s.keep)
        .map<[number, number]>((s) => [s.startSec, s.endSec])
        .sort((a, b) => a[0] - b[0]);
    }, [sentences]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v || !playKeptOnly) return;

      function onTimeUpdate() {
        if (!v) return;
        const t = v.currentTime;
        const inKept = keptRanges.some(([s, e]) => t >= s - 0.05 && t <= e + 0.05);
        if (inKept) return;
        const next = keptRanges.find(([s]) => s > t);
        if (next) {
          v.currentTime = next[0];
        } else {
          v.pause();
        }
      }

      v.addEventListener("timeupdate", onTimeUpdate);
      return () => v.removeEventListener("timeupdate", onTimeUpdate);
    }, [keptRanges, playKeptOnly]);

    if (url === null) return null;

    return (
      <div className="space-y-3">
        <video
          ref={videoRef}
          src={url}
          controls
          className="w-full rounded-lg bg-black"
        />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={playKeptOnly}
            onChange={(e) => onPlayKeptOnlyChange(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          Play kept only (skip cuts)
        </label>
      </div>
    );
  }
);
