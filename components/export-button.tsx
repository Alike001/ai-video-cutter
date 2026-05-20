"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportCutVideo } from "@/lib/ffmpeg";
import { ProgressBar } from "@/components/progress-bar";
import { showBanner } from "@/lib/error-banner-store";
import type { Sentence, Project } from "@/lib/types";

type Props = { project: Project; sentences: Sentence[] };

export function ExportButton({ project, sentences }: Props) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);

  const keptRanges = sentences
    .filter((s) => s.keep)
    .map<[number, number]>((s) => [s.startSec, s.endSec]);

  const disabled = keptRanges.length === 0 || working;

  async function handleExport() {
    setWorking(true);
    setProgress(0);
    try {
      const blob = await exportCutVideo({
        videoBlob: project.videoBlob,
        fileName: project.videoFileName,
        ranges: keptRanges,
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        project.videoFileName.replace(/\.(mp4|mov|webm)$/i, "") + "-cut.mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed.";
      const lower = msg.toLowerCase();
      if (lower.includes("memory") || lower.includes("oom")) {
        showBanner({
          message: "Export ran out of memory. Try fewer cuts or shorter video.",
          variant: "error",
        });
      } else if (lower.includes("stream") || lower.includes("copy")) {
        showBanner({
          message:
            "Encoding issue. Try re-exporting from your camera as standard MP4.",
          variant: "error",
        });
      } else {
        showBanner({
          message: "Export failed.",
          variant: "error",
          actionLabel: "Retry",
          onAction: () => void handleExport(),
        });
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleExport}
        disabled={disabled}
        title={
          keptRanges.length === 0 ? "Keep at least one sentence first" : undefined
        }
        className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-3 font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition"
      >
        <Download size={18} />
        {working ? "Exporting…" : "Export cut video"}
      </button>
      {working && <ProgressBar label="Cutting & stitching…" fraction={progress} />}
    </div>
  );
}
