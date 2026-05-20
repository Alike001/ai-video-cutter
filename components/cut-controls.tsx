"use client";

import type { Sentence } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Check, X, Scissors } from "lucide-react";

type Props = {
  sentences: Sentence[];
  durationSec: number;
  onAcceptAllAI: () => void;
  onRejectAllAI: () => void;
  onCutAllFillers: () => void;
};

export function CutControls({
  sentences,
  durationSec,
  onAcceptAllAI,
  onRejectAllAI,
  onCutAllFillers,
}: Props) {
  const keptDuration = sentences
    .filter((s) => s.keep)
    .reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
  const saved = Math.max(0, durationSec - keptDuration);
  const savedPct = durationSec > 0 ? Math.round((saved / durationSec) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-sm space-y-1.5">
        <div className="flex justify-between text-gray-600">
          <span>Original</span>
          <span className="tabular-nums">{formatTime(durationSec)}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Cut version</span>
          <span className="tabular-nums">{formatTime(keptDuration)}</span>
        </div>
        <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
          <span>Saved</span>
          <span className="tabular-nums text-green-700">
            {formatTime(saved)} ({savedPct}%)
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onAcceptAllAI}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
        >
          <Check size={14} /> Accept all AI
        </button>
        <button
          onClick={onRejectAllAI}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
        >
          <X size={14} /> Reject all AI
        </button>
        <button
          onClick={onCutAllFillers}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition"
        >
          <Scissors size={14} /> Cut all fillers
        </button>
      </div>
    </div>
  );
}
