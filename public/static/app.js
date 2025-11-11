// グローバル変数
let extractedText = '';
let currentQuizType = '';
let currentQuiz = null;

// DOM要素の取得
const apiKeyInput = document.getElementById('api-key-input');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const apiKeyStatus = document.getElementById('api-key-status');
const subjectType = document.getElementById('subject-type');
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

// API設定の管理
let API_MODE = localStorage.getItem('api_mode') || 'gemini'; // 'gemini' or 'vertex'
let GEMINI_API_KEY = localStorage.getItem('gemini_api_key') || '';
let GCP_PROJECT_ID = localStorage.getItem('gcp_project_id') || '';
let GCP_LOCATION = localStorage.getItem('gcp_location') || 'us-central1';
let GCP_ACCESS_TOKEN = localStorage.getItem('gcp_access_token') || '';

// DOM要素を取得
const tabGemini = document.getElementById('tab-gemini');
const tabVertex = document.getElementById('tab-vertex');
const geminiConfig = document.getElementById('gemini-config');
const vertexConfig = document.getElementById('vertex-config');
const gcpProjectIdInput = document.getElementById('gcp-project-id');
const gcpLocationInput = document.getElementById('gcp-location');
const gcpAccessTokenInput = document.getElementById('gcp-access-token');
const saveVertexBtn = document.getElementById('save-vertex-btn');
const vertexStatus = document.getElementById('vertex-status');

// タブ切り替え
tabGemini.addEventListener('click', () => {
    API_MODE = 'gemini';
    localStorage.setItem('api_mode', 'gemini');
    tabGemini.className = 'px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold';
    tabVertex.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm';
    geminiConfig.classList.remove('hidden');
    vertexConfig.classList.add('hidden');
});

tabVertex.addEventListener('click', () => {
    API_MODE = 'vertex';
    localStorage.setItem('api_mode', 'vertex');
    tabVertex.className = 'px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold';
    tabGemini.className = 'px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm';
    vertexConfig.classList.remove('hidden');
    geminiConfig.classList.add('hidden');
});

// 初期化時に設定を読み込む
if (GEMINI_API_KEY) {
    apiKeyInput.value = GEMINI_API_KEY;
    apiKeyStatus.innerHTML = '<span class="text-green-600">✓ 保存済み</span>';
}

if (GCP_PROJECT_ID) {
    gcpProjectIdInput.value = GCP_PROJECT_ID;
    gcpLocationInput.value = GCP_LOCATION;
    gcpAccessTokenInput.value = GCP_ACCESS_TOKEN;
    vertexStatus.innerHTML = '<span class="text-green-600">✓ 保存済み</span>';
}

// 初期表示を設定
if (API_MODE === 'vertex') {
    tabVertex.click();
} else {
    tabGemini.click();
}

// Gemini APIキーを保存
saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key && key.startsWith('AIzaSy')) {
        localStorage.setItem('gemini_api_key', key);
        GEMINI_API_KEY = key;
        apiKeyStatus.innerHTML = '<span class="text-green-600">✓ 保存しました！</span>';
    } else {
        apiKeyStatus.innerHTML = '<span class="text-red-600">✗ 無効なAPIキーです</span>';
    }
});

// Vertex AI設定を保存
saveVertexBtn.addEventListener('click', () => {
    const projectId = gcpProjectIdInput.value.trim();
    const location = gcpLocationInput.value.trim();
    const accessToken = gcpAccessTokenInput.value.trim();
    
    if (projectId && accessToken) {
        localStorage.setItem('gcp_project_id', projectId);
        localStorage.setItem('gcp_location', location || 'us-central1');
        localStorage.setItem('gcp_access_token', accessToken);
        GCP_PROJECT_ID = projectId;
        GCP_LOCATION = location || 'us-central1';
        GCP_ACCESS_TOKEN = accessToken;
        vertexStatus.innerHTML = '<span class="text-green-600">✓ 保存しました！</span>';
    } else {
        vertexStatus.innerHTML = '<span class="text-red-600">✗ プロジェクトIDとトークンが必要です</span>';
    }
});

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
        
        // 画像をBase64に変換
        let base64Data = '';
        let mimeType = 'image/png';
        
        if (imageUrl.startsWith('data:')) {
            // すでにBase64形式
            const parts = imageUrl.split(',');
            base64Data = parts[1];
            mimeType = parts[0].split(':')[1].split(';')[0];
        } else {
            // URLから画像を取得してBase64に変換
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            base64Data = btoa(String.fromCharCode.apply(null, bytes));
            mimeType = blob.type;
        }
        
        // Google Gemini API を使用して画像解析
        if (!GEMINI_API_KEY) {
            hideLoading();
            alert('Gemini APIキーを設定してください。上部の設定エリアからAPIキーを入力してください。');
            return;
        }
        
        // 学習内容に応じたプロンプトを生成
        const subject = subjectType.value;
        const subjectPrompts = {
            'english': 'この英語の教科書・テキストブック・ノート・プリントの画像から、すべての英文とその日本語訳、単語、フレーズを正確に読み取ってください。',
            'chinese': 'この中国語の教科書・テキストブック・ノート・プリントの画像から、すべての中国語の文章、ピンイン、日本語訳を正確に読み取ってください。漢字、簡体字、繁体字すべて対応してください。',
            'japanese': 'この日本語（国語）の教科書・テキストブック・ノート・プリントの画像から、すべての文章、漢字の読み方、文法説明を正確に読み取ってください。',
            'korean': 'この韓国語の教科書・テキストブック・ノート・プリントの画像から、すべてのハングル文字、日本語訳、発音を正確に読み取ってください。',
            'french': 'このフランス語の教科書・テキストブック・ノート・プリントの画像から、すべてのフランス語の文章と日本語訳を正確に読み取ってください。',
            'german': 'このドイツ語の教科書・テキストブック・ノート・プリントの画像から、すべてのドイツ語の文章と日本語訳を正確に読み取ってください。',
            'spanish': 'このスペイン語の教科書・テキストブック・ノート・プリントの画像から、すべてのスペイン語の文章と日本語訳を正確に読み取ってください。',
            'math': 'この数学の教科書・テキストブック・ノート・プリントの画像から、すべての数式、計算式、問題文、解説を正確に読み取ってください。数式はLaTeX形式またはテキスト形式で出力してください。',
            'science': 'この理科の教科書・テキストブック・ノート・プリントの画像から、すべての文章、図の説明、化学式、実験手順を正確に読み取ってください。',
            'history': 'この歴史・社会の教科書・テキストブック・ノート・プリントの画像から、すべての文章、年表、地名、人名、出来事を正確に読み取ってください。',
            'other': 'この教科書・テキストブック・ノート・プリントの画像から、すべてのテキスト内容を正確に読み取ってください。日本語はそのまま日本語で、外国語はそのまま抽出してください。'
        };
        
        const prompt = subjectPrompts[subject] || subjectPrompts['other'];
        
        const apiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: prompt + '\n\n図や表の説明も含めてください。数式がある場合は数式も含めてください。元の言語のまま、正確に抽出してください。'
                            },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64Data
                                }
                            }
                        ]
                    }]
                })
            }
        );
        
        const data = await apiResponse.json();
        
        hideLoading();
        
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            extractedText = data.candidates[0].content.parts[0].text.trim();
            
            if (extractedText.length < 10) {
                alert('テキストが検出できませんでした。画像がぼやけていないか、テキストが含まれているか確認してください。');
                return;
            }
            
            extractedTextEl.textContent = extractedText;
            quizTypeSection.classList.remove('hidden');
            
            // スクロール
            quizTypeSection.scrollIntoView({ behavior: 'smooth' });
        } else if (data.error) {
            alert('AI画像解析に失敗しました: ' + data.error.message);
        } else {
            alert('画像からテキストを抽出できませんでした。もう一度試してください。');
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
        await generateQuizFromImage(quizType);
    });
});

// 画像から直接問題を生成（OCRスキップ）
async function generateQuizFromImage(quizType) {
    try {
        showLoading();
        
        // 画像データを取得（すでにanalyzeImage時に保存されている想定）
        const imageData = previewImg.src;
        
        if (!imageData) {
            hideLoading();
            alert('画像がアップロードされていません');
            return;
        }
        
        if (!GEMINI_API_KEY) {
            hideLoading();
            alert('Gemini APIキーを設定してください');
            return;
        }
        
        // 画像をBase64に変換
        let base64Data = '';
        let mimeType = 'image/png';
        
        if (imageData.startsWith('data:')) {
            const parts = imageData.split(',');
            base64Data = parts[1];
            mimeType = parts[0].split(':')[1].split(';')[0];
        }
        
        // 学習内容の種類を取得
        const subject = subjectType.value;
        const subjectNames = {
            'english': '英語',
            'chinese': '中国語',
            'japanese': '日本語',
            'korean': '韓国語',
            'french': 'フランス語',
            'german': 'ドイツ語',
            'spanish': 'スペイン語',
            'math': '数学',
            'science': '理科',
            'history': '歴史',
            'other': ''
        };
        
        // 問題タイプに応じたプロンプト
        let prompt = '';
        switch(quizType) {
            case 'vocabulary':
                prompt = `この${subjectNames[subject]}の教科書画像を見て、重要な単語・用語を20個抽出し、4択問題を作成してください。

必ずJSON形式のみで以下のように出力してください：
{
  "questions": [
    {
      "word": "単語",
      "options": ["正解", "不正解1", "不正解2", "不正解3"],
      "correct": 0,
      "explanation": "詳しい解説"
    }
  ]
}

20問作成してください。`;
                break;
                
            case 'word-order':
                prompt = `この${subjectNames[subject]}の教科書画像を見て、文章を20個選び、語順並べ替え問題を作成してください。

必ずJSON形式のみで以下のように出力してください：
{
  "questions": [
    {
      "original": "元の文章",
      "shuffled": ["単語1", "単語2", "単語3"],
      "answer": "元の文章",
      "explanation": "文法解説"
    }
  ]
}

20問作成してください。`;
                break;
                
            case 'translation':
                prompt = `この${subjectNames[subject]}の教科書画像を見て、重要な文章を20個選び、翻訳問題を作成してください。

必ずJSON形式のみで以下のように出力してください：
{
  "questions": [
    {
      "question": "翻訳する文章",
      "answer": "模範解答",
      "explanation": "翻訳のポイント"
    }
  ]
}

20問作成してください。`;
                break;
                
            case 'reading':
                prompt = `この${subjectNames[subject]}の教科書画像を見て、重要な単語を20個選び、発音・アクセント問題を作成してください。

必ずJSON形式のみで以下のように出力してください：
{
  "questions": [
    {
      "word": "単語",
      "options": ["正しい発音", "誤り1", "誤り2", "誤り3"],
      "correct": 0,
      "explanation": "発音のポイント"
    }
  ]
}

20問作成してください。`;
                break;
        }
        
        // Gemini APIに画像と一緒にリクエスト
        const apiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: mimeType,
                                    data: base64Data
                                }
                            }
                        ]
                    }]
                })
            }
        );
        
        const data = await apiResponse.json();
        
        hideLoading();
        
        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            let content = data.candidates[0].content.parts[0].text;
            
            // JSONを抽出
            content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                currentQuiz = JSON.parse(jsonMatch[0]);
                displayQuiz(currentQuiz, quizType);
                quizSection.classList.remove('hidden');
                resultSection.classList.add('hidden');
                quizSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('問題生成に失敗しました。もう一度試してください。');
            }
        } else {
            alert('問題生成に失敗しました: ' + (data.error?.message || '不明なエラー'));
        }
        
    } catch (error) {
        hideLoading();
        console.error('エラー:', error);
        alert('エラーが発生しました: ' + error.message);
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
