  export type Capability =
    | "SharedArrayBuffer"
    | "WebAssembly"
    | "IndexedDB"
    | "AudioContext"
    | "File"
    | "crossOriginIsolated";

  export function getMissingCapabilities(): Capability[] {
    if (typeof window === "undefined") return [];
    const missing: Capability[] = [];
    if (typeof SharedArrayBuffer === "undefined") missing.push("SharedArrayBuffer");
    if (typeof WebAssembly === "undefined") missing.push("WebAssembly");
    if (typeof indexedDB === "undefined") missing.push("IndexedDB");
    if (typeof AudioContext === "undefined" && typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === "undefined")
  missing.push("AudioContext");
    if (typeof File === "undefined") missing.push("File");
    if (window.crossOriginIsolated !== true) missing.push("crossOriginIsolated");
    return missing;
  }
