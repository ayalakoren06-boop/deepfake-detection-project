chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "scanDeepfake",
    title: "🔍 Check authenticity with DeepFence",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "scanDeepfake") {

    // The user's email is saved by content.js when they log in to the website
    chrome.storage.local.get("userEmail", ({ userEmail }) => {

      if (!userEmail) {
        chrome.tabs.sendMessage(tab.id, { action: "showError", error: "Please log in to the DeepFence website first" });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "showLoading" });

      fetch(info.srcUrl)
        .then(response => response.blob())
        .then(blob => {
          const formData = new FormData();
          formData.append('File', blob, 'image.jpg');
          formData.append('Email', userEmail);

          return fetch('http://localhost:5046/api/scan-image', {
            method: 'POST',
            body: formData
          });
        })
        .then(response => {
          // 403 = the user's scan quota is exceeded
          if (response.status === 403) {
            throw new Error("Scan quota exceeded. Upgrade your plan on the website.");
          }
          if (!response.ok) {
            throw new Error(`Server error (status ${response.status})`);
          }
          return response.json();
        })
        .then(data => {
          chrome.tabs.sendMessage(tab.id, { action: "showResult", data: data });
        })
        .catch(error => {
          console.error("Network Error: ", error);
          // TypeError = network failure (server is down or the image could not be downloaded)
          const message = error instanceof TypeError ? "Could not connect to the analysis server." : error.message;
          chrome.tabs.sendMessage(tab.id, { action: "showError", error: message });
        });
    });
  }
});
