/* Hotel Rate Filler v2 — content.js */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'PING') { sendResponse({ ready: true }); return true; }
});
