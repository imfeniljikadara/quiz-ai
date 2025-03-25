// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    console.log('Content script: Received request for page content');
    try {
      // Get the main content of the page
      const content = extractPageContent();
      console.log('Content script: Successfully extracted content');
      sendResponse({ content, success: true });
    } catch (error) {
      console.error('Content script: Error extracting content:', error);
      sendResponse({ error: error.message, success: false });
    }
  }
  return true; // Required for asynchronous response
});

function extractPageContent() {
  // Get the main content from the page
  let content = '';
  
  // Try to get content from article tag first
  const article = document.querySelector('article');
  if (article) {
    content = article.innerText;
  }
  
  // If no article content, try to get content from the main tag
  if (!content) {
    const main = document.querySelector('main');
    if (main) {
      content = main.innerText;
    }
  }
  
  // If still no content, try common content containers
  if (!content) {
    const contentContainers = [
      '.content',
      '#content',
      '.main-content',
      '#main-content',
      '.post-content',
      '.article-content',
      '[role="main"]'
    ];
    
    for (const selector of contentContainers) {
      const element = document.querySelector(selector);
      if (element) {
        content = element.innerText;
        break;
      }
    }
  }
  
  // If still no content, get content from the body
  if (!content) {
    // Create a clone of the body to manipulate
    const clone = document.body.cloneNode(true);
    
    // Remove common non-content elements
    const selectorsToRemove = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '#header',
      '#footer',
      '.header',
      '.footer',
      '.nav',
      '.navigation',
      '.sidebar',
      '.ads',
      '.advertisement',
      '.cookie-notice',
      '.popup',
      '.modal'
    ];
    
    selectorsToRemove.forEach(selector => {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(element => element.remove());
    });
    
    content = clone.innerText;
  }

  // Clean up the content
  content = content
    .trim()
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\n\s*\n/g, '\n'); // Replace multiple newlines with single newline
  
  // Throw error if no content found
  if (!content) {
    throw new Error('No content found on the page');
  }

  // Limit content length if too long
  const maxLength = 5000;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '...';
  }

  console.log('Content script: Extracted content length:', content.length);
  return content;
} 