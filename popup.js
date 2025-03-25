document.addEventListener('DOMContentLoaded', function() {
  const generateBtn = document.getElementById('generateBtn');
  const loadingDiv = document.getElementById('loading');
  const quizContainer = document.getElementById('quizContainer');
  
  generateBtn.addEventListener('click', async () => {
    const quizType = document.getElementById('quizType').value;
    const difficulty = document.getElementById('difficulty').value;
    const questionCount = document.getElementById('questionCount').value;
    
    // Show loading state
    loadingDiv.classList.add('active');
    generateBtn.disabled = true;
    quizContainer.style.display = 'none';
    
    try {
      console.log('Popup: Getting current tab...');
      // Get the current tab's content
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      console.log('Popup: Injecting content script...');
      // Ensure content script is injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('Popup: Content script injected successfully');
      } catch (error) {
        console.log('Popup: Content script already injected or injection failed:', error);
        // Continue anyway as the content script might already be there
      }

      console.log('Popup: Sending message to content script...');
      // Send message to content script to get page content
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: "getPageContent" }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Popup: Chrome runtime error:', chrome.runtime.lastError);
            resolve({ error: chrome.runtime.lastError.message, success: false });
          } else {
            resolve(response);
          }
        });
      });

      console.log('Popup: Received response from content script:', response);
      if (!response) {
        throw new Error('No response from content script. Make sure the extension has permission to access the page.');
      }

      if (!response.success) {
        throw new Error(response.error || 'Failed to get page content');
      }

      if (!response.content) {
        throw new Error('No content found on the page');
      }

      console.log('Popup: Generating quiz...');
      // Generate quiz using the API
      const quiz = await generateQuiz(response.content, {
        type: quizType,
        difficulty: difficulty,
        count: parseInt(questionCount)
      });
      
      console.log('Popup: Displaying quiz...');
      // Display the quiz
      displayQuiz(quiz);
    } catch (error) {
      console.error('Popup: Error:', error);
      showError(error.message);
    } finally {
      loadingDiv.classList.remove('active');
      generateBtn.disabled = false;
    }
  });
});

async function generateQuiz(content, options) {
  console.log('Popup: Calling Gemini API...');
  // Using Google's Gemini 1.5 Pro API
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';
  const API_KEY = 'Paste your api key here'; // Replace with your API key from Google AI Studio
  
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('Please add your Google API key in popup.js');
  }

  const prompt = {
    contents: [{
      parts: [{
        text: `You are a quiz generator. Generate a ${options.type} quiz with ${options.count} questions at ${options.difficulty} level about the following content. Return ONLY a JSON array where each question object has: "question", "options" (for multiple choice), and "correct_answer" fields. Do not include any other text, markdown formatting, or explanation - just the raw JSON array.

Content to generate quiz from:
${content}`
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prompt)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('Popup: Received API response:', result);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    if (!result.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response format from API');
    }

    const generatedText = result.candidates[0].content.parts[0].text;
    return parseQuizResponse(generatedText);
  } catch (error) {
    console.error('Popup: Error calling Gemini API:', error);
    throw new Error(`Failed to generate quiz: ${error.message}`);
  }
}

function parseQuizResponse(text) {
  console.log('Popup: Parsing quiz response...');
  try {
    // Clean up the text - remove markdown code blocks if present
    let cleanText = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
    
    // If the text starts with a [ and ends with ], assume it's a JSON array
    if (cleanText.startsWith('[') && cleanText.endsWith(']')) {
      const questions = JSON.parse(cleanText);
      return questions.map((q, index) => ({
        id: index + 1,
        ...q
      }));
    } else {
      // Try to find a JSON array within the text
      const match = cleanText.match(/\[[\s\S]*\]/);
      if (match) {
        const questions = JSON.parse(match[0]);
        return questions.map((q, index) => ({
          id: index + 1,
          ...q
        }));
      }
    }
    throw new Error('No valid JSON found in response');
  } catch (error) {
    console.error('Popup: Error parsing quiz response:', error);
    // Fallback to simple text parsing if JSON parsing fails
    const questions = text.split('\n\n').filter(q => q.trim());
    return questions.map((q, index) => ({
      id: index + 1,
      question: q.trim(),
      options: [],
      correct_answer: ''
    }));
  }
}

function showError(message) {
  const quizContainer = document.getElementById('quizContainer');
  quizContainer.innerHTML = `
    <div class="bg-red-50 border-l-4 border-red-500 p-4" style="font-family: 'SF Pro Text', -apple-system, BlinkMacSystemFont, Roboto, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm text-red-700">${message}</p>
        </div>
      </div>
    </div>
  `;
  quizContainer.style.display = 'block';
}

function displayQuiz(quiz) {
  console.log('Popup: Displaying quiz:', quiz);
  const quizContainer = document.getElementById('quizContainer');
  
  const quizHTML = `
    <div class="p-4" style="font-family: 'SF Pro Text', -apple-system, BlinkMacSystemFont, Roboto, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';">
      <h2 class="text-xl font-bold mb-4 text-indigo-600">Your Quiz</h2>
      <form id="quizForm" class="space-y-6">
        ${quiz.map((q, questionIndex) => `
          <div class="bg-white rounded-lg shadow p-6 quiz-question">
            <div class="mb-4">
              <h3 class="text-lg font-semibold text-gray-800">
                Question ${questionIndex + 1}
              </h3>
              <p class="mt-2 text-gray-600">${q.question}</p>
            </div>
            
            ${q.options ? `
              <div class="space-y-3">
                ${q.options.map((option, optionIndex) => `
                  <div class="flex items-center">
                    <input 
                      type="radio" 
                      id="q${questionIndex}_${optionIndex}"
                      name="question${questionIndex}"
                      value="${option}"
                      class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                    >
                    <label for="q${questionIndex}_${optionIndex}" class="ml-3 text-gray-700">
                      ${option}
                    </label>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
        
        <div class="flex justify-between items-center mt-6">
          <button 
            type="submit"
            class="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Submit Quiz
          </button>
          <button 
            type="button"
            id="showAnswers"
            class="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Show Answers
          </button>
        </div>
      </form>
    </div>
  `;
  
  quizContainer.innerHTML = quizHTML;
  quizContainer.style.display = 'block';

  // Add event listeners for the buttons
  const quizForm = document.getElementById('quizForm');
  const showAnswersButton = document.getElementById('showAnswers');

  quizForm.addEventListener('submit', (e) => {
    e.preventDefault();
    checkAnswers(quiz);
  });

  showAnswersButton.addEventListener('click', () => {
    displayAnswers(quiz);
  });
}

function checkAnswers(quiz) {
  let score = 0;
  const total = quiz.length;

  quiz.forEach((q, index) => {
    const selectedOption = document.querySelector(`input[name="question${index}"]:checked`);
    if (selectedOption && selectedOption.value === q.correct_answer) {
      score++;
    }
  });

  const percentage = (score / total) * 100;
  
  // Display the score
  const quizContainer = document.getElementById('quizContainer');
  quizContainer.insertAdjacentHTML('afterbegin', `
    <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-4" style="font-family: 'SF Pro Text', -apple-system, BlinkMacSystemFont, Roboto, 'Segoe UI', Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm text-green-700">
            Your score: ${score} out of ${total} (${percentage.toFixed(1)}%)
          </p>
        </div>
      </div>
    </div>
  `);
}

function displayAnswers(quiz) {
  quiz.forEach((q, index) => {
    const questionDiv = document.querySelector(`#quizForm .quiz-question:nth-child(${index + 1})`);
    
    // Add the correct answer display
    questionDiv.insertAdjacentHTML('beforeend', `
      <div class="mt-4 pt-4 border-t border-gray-200">
        <p class="text-green-600 font-medium">
          Correct answer: ${q.correct_answer}
        </p>
      </div>
    `);

    // Highlight the correct and incorrect options
    const options = questionDiv.querySelectorAll('input[type="radio"]');
    options.forEach(option => {
      const label = option.nextElementSibling;
      if (option.value === q.correct_answer) {
        label.classList.add('text-green-600', 'font-medium');
      }
    });
  });
} 