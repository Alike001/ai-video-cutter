const TARGET_SAMPLE_RATE = 16000;

export async function extractMonoPCM(videoBlob: Blob): Promise<Float32Array> {
  const arrayBuffer = await videoBlob.arrayBuffer();
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close();
  }

  const targetLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;

  if (decoded.numberOfChannels > 1) {
    const merger = offline.createChannelMerger(1);
    const splitter = offline.createChannelSplitter(decoded.numberOfChannels);
    source.connect(splitter);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      splitter.connect(merger, ch, 0);
    }
    merger.connect(offline.destination);
  } else {
    source.connect(offline.destination);
  }

  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
