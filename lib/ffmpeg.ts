import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { mergeRanges } from "@/lib/utils";

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let instancePromise: Promise<FFmpeg> | null = null;

async function getInstance(): Promise<FFmpeg> {
  if (instancePromise === null) {
    instancePromise = (async () => {
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })();
  }
  return instancePromise;
}

export type ExportOptions = {
  videoBlob: Blob;
  fileName: string;
  ranges: Array<[number, number]>;
  onLog?: (msg: string) => void;
  onProgress?: (frac: number) => void;
};

export async function exportCutVideo(opts: ExportOptions): Promise<Blob> {
  const merged = mergeRanges(opts.ranges);
  if (merged.length === 0) {
    throw new Error("Nothing to export — keep at least one sentence.");
  }

  const ff = await getInstance();

  if (opts.onLog) ff.on("log", ({ message }) => opts.onLog?.(message));
  if (opts.onProgress) ff.on("progress", ({ progress }) => opts.onProgress?.(progress));

  const inputName = "input." + (opts.fileName.split(".").pop() ?? "mp4");
  const inputData = new Uint8Array(await opts.videoBlob.arrayBuffer());
  await ff.writeFile(inputName, inputData);

  const clipNames: string[] = [];
  for (let i = 0; i < merged.length; i++) {
    const [start, end] = merged[i];
    const clip = `clip_${i}.mp4`;
    await ff.exec([
      "-ss", String(start),
      "-to", String(end),
      "-i", inputName,
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      clip,
    ]);
    clipNames.push(clip);
  }

  let outputBlob: Blob;
  if (clipNames.length === 1) {
    const data = (await ff.readFile(clipNames[0])) as Uint8Array;
    outputBlob = new Blob([new Uint8Array(data)], { type: "video/mp4" });
  } else {
    const listText = clipNames.map((n) => `file '${n}'`).join("\n") + "\n";
    await ff.writeFile("list.txt", new TextEncoder().encode(listText));
    await ff.exec([
      "-f", "concat",
      "-safe", "0",
      "-i", "list.txt",
      "-c", "copy",
      "output.mp4",
    ]);
    const data = (await ff.readFile("output.mp4")) as Uint8Array;
    outputBlob = new Blob([new Uint8Array(data)], { type: "video/mp4" });
  }

  await ff.deleteFile(inputName).catch(() => {});
  for (const c of clipNames) await ff.deleteFile(c).catch(() => {});
  await ff.deleteFile("list.txt").catch(() => {});
  await ff.deleteFile("output.mp4").catch(() => {});

  return outputBlob;
}
