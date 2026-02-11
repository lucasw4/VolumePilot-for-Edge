const DEFAULT_SETTINGS = Object.freeze({
  volume: 100,
  muted: false
});

const OFFSCREEN_PATH = "offscreen/offscreen.html";

let globalSettings = { ...DEFAULT_SETTINGS };
const windowSettings = new Map();
const attachedTabs = new Set();
const tabToWindow = new Map();

initialize().catch((error) => {
  console.error("Initialization failed:", error);
});

chrome.runtime.onStartup.addListener(() => {
  initialize().catch((error) => {
    console.error("Startup initialization failed:", error);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch((error) => {
    console.error("Install initialization failed:", error);
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return;
  }

  if (!windowSettings.has(tab.windowId)) {
    return;
  }

  tabToWindow.set(tab.id, tab.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || typeof tab.windowId !== "number") {
    return;
  }

  if (!windowSettings.has(tab.windowId)) {
    return;
  }

  const shouldAttemptAttach =
    changeInfo.status === "complete" ||
    changeInfo.url !== undefined ||
    changeInfo.audible !== undefined;

  if (!shouldAttemptAttach) {
    return;
  }

  applyToTab(tab).catch((error) => {
    console.warn(`Failed to auto-apply to tab ${tabId}:`, error);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTab(tabId).catch((error) => {
    console.warn(`Failed to clean up tab ${tabId}:`, error);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  windowSettings.delete(windowId);

  for (const [tabId, mappedWindowId] of tabToWindow.entries()) {
    if (mappedWindowId === windowId) {
      cleanupTab(tabId).catch((error) => {
        console.warn(`Failed to release tab ${tabId} for removed window ${windowId}:`, error);
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => {
      console.error("Message handler error:", error);
      sendResponse({ ok: false, error: error?.message || "Unknown error" });
    });

  return true;
});

async function initialize() {
  const saved = await chrome.storage.local.get(["globalSettings"]);
  const persisted = saved.globalSettings || {};
  globalSettings = {
    volume: sanitizeVolume(persisted.volume ?? DEFAULT_SETTINGS.volume),
    muted: Boolean(persisted.muted ?? DEFAULT_SETTINGS.muted)
  };
}

async function handleMessage(message, sender) {
  const type = message?.type;
  if (!type) {
    throw new Error("Missing message type.");
  }

  if (type === "GET_STATE") {
    const windowId = await resolveWindowId(message, sender);
    const state = getWindowState(windowId);
    return {
      state: {
        windowId,
        volume: state.volume,
        muted: state.muted
      }
    };
  }

  if (type === "APPLY_TO_WINDOW") {
    const windowId = await resolveWindowId(message, sender);
    const result = await applyToWindow(windowId);
    return {
      windowId,
      ...result
    };
  }

  if (type === "SET_VOLUME") {
    const windowId = await resolveWindowId(message, sender);
    const volume = sanitizeVolume(message.volume);
    const state = getWindowState(windowId);
    state.volume = volume;
    state.muted = volume === 0;
    globalSettings.volume = volume;
    globalSettings.muted = state.muted;
    await persistGlobalSettings();
    const result = await applyToWindow(windowId);
    return {
      windowId,
      volume: state.volume,
      muted: state.muted,
      ...result
    };
  }

  if (type === "SET_MUTED") {
    const windowId = await resolveWindowId(message, sender);
    const muted = Boolean(message.muted);
    const state = getWindowState(windowId);
    state.muted = muted;
    if (muted) {
      state.volume = 0;
      globalSettings.volume = 0;
    }
    globalSettings.muted = muted;
    await persistGlobalSettings();
    const result = await applyToWindow(windowId);
    return {
      windowId,
      volume: state.volume,
      muted: state.muted,
      ...result
    };
  }

  throw new Error(`Unsupported message type: ${type}`);
}

function getWindowState(windowId) {
  if (!windowSettings.has(windowId)) {
    windowSettings.set(windowId, {
      volume: sanitizeVolume(globalSettings.volume),
      muted: Boolean(globalSettings.muted)
    });
  }

  return windowSettings.get(windowId);
}

function sanitizeVolume(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return DEFAULT_SETTINGS.volume;
  }

  return Math.max(0, Math.min(200, Math.round(num)));
}

async function persistGlobalSettings() {
  await chrome.storage.local.set({
    globalSettings: {
      volume: sanitizeVolume(globalSettings.volume),
      muted: Boolean(globalSettings.muted)
    }
  });
}

async function resolveWindowId(message, sender) {
  if (typeof message?.windowId === "number") {
    return message.windowId;
  }

  if (typeof sender?.tab?.windowId === "number") {
    return sender.tab.windowId;
  }

  const currentWindow = await chrome.windows.getCurrent();
  if (typeof currentWindow?.id !== "number") {
    throw new Error("Unable to resolve current window id.");
  }

  return currentWindow.id;
}

async function applyToWindow(windowId) {
  const state = getWindowState(windowId);
  const tabs = await chrome.tabs.query({ windowId });

  let attachedCount = 0;
  let skippedCount = 0;

  for (const tab of tabs) {
    if (!isTabCapturable(tab)) {
      skippedCount += 1;
      continue;
    }

    const applied = await applyToTab(tab, state);
    if (applied) {
      attachedCount += 1;
    } else {
      skippedCount += 1;
    }
  }

  return {
    attachedCount,
    skippedCount
  };
}

async function applyToTab(tab, explicitState) {
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return false;
  }

  if (!isTabCapturable(tab)) {
    return false;
  }

  const state = explicitState || getWindowState(tab.windowId);
  let applied = false;

  // Primary path: apply multiplier control to media elements in the page.
  const domApplied = await applyDomAudioState(tab.id, state);
  if (domApplied) {
    if (attachedTabs.has(tab.id)) {
      await cleanupTab(tab.id);
    }
    return true;
  }

  // Fallback path: tab capture gain control for pages where script injection is unavailable.
  const attached = await ensureTabAttached(tab.id, tab.windowId);
  if (attached) {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      type: "SET_TAB_AUDIO",
      tabId: tab.id,
      volume: state.volume,
      muted: state.muted
    });
    applied = true;
  }

  return applied;
}

async function ensureTabAttached(tabId, windowId) {
  tabToWindow.set(tabId, windowId);
  if (attachedTabs.has(tabId)) {
    return true;
  }

  try {
    await ensureOffscreenDocument();
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    await chrome.runtime.sendMessage({
      type: "ATTACH_TAB_STREAM",
      tabId,
      streamId
    });

    attachedTabs.add(tabId);
    return true;
  } catch (error) {
    console.warn(`Unable to attach tab ${tabId}:`, error);
    attachedTabs.delete(tabId);
    return false;
  }
}

async function cleanupTab(tabId) {
  tabToWindow.delete(tabId);

  if (!attachedTabs.has(tabId)) {
    return;
  }

  attachedTabs.delete(tabId);

  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      type: "RELEASE_TAB_STREAM",
      tabId
    });
  } catch (error) {
    console.warn(`Unable to release stream for tab ${tabId}:`, error);
  }
}

async function applyDomAudioState(tabId, state) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (volume, muted) => {
        const multiplier = Math.max(0, Math.min(2, Number(volume) / 100));
        const muteFlag = Boolean(muted);
        const previousState = window.__edgeVolumeState || { multiplier: 1, muted: false };
        const previousMultiplier = Number(previousState.multiplier) || 1;
        window.__edgeVolumeState = { multiplier, muted: muteFlag };

        const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

        const setEffectiveVolume = (el) => {
          if (!(el instanceof HTMLMediaElement)) {
            return;
          }

          if (typeof el.__edgeVolumeBase !== "number") {
            const derivedBase = previousMultiplier > 0 ? el.volume / previousMultiplier : el.volume;
            el.__edgeVolumeBase = clamp01(derivedBase);
          }

          const base = clamp01(el.__edgeVolumeBase);
          const effective = muteFlag ? 0 : clamp01(base * multiplier);
          el.__edgeApplying = true;
          el.volume = effective;
          el.__edgeApplying = false;

          if (!el.__edgeVolumeListenerInstalled) {
            el.addEventListener("volumechange", () => {
              if (el.__edgeApplying) {
                return;
              }

              const state = window.__edgeVolumeState || { multiplier: 1, muted: false };
              const activeMultiplier = Number(state.multiplier) || 1;
              if (state.muted || activeMultiplier <= 0) {
                return;
              }
              const nextBase = activeMultiplier > 0 ? el.volume / activeMultiplier : el.volume;
              el.__edgeVolumeBase = clamp01(nextBase);
            });
            el.__edgeVolumeListenerInstalled = true;
          }
        };

        const applyToMedia = (root) => {
          const nodes = root.querySelectorAll("audio, video");
          for (const el of nodes) {
            setEffectiveVolume(el);
          }
        };

        applyToMedia(document);

        if (!window.__edgeVolumeObserverInstalled) {
          const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) {
                  continue;
                }

                if (node.matches && node.matches("audio, video")) {
                  setEffectiveVolume(node);
                }

                if (node.querySelectorAll) {
                  applyToMedia(node);
                }
              }
            }
          });

          observer.observe(document.documentElement || document.body, {
            childList: true,
            subtree: true
          });

          window.__edgeVolumeObserverInstalled = true;
          window.__edgeVolumeObserver = observer;
        }
      },
      args: [state.volume, state.muted]
    });

    return true;
  } catch (error) {
    console.warn(`Unable to apply media element state for tab ${tabId}:`, error);
    return false;
  }
}

function isTabCapturable(tab) {
  const url = tab?.url || "";
  if (!url) {
    return false;
  }

  const blockedPrefixes = [
    "edge://",
    "chrome://",
    "chrome-extension://",
    "devtools://",
    "about:"
  ];

  return !blockedPrefixes.some((prefix) => url.startsWith(prefix));
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error("Offscreen API is unavailable.");
  }

  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Apply user-controlled gain and mute across tabs."
  });
}
