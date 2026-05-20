"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CapabilityGuard } from "@/components/capability-guard";
import { UploadDropzone } from "@/components/upload-dropzone";
import { showBanner } from "@/lib/error-banner-store";
import { hasProject, saveProject, clearProject } from "@/lib/storage";
import type { Project } from "@/lib/types";
import { FileVideo, Trash2, ArrowRight } from "lucide-react";

function getDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read this file. Try re-exporting from your editor."));
    };
    video.src = url;
  });
}

function HomeInner() {
  const router = useRouter();
  const [hasExisting, setHasExisting] = useState<boolean | null>(null);

  useEffect(() => {
    hasProject().then(setHasExisting);
  }, []);

  async function handleFile(file: File) {
    try {
      const durationSec = await getDurationSec(file);
      const project: Project = {
        videoBlob: file,
        videoFileName: file.name,
        videoMimeType: file.type,
        durationSec,
        sentences: [],
        createdAt: Date.now(),
        lastModifiedAt: Date.now(),
      };
      await saveProject(project);
      router.push("/editor");
    } catch (err) {
      showBanner({
        message: err instanceof Error ? err.message : "Upload failed.",
        variant: "error",
      });
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:py-20">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          AI Video Cutter
        </h1>
        <p className="mt-3 text-base text-gray-600 leading-relaxed">
          Upload a talking-head clip and we&apos;ll suggest cuts you can review one
          tap at a time.
        </p>
      </header>

      {hasExisting && (
        <div className="mb-8 rounded-xl border border-blue-200 bg-blue-50/60 px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <FileVideo size={18} />
            </div>
            <div>
              <p className="font-medium text-gray-900">You have a saved project</p>
              <p className="text-sm text-gray-600">Pick up where you left off.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              onClick={() => router.push("/editor")}
            >
              Resume project <ArrowRight size={14} />
            </button>
            <button
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              onClick={async () => {
                if (confirm("Discard saved project? This cannot be undone.")) {
                  await clearProject();
                  setHasExisting(false);
                }
              }}
            >
              <Trash2 size={14} /> Start new
            </button>
          </div>
        </div>
      )}

      <UploadDropzone
        onFile={handleFile}
        onError={(m) => showBanner({ message: m, variant: "error" })}
      />

      <p className="mt-6 text-xs text-gray-500 text-center">
        All processing happens privately in your browser, except for transcription via Groq.
      </p>
    </main>
  );
}

export default function HomePage() {
  return (
    <CapabilityGuard>
      <HomeInner />
    </CapabilityGuard>
  );
}
