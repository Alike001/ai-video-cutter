"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CapabilityGuard } from "@/components/capability-guard";
import { TranscriptView } from "@/components/transcript-view";
import { ProgressBar } from "@/components/progress-bar";
import { showBanner } from "@/lib/error-banner-store";
import { loadProject, saveProject } from "@/lib/storage";
import { extractMonoPCM } from "@/lib/audio";
import { transcribe } from "@/lib/whisper";
import { debounce } from "@/lib/utils";
import type { Project, Sentence } from "@/lib/types";

type Phase =
  | "loading-project"
  | "extracting-audio"
  | "transcribing"
  | "ready"
  | "error";

function EditorInner() {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [phase, setPhase] = useState<Phase>("loading-project");
  const [activeId, setActiveId] = useState<string | null>(null);
  const ranTranscription = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadProject();
      if (cancelled) return;
      if (!p) {
        router.replace("/");
        return;
      }
      setProject(p);
      setSentences(p.sentences);
      if (p.sentences.length === 0 && !ranTranscription.current) {
        ranTranscription.current = true;
        await runTranscription(p);
      } else {
        setPhase("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runTranscription(p: Project) {
    try {
      setPhase("extracting-audio");
      const pcm = await extractMonoPCM(p.videoBlob);
      setPhase("transcribing");
      const result = await transcribe(pcm);
      if (result.length === 0) {
        showBanner({
          message: "No speech detected. Pick a video with talking.",
          variant: "error",
        });
        setPhase("error");
        return;
      }
      setSentences(result);
      const updated: Project = { ...p, sentences: result, lastModifiedAt: Date.now() };
      setProject(updated);
      await saveProject(updated);
      setPhase("ready");
    } catch (err) {
      console.error(err);
      showBanner({
        message:
          err instanceof Error
            ? `Transcription failed: ${err.message}`
            : "Transcription failed.",
        variant: "error",
      });
      setPhase("error");
    }
  }

  const persist = useMemo(
    () =>
      debounce((next: Sentence[]) => {
        if (project) {
          const updated: Project = {
            ...project,
            sentences: next,
            lastModifiedAt: Date.now(),
          };
          setProject(updated);
          void saveProject(updated);
        }
      }, 500),
    [project]
  );

  function onToggle(id: string) {
    setSentences((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, keep: !s.keep } : s));
      persist(next);
      return next;
    });
  }

  function onSelect(id: string) {
    setActiveId(id);
  }

  if (phase === "loading-project") {
    return (
      <main className="p-8">
        <ProgressBar label="Loading project…" />
      </main>
    );
  }

  return (
    <main className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_2fr] gap-6 p-6 bg-gray-50 min-h-screen">
      <section className="overflow-y-auto max-h-screen bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Transcript</h2>
          {sentences.length > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">
              {sentences.filter((s) => s.keep).length} / {sentences.length} kept
            </span>
          )}
        </div>
        {(phase === "extracting-audio" || phase === "transcribing") && (
          <div className="space-y-3 mb-4">
            {phase === "extracting-audio" && <ProgressBar label="Extracting audio…" />}
            {phase === "transcribing" && (
              <ProgressBar label="Transcribing with Groq Whisper…" />
            )}
          </div>
        )}
        <TranscriptView
          sentences={sentences}
          activeId={activeId}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      </section>
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Preview</h2>
        <p className="text-sm text-gray-500">Preview coming in Phase 3.</p>
      </section>
    </main>
  );
}

export default function EditorPage() {
  return (
    <CapabilityGuard>
      <EditorInner />
    </CapabilityGuard>
  );
}
