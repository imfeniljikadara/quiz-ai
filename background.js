// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Quiz Generator installed');
});

// Handle any background tasks or state management here
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveQuiz") {
    // Save quiz to storage
    chrome.storage.local.set({ 
      [`quiz_${Date.now()}`]: request.quiz 
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
}); 