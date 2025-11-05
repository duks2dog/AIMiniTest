// グローバル変数
let extractedText = '';
let currentQuizType = '';
let currentQuiz = null;

// DOM要素の取得
const imageFileInput = document.getElementById('image-file');
const imageUrlInput = document.getElementById('image-url');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const analyzeBtn = document.getElementById('analyze-btn');
const quizTypeSection = document.getElementById('quiz-type-section');
const extractedTextEl = document.getElementById('extracted-text');
const quizSection = document.getElementById('quiz-section');
const quizContent = document.getElementById('quiz-content');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const newQuizBtn = document.getElementById('new-quiz-btn');
const resultSection = document.getElementById('result-section');
const resultContent = document.getElementById('result-content');
const loading = document.getElementById('loading');

// ローディング表示
function showLoading() {
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

// 画像プレビュー
imageFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            previewImg.src = event.target.result;
            imagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

imageUrlInput.addEventListener('input', (e) => {
    const url = e.target.value;
    if (url) {
        previewImg.src = url;
        imagePreview.classList.remove('hidden');
    }
});

// 画像解析
analyzeBtn.addEventListener('click', async () => {
    let imageUrl = imageUrlInput.value.trim();
    
    // ファイルがアップロードされている場合
    if (imageFileInput.files[0]) {
        const file = imageFileInput.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
            imageUrl = event.target.result;
            await analyzeImage(imageUrl);
        };
        reader.readAsDataURL(file);
    } else if (imageUrl) {
        await analyzeImage(imageUrl);
    } else {
        alert('画像ファイルを選択するか、URLを入力してください');
    }
});

async function analyzeImage(imageUrl) {
    try {
        showLoading();
        
        // Tesseract.js を使ってブラウザ上でOCR実行
        const worker = await Tesseract.createWorker('jpn+eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    console.log(`OCR進捗: ${Math.round(m.progress * 100)}%`);
                }
            }
        });
        
        const result = await worker.recognize(imageUrl);
        await worker.terminate();
        
        hideLoading();
        
        if (result && result.data && result.data.text) {
            extractedText = result.data.text.trim();
            
            if (extractedText.length < 10) {
                alert('テキストが検出できませんでした。画像がぼやけていないか、テキストが含まれているか確認してください。');
                return;
            }
            
            extractedTextEl.textContent = extractedText;
            quizTypeSection.classList.remove('hidden');
            
            // スクロール
            quizTypeSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert('画像からテキストを抽出できませんでした');
        }
    } catch (error) {
        hideLoading();
        console.error('エラー:', error);
        alert('エラーが発生しました: ' + error.message);
    }
}

// 問題タイプ選択
document.querySelectorAll('.quiz-type-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const quizType = btn.dataset.type;
        currentQuizType = quizType;
        await generateQuiz(quizType);
    });
});

// 問題生成
async function generateQuiz(quizType) {
    try {
        showLoading();
        
        const response = await axios.post('/api/generate-quiz', {
            text: extractedText,
            quizType: quizType,
            language: 'ja'
        });
        
        hideLoading();
        
        if (response.data.success) {
            currentQuiz = response.data.quiz;
            displayQuiz(currentQuiz, quizType);
            quizSection.classList.remove('hidden');
            resultSection.classList.add('hidden');
            
            // スクロール
            quizSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert('問題生成に失敗しました: ' + response.data.error);
        }
    } catch (error) {
        hideLoading();
        console.error('エラー:', error);
        alert('エラーが発生しました: ' + (error.response?.data?.error || error.message));
    }
}

// 問題表示
function displayQuiz(quiz, quizType) {
    let html = '';
    
    switch (quizType) {
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

function displayVocabularyQuiz(quiz) {
    let html = '<div class="space-y-8">';
    
    quiz.questions.forEach((q, index) => {
        html += `
            <div class="border-b pb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${index + 1}: 「${q.word}」の意味は？</h3>
                <div class="space-y-2">
        `;
        
        q.options.forEach((option, optionIndex) => {
            html += `
                <label class="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="q${index}" value="${optionIndex}" class="mr-3">
                    <span>${option}</span>
                </label>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

function displayWordOrderQuiz(quiz) {
    let html = '<div class="space-y-8">';
    
    quiz.questions.forEach((q, index) => {
        html += `
            <div class="border-b pb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${index + 1}: 正しい語順に並べ替えてください</h3>
                <div class="mb-4">
                    <div class="flex flex-wrap gap-2">
                        ${q.shuffled.map((word, i) => `
                            <span class="bg-blue-100 text-blue-800 px-3 py-2 rounded-lg cursor-pointer word-chip" 
                                  data-question="${index}" data-word="${word}">
                                ${word}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <div class="bg-gray-50 p-4 rounded-lg min-h-[60px]" id="answer-area-${index}">
                    <p class="text-gray-400 text-sm">ここに単語をドラッグまたはクリックしてください</p>
                </div>
                <input type="hidden" name="wordorder${index}" id="wordorder${index}">
            </div>
        `;
    });
    
    html += '</div>';
    
    // イベントリスナーを後で追加
    setTimeout(() => {
        document.querySelectorAll('.word-chip').forEach(chip => {
            chip.addEventListener('click', function() {
                const questionIndex = this.dataset.question;
                const word = this.dataset.word;
                const answerArea = document.getElementById(`answer-area-${questionIndex}`);
                const hiddenInput = document.getElementById(`wordorder${questionIndex}`);
                
                // 既存の単語を取得
                let currentWords = hiddenInput.value ? hiddenInput.value.split(' ') : [];
                currentWords.push(word);
                
                // 更新
                hiddenInput.value = currentWords.join(' ');
                answerArea.innerHTML = currentWords.map(w => 
                    `<span class="inline-block bg-green-100 text-green-800 px-3 py-2 rounded-lg mr-2 mb-2">${w}</span>`
                ).join('');
                
                // チップを非表示
                this.style.opacity = '0.3';
                this.style.pointerEvents = 'none';
            });
        });
    }, 100);
    
    return html;
}

function displayTranslationQuiz(quiz) {
    let html = '<div class="space-y-8">';
    
    quiz.questions.forEach((q, index) => {
        html += `
            <div class="border-b pb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${index + 1}: 次の文章を翻訳してください</h3>
                <div class="bg-blue-50 p-4 rounded-lg mb-4">
                    <p class="text-gray-800">${q.question}</p>
                </div>
                <textarea name="translation${index}" 
                          class="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" 
                          rows="3" 
                          placeholder="翻訳を入力..."></textarea>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

function displayReadingQuiz(quiz) {
    let html = '<div class="space-y-8">';
    
    quiz.questions.forEach((q, index) => {
        html += `
            <div class="border-b pb-6">
                <h3 class="text-lg font-bold text-gray-800 mb-4">問題 ${index + 1}: 「${q.word}」の正しい発音は？</h3>
                <div class="space-y-2">
        `;
        
        q.options.forEach((option, optionIndex) => {
            html += `
                <label class="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="radio" name="reading${index}" value="${optionIndex}" class="mr-3">
                    <span>${option}</span>
                </label>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// 解答提出
submitAnswerBtn.addEventListener('click', async () => {
    if (!currentQuiz) return;
    
    const userAnswers = collectAnswers();
    await checkAnswers(userAnswers);
});

function collectAnswers() {
    const answers = [];
    
    switch (currentQuizType) {
        case 'vocabulary':
        case 'reading':
            currentQuiz.questions.forEach((q, index) => {
                const selected = document.querySelector(`input[name="${currentQuizType === 'vocabulary' ? 'q' : 'reading'}${index}"]:checked`);
                answers.push({
                    userAnswer: selected ? q.options[parseInt(selected.value)] : '',
                    correctAnswer: q.options[q.correct],
                    questionType: currentQuizType
                });
            });
            break;
            
        case 'word-order':
            currentQuiz.questions.forEach((q, index) => {
                const userAnswer = document.getElementById(`wordorder${index}`).value;
                answers.push({
                    userAnswer: userAnswer,
                    correctAnswer: q.answer,
                    questionType: currentQuizType
                });
            });
            break;
            
        case 'translation':
            currentQuiz.questions.forEach((q, index) => {
                const userAnswer = document.querySelector(`textarea[name="translation${index}"]`).value;
                answers.push({
                    userAnswer: userAnswer,
                    correctAnswer: q.answer,
                    questionType: currentQuizType
                });
            });
            break;
    }
    
    return answers;
}

async function checkAnswers(answers) {
    try {
        showLoading();
        
        const results = [];
        for (const answer of answers) {
            const response = await axios.post('/api/check-answer', answer);
            if (response.data.success) {
                results.push(response.data.result);
            }
        }
        
        hideLoading();
        
        displayResults(results);
        resultSection.classList.remove('hidden');
        resultSection.scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        hideLoading();
        console.error('エラー:', error);
        alert('採点中にエラーが発生しました: ' + (error.response?.data?.error || error.message));
    }
}

function displayResults(results) {
    const totalScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const correctCount = results.filter(r => r.isCorrect).length;
    
    let html = `
        <div class="mb-6 p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg">
            <div class="text-center">
                <h3 class="text-3xl font-bold mb-2">${Math.round(totalScore)}点</h3>
                <p class="text-lg">${correctCount} / ${results.length} 問正解</p>
            </div>
        </div>
        
        <div class="space-y-4">
    `;
    
    results.forEach((result, index) => {
        const bgColor = result.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
        const icon = result.isCorrect ? 'fa-check-circle text-green-600' : 'fa-times-circle text-red-600';
        
        html += `
            <div class="p-4 border-2 rounded-lg ${bgColor}">
                <div class="flex items-center mb-2">
                    <i class="fas ${icon} text-xl mr-2"></i>
                    <span class="font-bold">問題 ${index + 1}</span>
                    <span class="ml-auto text-lg font-bold">${result.score}点</span>
                </div>
                <p class="text-gray-700">${result.feedback}</p>
            </div>
        `;
    });
    
    html += '</div>';
    resultContent.innerHTML = html;
}

// 新しい問題を生成
newQuizBtn.addEventListener('click', () => {
    quizTypeSection.scrollIntoView({ behavior: 'smooth' });
});
