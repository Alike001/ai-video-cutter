import { formatTime } from "@/lib/utils";
import type { Sentence } from "@/lib/types";
import { Scissors, RotateCcw } from "lucide-react";

type Props = {
  sentence: Sentence;
  active: boolean;
  onClick: () => void;
  onToggle: () => void;
};

const reasonLabel: Record<NonNullable<Sentence["reason"]>, string> = {
  filler: "filler",
  pause: "pause",
  bad_take: "bad take",
  low_value: "low value",
};

export function SentenceCard({ sentence, active, onClick, onToggle }: Props) {
  const dropped = !sentence.keep;
  return (
    <div
      onClick={onClick}
      className={`group rounded-lg border px-4 py-3 cursor-pointer transition-all ${
        active
          ? "border-blue-500 bg-blue-50/60 shadow-sm"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/60"
      } ${dropped ? "bg-gray-50" : "bg-white"}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-gray-500 tabular-nums">
          {formatTime(sentence.startSec)} &ndash; {formatTime(sentence.endSec)}
        </span>
        {sentence.reason && (
          <span className="text-[10px] uppercase tracking-wider font-semibold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
            {reasonLabel[sentence.reason]}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`ml-auto inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border transition ${
            dropped
              ? "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          }`}
        >
          {dropped ? (
            <>
              <RotateCcw size={12} /> Keep
            </>
          ) : (
            <>
              <Scissors size={12} /> Cut
            </>
          )}
        </button>
      </div>
      <p
        className={`text-[15px] leading-relaxed ${
          dropped ? "line-through text-gray-400" : "text-gray-900"
        }`}
      >
        {sentence.text}
      </p>
    </div>
  );
}
