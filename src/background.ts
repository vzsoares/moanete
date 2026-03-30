chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "get-tab-audio") {
    chrome.tabCapture.capture({ audio: true, video: false }, (_stream) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true });
      }
    });
    return true;
  }
});

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "session-start") {
    keepAliveInterval = setInterval(() => {
      // Ping to prevent service worker from dying
    }, 20_000);
  }
  if (msg.type === "session-stop") {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
});
