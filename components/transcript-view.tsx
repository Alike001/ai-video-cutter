import type { Sentence } from "@/lib/types";
import { SentenceCard } from "@/components/sentence-card";

type Props = {
  sentences: Sentence[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
};

export function TranscriptView({ sentences, activeId, onSelect, onToggle }: Props) {
  if (sentences.length === 0) {
    return <p className="text-sm text-gray-500">No transcript yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {sentences.map((s) => (
        <SentenceCard
          key={s.id}
          sentence={s}
          active={s.id === activeId}
          onClick={() => onSelect(s.id)}
          onToggle={() => onToggle(s.id)}
        />
      ))}
    </div>
  );
}
