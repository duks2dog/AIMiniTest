// グローバル変数
let extractedText = '';
let currentQuizType = '';
let currentQuiz = null;

// DOM要素
const imageUrlInput = document.getElementById('image-url');
const imageFileInput = document.getElementById('image-file');
const analyzeBtn = document.getElementById('analyze-btn');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const quizTypeSection = document.getElementById('quiz-type-section');
const extractedTextEl = document.getElementById('extracted-text');
const quizSection = document.getElementById('quiz-section');
const quizContent = document.getElementById('quiz-content');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const newQuizBtn = document.getElementById('new-quiz-btn');
const resultSection = document.getElementById('result-section');
const resultContent = document.getElementById('result-content');
const loading = document.getElementById('loading');

// 画像ファイル選択時
imageFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imageUrlInput.value = e.target.result;
      previewImg.src = e.target.result;
      imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
});

// 画像URL入力時
imageUrlInput.addEventListener('input', (e) => {
  const url = e.target.value;
  if (url) {
    previewImg.src = url;
    imagePreview.classList.remove('hidden');
  } else {
    imagePreview.classList.add('hidden');
  }
});

// 画像解析ボタン
analyzeBtn.addEventListener('click', async () => {
  const imageUrl = imageUrlInput.value;
  
  if (!imageUrl) {
    alert('画像URLを入力するか、画像ファイルを選択してください');
    return;
  }

  showLoading(true);
  
  try {
    const response = await axios.post('/api/analyze-image', {
      imageUrl: imageUrl
    });

    if (response.data.success) {
      extractedText = response.data.text;
      extractedTextEl.textContent = extractedText;
      quizTypeSection.classList.remove('hidden');
      
      // スムーズにスクロール
      quizTypeSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert('画像解析に失敗しました: ' + (response.data.error || '不明なエラー'));
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('画像解析中にエラーが発生しました: ' + (error.response?.data?.error || error.message));
  } finally {
    showLoading(false);
  }
});

// 問題タイプ選択
document.querySelectorAll('.quiz-type-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    currentQuizType = btn.dataset.type;
    await generateQuiz();
  });
});

// 問題生成
async function generateQuiz() {
  if (!extractedText) {
    alert('先に画像を解析してください');
    return;
  }

  showLoading(true);
  
  try {
    const response = await axios.post('/api/generate-quiz', {
      text: extractedText,
      quizType: currentQuizType,
      language: 'ja'
    });

    if (response.data.success) {
      currentQuiz = response.data.quiz;
      displayQuiz(currentQuiz, currentQuizType);
      quizSection.classList.remove('hidden');
      resultSection.classList.add('hidden');
      
      // スムーズにスクロール
      quizSection.scrollIntoView({ behavior: 'smooth' });
    } else {
      alert('問題生成に失敗しました: ' + (response.data.error || '不明なエラー'));
      console.log('Raw response:', response.data.raw);
    }
  } catch (error) {
    console.error('エラー:', error);
    alert('問題生成中にエラーが発生しました: ' + (error.response?.data?.error || error.message));
  } finally {
    showLoading(false);
  }
}

// 問題表示
function displayQuiz(quiz, type) {
  let html = '';
  
  switch (type) {
    case 'vocabulary':
      html = displayVocabularyQuiz(quiz);
      break;
    case 'word-order':
      html = displayWordOrderQuiz(quiz);
      break;
    case 'translation':
      html = displayTranslationQuiz(quiz);
      break;
    case 'reading':
      html = displayReadingQuiz(quiz);
      break;
  }
  
  quizContent.innerHTML = html;
}

// 単語問題表示
function displayVocabularyQuiz(quiz) {
  if (!quiz.questions || quiz.questions.length === 0) {
    return '<p class="text-red-500">問題が生成されませんでした</p>';
  }
  
  let html = '';
  quiz.questions.forEach((q, idx) => {
    html += `
      <div class="mb-8 p-6 bg-gray-50 rounded-lg">
        <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${idx + 1}: "${q.word}" の意味は？</h3>
        <div class="space-y-2">
          ${q.options.map((opt, optIdx) => `
            <label class="flex items-center p-3 bg-white rounded-lg hover:bg-indigo-50 cursor-pointer transition">
              <input type="radio" name="vocab-${idx}" value="${optIdx}" class="mr-3">
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  return html;
}

// 語順並べ替え問題表示
function displayWordOrderQuiz(quiz) {
  if (!quiz.questions || quiz.questions.length === 0) {
    return '<p class="text-red-500">問題が生成されませんでした</p>';
  }
  
  let html = '';
  quiz.questions.forEach((q, idx) => {
    html += `
      <div class="mb-8 p-6 bg-gray-50 rounded-lg">
        <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${idx + 1}: 語順を並べ替えてください</h3>
        <p class="mb-4 text-gray-600">元の文章: <span class="font-semibold">${q.original}</span></p>
        <div class="mb-4 flex flex-wrap gap-2">
          ${q.shuffled.map((word, wordIdx) => `
            <span class="px-3 py-2 bg-white border-2 border-gray-300 rounded-lg cursor-move" draggable="true" data-word="${word}">
              ${word}
            </span>
          `).join('')}
        </div>
        <textarea id="word-order-${idx}" rows="2" 
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="並べ替えた文章を入力..."></textarea>
      </div>
    `;
  });
  
  return html;
}

// 翻訳問題表示
function displayTranslationQuiz(quiz) {
  if (!quiz.questions || quiz.questions.length === 0) {
    return '<p class="text-red-500">問題が生成されませんでした</p>';
  }
  
  let html = '';
  quiz.questions.forEach((q, idx) => {
    html += `
      <div class="mb-8 p-6 bg-gray-50 rounded-lg">
        <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${idx + 1}: 次の文を翻訳してください</h3>
        <p class="mb-4 text-lg text-gray-700 font-semibold">${q.question}</p>
        <textarea id="translation-${idx}" rows="3" 
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="翻訳を入力..."></textarea>
      </div>
    `;
  });
  
  return html;
}

// 読み当て問題表示
function displayReadingQuiz(quiz) {
  if (!quiz.questions || quiz.questions.length === 0) {
    return '<p class="text-red-500">問題が生成されませんでした</p>';
  }
  
  let html = '';
  quiz.questions.forEach((q, idx) => {
    html += `
      <div class="mb-8 p-6 bg-gray-50 rounded-lg">
        <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${idx + 1}: "${q.word}" の正しい発音は？</h3>
        <div class="space-y-2">
          ${q.options.map((opt, optIdx) => `
            <label class="flex items-center p-3 bg-white rounded-lg hover:bg-indigo-50 cursor-pointer transition">
              <input type="radio" name="reading-${idx}" value="${optIdx}" class="mr-3">
              <span>${opt}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  return html;
}

// 解答提出
submitAnswerBtn.addEventListener('click', async () => {
  if (!currentQuiz) {
    alert('問題が読み込まれていません');
    return;
  }

  const answers = collectAnswers();
  
  if (!answers || answers.length === 0) {
    alert('解答を入力してください');
    return;
  }

  showLoading(true);
  
  try {
    const results = [];
    
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      const correctAnswer = getCorrectAnswer(i);
      
      const response = await axios.post('/api/check-answer', {
        userAnswer: answer,
        correctAnswer: correctAnswer,
        questionType: currentQuizType
      });
      
      if (response.data.success) {
        results.push(response.data.result);
      } else {
        results.push({
          isCorrect: false,
          score: 0,
          feedback: '採点に失敗しました'
        });
      }
    }
    
    displayResults(results, answers);
    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth' });
    
  } catch (error) {
    console.error('エラー:', error);
    alert('採点中にエラーが発生しました: ' + (error.response?.data?.error || error.message));
  } finally {
    showLoading(false);
  }
});

// 解答収集
function collectAnswers() {
  const answers = [];
  
  switch (currentQuizType) {
    case 'vocabulary':
    case 'reading':
      currentQuiz.questions.forEach((q, idx) => {
        const selected = document.querySelector(`input[name="${currentQuizType === 'vocabulary' ? 'vocab' : 'reading'}-${idx}"]:checked`);
        if (selected) {
          answers.push(q.options[parseInt(selected.value)]);
        }
      });
      break;
      
    case 'word-order':
      currentQuiz.questions.forEach((q, idx) => {
        const input = document.getElementById(`word-order-${idx}`);
        if (input && input.value.trim()) {
          answers.push(input.value.trim());
        }
      });
      break;
      
    case 'translation':
      currentQuiz.questions.forEach((q, idx) => {
        const input = document.getElementById(`translation-${idx}`);
        if (input && input.value.trim()) {
          answers.push(input.value.trim());
        }
      });
      break;
  }
  
  return answers;
}

// 正解取得
function getCorrectAnswer(index) {
  const question = currentQuiz.questions[index];
  
  switch (currentQuizType) {
    case 'vocabulary':
    case 'reading':
      return question.options[question.correct];
      
    case 'word-order':
    case 'translation':
      return question.answer;
      
    default:
      return '';
  }
}

// 結果表示
function displayResults(results, userAnswers) {
  const totalScore = results.reduce((sum, r) => sum + (r.score || 0), 0);
  const averageScore = Math.round(totalScore / results.length);
  const correctCount = results.filter(r => r.isCorrect).length;
  
  let html = `
    <div class="mb-6 p-6 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg">
      <h3 class="text-2xl font-bold mb-2">総合スコア: ${averageScore}点</h3>
      <p class="text-lg">正解数: ${correctCount} / ${results.length}</p>
    </div>
    
    <div class="space-y-4">
  `;
  
  results.forEach((result, idx) => {
    const question = currentQuiz.questions[idx];
    const isCorrect = result.isCorrect;
    
    html += `
      <div class="p-4 rounded-lg ${isCorrect ? 'bg-green-50 border-2 border-green-300' : 'bg-red-50 border-2 border-red-300'}">
        <div class="flex items-center mb-2">
          <i class="fas ${isCorrect ? 'fa-check-circle text-green-600' : 'fa-times-circle text-red-600'} text-2xl mr-3"></i>
          <h4 class="text-lg font-bold text-gray-800">問題 ${idx + 1}</h4>
        </div>
        <p class="text-gray-700 mb-2"><strong>あなたの解答:</strong> ${userAnswers[idx]}</p>
        <p class="text-gray-700 mb-2"><strong>正解:</strong> ${getCorrectAnswer(idx)}</p>
        <p class="text-gray-600"><strong>評価:</strong> ${result.feedback || 'フィードバックなし'}</p>
        ${question.explanation ? `<p class="text-gray-600 mt-2"><strong>解説:</strong> ${question.explanation}</p>` : ''}
      </div>
    `;
  });
  
  html += '</div>';
  
  resultContent.innerHTML = html;
}

// 新しい問題生成
newQuizBtn.addEventListener('click', async () => {
  await generateQuiz();
});

// ローディング表示
function showLoading(show) {
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}
