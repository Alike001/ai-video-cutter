"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CapabilityGuard } from "@/components/capability-guard";
import { TranscriptView } from "@/components/transcript-view";
import { ProgressBar } from "@/components/progress-bar";
import { VideoPreview, type VideoPreviewHandle } from "@/components/video-preview";
import { CutControls } from "@/components/cut-controls";
import { ExportButton } from "@/components/export-button";
import { showBanner } from "@/lib/error-banner-store";
import { loadProject, saveProject } from "@/lib/storage";
import { extractMonoPCM } from "@/lib/audio";
import { transcribe } from "@/lib/whisper";
import { applyDeterministicCuts } from "@/lib/cut-detector";
import { fetchSuggestions, mergeSuggestions } from "@/lib/groq-client";
import { debounce } from "@/lib/utils";
import type { Project, Sentence } from "@/lib/types";

type Phase =
  | "loading-project"
  | "extracting-audio"
  | "transcribing"
  | "analyzing"
  | "ready"
  | "error";

function EditorInner() {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [phase, setPhase] = useState<Phase>("loading-project");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playKeptOnly, setPlayKeptOnly] = useState(true);
  const ranTranscription = useRef(false);
  const videoRef = useRef<VideoPreviewHandle | null>(null);

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
      setPhase("analyzing");
      let staged = applyDeterministicCuts(result);
      const suggestions = await fetchSuggestions(staged);
      if (suggestions === null) {
        showBanner({
          message:
            "Smart AI suggestions unavailable — basic filler detection still active.",
          variant: "warning",
        });
      } else if (suggestions.length > 0) {
        staged = mergeSuggestions(staged, suggestions);
      }

      setSentences(staged);
      const updated: Project = {
        ...p,
        sentences: staged,
        lastModifiedAt: Date.now(),
      };
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
    const sentence = sentences.find((s) => s.id === id);
    if (sentence && videoRef.current) {
      videoRef.current.seekTo(sentence.startSec);
    }
  }

  function applyBulk(transform: (s: Sentence) => Sentence) {
    setSentences((prev) => {
      const next = prev.map(transform);
      persist(next);
      return next;
    });
  }

  const onAcceptAllAI = () =>
    applyBulk((s) => ({ ...s, keep: s.suggestedKeep }));
  const onRejectAllAI = () => applyBulk((s) => ({ ...s, keep: true }));
  const onCutAllFillers = () =>
    applyBulk((s) => (s.reason === "filler" ? { ...s, keep: false } : s));

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
        {(phase === "extracting-audio" ||
          phase === "transcribing" ||
          phase === "analyzing") && (
          <div className="space-y-3 mb-4">
            {phase === "extracting-audio" && <ProgressBar label="Extracting audio…" />}
            {phase === "transcribing" && (
              <ProgressBar label="Transcribing with Groq Whisper…" />
            )}
            {phase === "analyzing" && (
              <ProgressBar label="Analyzing cuts with AI…" />
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
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
        {project && (
          <>
            <VideoPreview
              ref={videoRef}
              videoBlob={project.videoBlob}
              sentences={sentences}
              playKeptOnly={playKeptOnly}
              onPlayKeptOnlyChange={setPlayKeptOnly}
            />
            <CutControls
              sentences={sentences}
              durationSec={project.durationSec}
              onAcceptAllAI={onAcceptAllAI}
              onRejectAllAI={onRejectAllAI}
              onCutAllFillers={onCutAllFillers}
            />
            <ExportButton project={project} sentences={sentences} />
          </>
        )}
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
