const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const muteButton = document.getElementById("muteButton");
const halfButton = document.getElementById("halfButton");
const resetButton = document.getElementById("resetButton");
const statusText = document.getElementById("statusText");

let currentWindowId = null;
let muted = false;
let lastNonZeroVolume = 100;

initialize().catch((error) => {
  setStatus(`Failed to load popup: ${error?.message || "Unknown error"}`, true);
});

volumeSlider.addEventListener("input", async () => {
  const volume = Number(volumeSlider.value);
  await setVolume(volume);
});

muteButton.addEventListener("click", async () => {
  const currentVolume = Number(volumeSlider.value);
  if (currentVolume > 0) {
    lastNonZeroVolume = currentVolume;
    await setVolume(0);
    return;
  }

  const restoreVolume = Math.max(1, Math.min(200, Math.round(lastNonZeroVolume || 100)));
  await setVolume(restoreVolume);
});

halfButton.addEventListener("click", async () => {
  const current = Number(volumeSlider.value);
  const next = Math.max(0, Math.round(current / 2));
  await setVolume(next);
});

resetButton.addEventListener("click", async () => {
  await setVolume(100);
});

async function initialize() {
  const activeTabResult = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  const activeTab = activeTabResult[0];
  if (!activeTab || typeof activeTab.windowId !== "number") {
    throw new Error("No active tab found.");
  }

  currentWindowId = activeTab.windowId;

  const stateResponse = await chrome.runtime.sendMessage({
    type: "GET_STATE",
    windowId: currentWindowId
  });
  if (!stateResponse?.ok) {
    throw new Error(stateResponse?.error || "Unable to load state.");
  }

  const state = stateResponse.state;
  volumeSlider.value = String(state.volume);
  muted = Boolean(state.muted);
  if (state.volume > 0) {
    lastNonZeroVolume = Number(state.volume);
  }
  updateVolumeText(state.volume);
  renderMuteButton();

  const applyResponse = await chrome.runtime.sendMessage({
    type: "APPLY_TO_WINDOW",
    windowId: currentWindowId
  });

  if (!applyResponse?.ok) {
    throw new Error(applyResponse?.error || "Unable to apply controls to window.");
  }

  setApplyStatus(applyResponse);
}

function updateVolumeText(volume) {
  volumeValue.textContent = `${Math.round(Number(volume))}%`;
}

function renderMuteButton() {
  muteButton.dataset.muted = String(muted);
  muteButton.title = muted ? "Unmute" : "Mute";
  muteButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
}

function setApplyStatus(response) {
  const attached = Number(response?.attachedCount || 0);
  const skipped = Number(response?.skippedCount || 0);
  if (attached === 0 && skipped === 0) {
    setStatus("No tabs in this window.");
    return;
  }

  if (skipped > 0) {
    setStatus(`Applied to ${attached} tab(s). Skipped ${skipped} restricted tab(s).`);
    return;
  }

  setStatus(`Applied to ${attached} tab(s).`);
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function setVolume(volume) {
  const safeVolume = Math.max(0, Math.min(200, Math.round(Number(volume))));
  if (safeVolume > 0) {
    lastNonZeroVolume = safeVolume;
  }

  volumeSlider.value = String(safeVolume);
  updateVolumeText(safeVolume);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SET_VOLUME",
      windowId: currentWindowId,
      volume: safeVolume
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Volume update failed.");
    }

    muted = safeVolume === 0;
    renderMuteButton();
    setApplyStatus(response);
  } catch (error) {
    setStatus(`Volume update failed: ${error?.message || "Unknown error"}`, true);
  }
}
