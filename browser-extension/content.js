const DEEPFENCE_SITE = "http://localhost:4200";

// Sync the logged-in user from the DeepFence website (runs only on the website)
if (window.location.origin === DEEPFENCE_SITE) {

  // On page load: read the user already saved by the website
  try {
    const savedUser = JSON.parse(localStorage.getItem("user"));
    const email = savedUser?.email || savedUser?.Email;
    if (email) chrome.storage.local.set({ userEmail: email });
    else chrome.storage.local.remove("userEmail");
  } catch (e) {
    chrome.storage.local.remove("userEmail");
  }

  // Live updates: the website posts a message on login / logout
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "DEEPFENCE_USER") return;
    if (event.data.email) chrome.storage.local.set({ userEmail: event.data.email });
    else chrome.storage.local.remove("userEmail");
  });
}

// Remember which image the user right-clicked, so it can be framed during the scan
let scannedImage = null;

document.addEventListener("contextmenu", (event) => {
  if (event.target instanceof HTMLImageElement) scannedImage = event.target;
}, true);

const FRAME_CLASSES = ["wdf-frame-loading", "wdf-frame-real", "wdf-frame-fake"];

function setFrame(type) {
  if (!scannedImage) return;
  scannedImage.classList.remove(...FRAME_CLASSES);
  if (type) scannedImage.classList.add(`wdf-frame-${type}`);
}

// Shows loading / result / error cards sent by background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "showLoading") {
    setFrame("loading");
    showCard("loading", "Analyzing image...");
  }

  else if (request.action === "showResult") {
    if (request.data.status === "error" || request.data.error) {
      setFrame(null);
      showCard("error", request.data.error || "Unsupported image or no clear face found.");
      return;
    }

    const res = request.data.final_decision;
    const type = res.result === "Fake" ? "fake" : "real";

    setFrame(type);
    showCard(type, null, res.confidence);
  }

  else if (request.action === "showError") {
    setFrame(null);
    showCard("error", request.error || "Could not connect to the analysis server.");
  }
});

const SHIELD_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/>
  </svg>`;

let hideTimer = null;

// type: "loading" | "real" | "fake" | "error"
function showCard(type, message, confidence) {
  clearTimeout(hideTimer);
  const existingCard = document.getElementById("wdf-card");
  if (existingCard) existingCard.remove();

  const card = document.createElement("div");
  card.id = "wdf-card";
  card.className = `wdf-card wdf-${type}`;

  let body;
  if (type === "real" || type === "fake") {
    const title = type === "fake"
      ? "This image is likely <span>AI-generated</span>"
      : "This image looks <span>authentic</span>";
    body = `
      <p class="wdf-title">${title}</p>
      <div class="wdf-score">
        <span class="wdf-label">Confidence</span>
        <span class="wdf-value">${confidence}%</span>
      </div>
      <div class="wdf-bar"><i style="width:${confidence}%"></i></div>`;
  } else {
    body = `<p class="wdf-title"></p>`;
    if (type === "loading") body += `<div class="wdf-bar wdf-indeterminate"><i></i></div>`;
  }

  card.innerHTML = `
    <div class="wdf-strip"></div>
    <div class="wdf-top">${SHIELD_ICON}DeepFence</div>
    <div class="wdf-main">${body}</div>`;

  // Plain-text messages (errors come from the server) are inserted as text, not HTML
  if (message) card.querySelector(".wdf-title").textContent = message;

  document.body.appendChild(card);

  // Auto-hide the card and the frame after 5 seconds (except while loading)
  if (type !== "loading") {
    hideTimer = setTimeout(() => {
      card.remove();
      setFrame(null);
    }, 5000);
  }
}
