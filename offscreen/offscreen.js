const pipelines = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isOffscreenMessage(message)) {
    return false;
  }

  handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error("Offscreen handler error:", error);
      sendResponse({ ok: false, error: error?.message || "Unknown error" });
    });

  return true;
});

function isOffscreenMessage(message) {
  const type = message?.type;
  return type === "ATTACH_TAB_STREAM" || type === "SET_TAB_AUDIO" || type === "RELEASE_TAB_STREAM";
}

async function handleMessage(message) {
  const type = message?.type;
  if (!type) {
    throw new Error("Missing message type.");
  }

  if (type === "ATTACH_TAB_STREAM") {
    await attachTabStream(message.tabId, message.streamId);
    return {};
  }

  if (type === "SET_TAB_AUDIO") {
    await setTabAudio(message.tabId, message.volume, message.muted);
    return {};
  }

  if (type === "RELEASE_TAB_STREAM") {
    await releaseTabStream(message.tabId);
    return {};
  }

  throw new Error(`Unsupported offscreen message type: ${type}`);
}

async function attachTabStream(tabId, streamId) {
  if (typeof tabId !== "number") {
    throw new Error("Invalid tab id.");
  }
  if (!streamId) {
    throw new Error("Missing stream id.");
  }

  if (pipelines.has(tabId)) {
    return;
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  const audioContext = new AudioContext();
  const sourceNode = audioContext.createMediaStreamSource(mediaStream);
  const gainNode = audioContext.createGain();
  sourceNode.connect(gainNode).connect(audioContext.destination);
  gainNode.gain.value = 1.0;

  pipelines.set(tabId, {
    stream: mediaStream,
    context: audioContext,
    source: sourceNode,
    gain: gainNode
  });
}

async function setTabAudio(tabId, volumePercent, muted) {
  const pipeline = pipelines.get(tabId);
  if (!pipeline) {
    return;
  }

  if (pipeline.context.state === "suspended") {
    await pipeline.context.resume();
  }

  const safeVolume = Number.isFinite(Number(volumePercent))
    ? Math.max(0, Math.min(200, Number(volumePercent)))
    : 100;
  const gainValue = Boolean(muted) ? 0 : safeVolume / 100;
  pipeline.gain.gain.value = gainValue;
}

async function releaseTabStream(tabId) {
  const pipeline = pipelines.get(tabId);
  if (!pipeline) {
    return;
  }

  pipelines.delete(tabId);

  try {
    pipeline.source.disconnect();
  } catch (_error) {
  }

  try {
    pipeline.gain.disconnect();
  } catch (_error) {
  }

  for (const track of pipeline.stream.getTracks()) {
    track.stop();
  }

  await pipeline.context.close();
}
