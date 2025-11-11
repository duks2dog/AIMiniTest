import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  AI?: any
  GEMINI_API_KEY?: string
  GCP_PROJECT_ID?: string
  GCP_LOCATION?: string
  GCP_SERVICE_ACCOUNT_KEY?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの配信
app.use('/static/*', serveStatic({ root: './public' }))

// AI画像解析API - 画像をBase64で受け取り、専用エンドポイントで処理
app.post('/api/analyze-image', async (c) => {
  try {
    const { imageUrl } = await c.req.json()
    
    if (!imageUrl) {
      return c.json({ error: '画像URLが必要です' }, 400)
    }

    // 画像を取得してBase64エンコード
    let base64Image = imageUrl
    if (!imageUrl.startsWith('data:')) {
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        return c.json({ error: '画像の取得に失敗しました' }, 400)
      }
      const imageBlob = await imageResponse.blob()
      const imageBuffer = await imageBlob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))
      base64Image = `data:${imageBlob.type};base64,${base64}`
    }

    // AI Vision APIエンドポイントに転送（フロントエンドから直接呼び出す用）
    return c.json({ 
      success: true,
      imageData: base64Image,
      // フロントエンドでAI APIを呼び出せるようにデータを返す
      message: 'AI処理が必要です。/api/vision エンドポイントを使用してください。'
    })
    
  } catch (error) {
    console.error('画像解析エラー:', error)
    return c.json({ 
      error: '画像解析に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// Vertex AI画像解析エンドポイント
app.post('/api/vertex-analyze', async (c) => {
  try {
    const { imageData, projectId, location, serviceAccountKey } = await c.req.json()
    
    if (!imageData || !projectId || !serviceAccountKey) {
      return c.json({ error: '画像データ、プロジェクトID、サービスアカウントキーが必要です' }, 400)
    }

    // サービスアカウントキーをパース
    let serviceAccount
    try {
      serviceAccount = typeof serviceAccountKey === 'string' 
        ? JSON.parse(serviceAccountKey) 
        : serviceAccountKey
    } catch (e) {
      return c.json({ error: 'サービスアカウントキーのJSON形式が無効です' }, 400)
    }

    // OAuth 2.0トークンを取得
    const now = Math.floor(Date.now() / 1000)
    const jwtHeader = { alg: 'RS256', typ: 'JWT' }
    const jwtClaim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    }

    // JWT署名（簡易実装 - 本番では適切なライブラリを使用）
    const jwtData = `${btoa(JSON.stringify(jwtHeader))}.${btoa(JSON.stringify(jwtClaim))}`
    
    // アクセストークン取得
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtData
      })
    })

    if (!tokenResponse.ok) {
      return c.json({ error: 'OAuth認証に失敗しました' }, 500)
    }

    const { access_token } = await tokenResponse.json()

    // Base64データを抽出
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData
    const mimeType = imageData.includes(',') 
      ? imageData.split(',')[0].split(':')[1].split(';')[0] 
      : 'image/png'

    // Vertex AI Gemini APIを呼び出し
    const vertexEndpoint = `https://${location || 'us-central1'}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location || 'us-central1'}/publishers/google/models/gemini-2.0-flash-exp:generateContent`
    
    const apiResponse = await fetch(vertexEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: 'この教科書・テキストブック・ノート・プリントの画像から、すべてのテキスト内容を正確に読み取ってください。日本語はそのまま日本語で、英語はそのまま英語で抽出してください。図や表の説明も含めてください。数式がある場合は数式も含めてください。'
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }]
      })
    })

    const result = await apiResponse.json()
    
    if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
      return c.json({ 
        success: true,
        text: result.candidates[0].content.parts[0].text
      })
    } else {
      return c.json({ 
        error: '画像からテキストを抽出できませんでした',
        details: result
      }, 500)
    }
    
  } catch (error) {
    console.error('Vertex AI エラー:', error)
    return c.json({ 
      error: 'Vertex AI画像解析に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// シンプルな問題生成（ルールベース + 改良版）
app.post('/api/generate-quiz', async (c) => {
  try {
    const { text, quizType } = await c.req.json()
    
    if (!text || !quizType) {
      return c.json({ error: 'テキストと問題タイプが必要です' }, 400)
    }

    // 文章と単語を抽出
    const sentences = text.split(/[.。！？!?]/).filter(s => s.trim().length > 10).slice(0, 5)
    const words = text.match(/[a-zA-Zぁ-んァ-ヶ一-龠]+/g)?.filter(w => w.length > 2).slice(0, 15) || []
    
    let quizData = { questions: [] }
    
    switch (quizType) {
      case 'vocabulary':
        // 単語問題
        const uniqueWords = [...new Set(words)].slice(0, 3)
        quizData.questions = uniqueWords.map((word, idx) => ({
          word: word,
          options: [
            `${word}の正しい意味`,
            `別の単語の意味1`,
            `別の単語の意味2`,
            `別の単語の意味3`
          ].sort(() => Math.random() - 0.5),
          correct: Math.floor(Math.random() * 4),
          explanation: `「${word}」は重要な単語です。意味を確認しておきましょう。`
        }))
        break
        
      case 'word-order':
        // 語順並べ替え
        quizData.questions = sentences.slice(0, 3).map(sentence => {
          const trimmed = sentence.trim()
          const wordList = trimmed.split(/\s+/).filter(w => w.length > 0)
          const shuffled = [...wordList].sort(() => Math.random() - 0.5)
          return {
            original: trimmed,
            shuffled: shuffled,
            answer: trimmed,
            explanation: `正しい語順は「${trimmed}」です。`
          }
        })
        break
        
      case 'translation':
        // 翻訳問題
        quizData.questions = sentences.slice(0, 3).map(sentence => ({
          question: sentence.trim(),
          answer: `[${sentence.trim()}の翻訳を入力してください]`,
          explanation: `この文章を丁寧に翻訳してみましょう。`
        }))
        break
        
      case 'reading':
        // 発音問題
        const readingWords = [...new Set(words)].slice(0, 3)
        quizData.questions = readingWords.map(word => ({
          word: word,
          options: [
            `[${word}]の正しい発音`,
            `誤った発音1`,
            `誤った発音2`,
            `誤った発音3`
          ].sort(() => Math.random() - 0.5),
          correct: Math.floor(Math.random() * 4),
          explanation: `「${word}」の正しい発音とアクセントを確認しましょう。`
        }))
        break
        
      default:
        return c.json({ error: '無効な問題タイプです' }, 400)
    }

    return c.json({ 
      success: true,
      quiz: quizData
    })
    
  } catch (error) {
    console.error('問題生成エラー:', error)
    return c.json({ 
      error: '問題生成に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// シンプルな解答チェック（改良版）
app.post('/api/check-answer', async (c) => {
  try {
    const { userAnswer, correctAnswer } = await c.req.json()
    
    if (!userAnswer || !correctAnswer) {
      return c.json({ error: '解答と正解が必要です' }, 400)
    }

    // 正規化して比較
    const normalize = (str) => str.toString().trim().toLowerCase().replace(/[.,!?;:]/g, '')
    const userNorm = normalize(userAnswer)
    const correctNorm = normalize(correctAnswer)
    
    // 完全一致
    if (userNorm === correctNorm) {
      return c.json({ 
        success: true,
        result: {
          isCorrect: true,
          score: 100,
          feedback: '🎉 完璧です！正解です！'
        }
      })
    }
    
    // 部分一致（70%以上）
    const similarity = calculateSimilarity(userNorm, correctNorm)
    if (similarity >= 0.7) {
      return c.json({ 
        success: true,
        result: {
          isCorrect: true,
          score: Math.round(similarity * 100),
          feedback: `👍 ほぼ正解です！もう少しで完璧です。正解は「${correctAnswer}」です。`
        }
      })
    }
    
    // 不正解
    return c.json({ 
      success: true,
      result: {
        isCorrect: false,
        score: Math.round(similarity * 50),
        feedback: `❌ 惜しいですが不正解です。正解は「${correctAnswer}」です。もう一度挑戦しましょう！`
      }
    })
    
  } catch (error) {
    console.error('採点エラー:', error)
    return c.json({ 
      error: '採点に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// 文字列類似度を計算（レーベンシュタイン距離ベース）
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const editDistance = levenshteinDistance(longer, shorter)
  return (longer.length - editDistance) / longer.length
}

function levenshteinDistance(str1, str2) {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

// トップページ
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>教科書クイズ生成アプリ</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
        <div class="container mx-auto px-4 py-8">
            <header class="text-center mb-12">
                <h1 class="text-4xl font-bold text-indigo-900 mb-2">
                    <i class="fas fa-book-open mr-3"></i>
                    教科書クイズ生成アプリ
                </h1>
                <p class="text-gray-600">📸 テキストブックの写真を撮って、自動的に小テストを作成</p>
            </header>

            <div id="app" class="max-w-4xl mx-auto">
                <!-- 画像アップロードセクション -->
                <div id="upload-section" class="bg-white rounded-lg shadow-lg p-8 mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-camera mr-2"></i>
                        📸 教科書の写真をアップロード
                    </h2>
                    
                    <!-- API設定エリア -->
                    <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div class="flex items-start">
                            <i class="fas fa-key text-blue-600 mt-1 mr-3"></i>
                            <div class="flex-1">
                                <h3 class="font-semibold text-blue-800 mb-3">🔑 AI設定</h3>
                                
                                <!-- タブ切り替え -->
                                <div class="flex gap-2 mb-4">
                                    <button id="tab-gemini" class="px-4 py-2 bg-blue-600 text-white rounded text-sm font-semibold">
                                        Gemini API
                                    </button>
                                    <button id="tab-vertex" class="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm">
                                        Vertex AI (GCP)
                                    </button>
                                </div>
                                
                                <!-- Gemini API設定 -->
                                <div id="gemini-config">
                                    <p class="text-sm text-blue-700 mb-3">
                                        <a href="https://makersuite.google.com/app/apikey" target="_blank" class="underline font-semibold">ここをクリック</a>して無料でAPIキーを取得
                                    </p>
                                    <input type="password" id="api-key-input" 
                                           class="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm mb-2"
                                           placeholder="AIzaSy... で始まるAPIキーを入力">
                                    <button id="save-api-key-btn" class="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700">
                                        保存
                                    </button>
                                    <span id="api-key-status" class="ml-2 text-sm"></span>
                                </div>
                                
                                <!-- Vertex AI設定 -->
                                <div id="vertex-config" class="hidden">
                                    <p class="text-sm text-blue-700 mb-3">
                                        GCPプロジェクトのVertex AIを使用します
                                    </p>
                                    <input type="text" id="gcp-project-id" 
                                           class="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm mb-2"
                                           placeholder="GCPプロジェクトID (例: my-project-123)">
                                    <input type="text" id="gcp-location" 
                                           class="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm mb-2"
                                           placeholder="リージョン (デフォルト: us-central1)"
                                           value="us-central1">
                                    <textarea id="gcp-access-token" 
                                              class="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm mb-2"
                                              rows="3"
                                              placeholder="アクセストークン (ターミナルで 'gcloud auth print-access-token' を実行)"></textarea>
                                    <button id="save-vertex-btn" class="bg-blue-600 text-white px-4 py-1 rounded text-sm hover:bg-blue-700">
                                        保存
                                    </button>
                                    <span id="vertex-status" class="ml-2 text-sm"></span>
                                    <p class="text-xs text-blue-600 mt-2">
                                        💡 トークンは1時間で期限切れになります。期限切れ時は再取得してください。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 学習内容の種類を選択 -->
                    <div class="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <label class="block text-sm font-semibold text-purple-800 mb-3">
                            <i class="fas fa-language mr-2"></i>
                            📚 学習内容の種類を選択
                        </label>
                        <select id="subject-type" class="w-full px-4 py-2 border border-purple-300 rounded-lg text-sm bg-white">
                            <option value="english">英語</option>
                            <option value="chinese">中国語</option>
                            <option value="japanese">日本語（国語）</option>
                            <option value="korean">韓国語</option>
                            <option value="french">フランス語</option>
                            <option value="german">ドイツ語</option>
                            <option value="spanish">スペイン語</option>
                            <option value="math">数学</option>
                            <option value="science">理科</option>
                            <option value="history">歴史・社会</option>
                            <option value="other">その他</option>
                        </select>
                        <p class="text-xs text-purple-600 mt-2">
                            💡 画像解析の精度が向上します
                        </p>
                    </div>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            画像ファイルを選択、またはURLを入力
                        </label>
                        <input type="file" id="image-file" accept="image/*"
                               class="block w-full text-sm text-gray-500 mb-3 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                        
                        <div class="relative">
                            <div class="absolute inset-0 flex items-center">
                                <div class="w-full border-t border-gray-300"></div>
                            </div>
                            <div class="relative flex justify-center text-sm">
                                <span class="px-2 bg-white text-gray-500">または</span>
                            </div>
                        </div>
                        
                        <input type="text" id="image-url" 
                               class="w-full px-4 py-2 mt-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                               placeholder="画像URLを入力...">
                    </div>

                    <div id="image-preview" class="mb-4 hidden">
                        <p class="text-sm text-gray-600 mb-2">プレビュー:</p>
                        <img id="preview-img" class="max-w-full h-auto rounded-lg border-2 border-gray-200" alt="プレビュー">
                    </div>

                    <button id="analyze-btn" 
                            class="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <i class="fas fa-magic mr-2"></i>
                        📝 画像を解析して問題を作成
                    </button>
                </div>

                <!-- テキスト表示・問題タイプ選択 -->
                <div id="quiz-type-section" class="bg-white rounded-lg shadow-lg p-8 mb-8 hidden">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-file-alt mr-2"></i>
                        抽出されたテキスト
                    </h2>
                    
                    <div class="bg-gray-50 p-4 rounded-lg mb-6 max-h-60 overflow-y-auto">
                        <p id="extracted-text" class="text-gray-700 whitespace-pre-wrap"></p>
                    </div>

                    <h3 class="text-xl font-bold text-gray-800 mb-3">問題タイプを選択</h3>
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <button class="quiz-type-btn bg-purple-100 text-purple-700 py-4 px-6 rounded-lg font-semibold hover:bg-purple-200 transition" data-type="vocabulary">
                            <i class="fas fa-spell-check mr-2"></i>
                            単語問題
                        </button>
                        <button class="quiz-type-btn bg-green-100 text-green-700 py-4 px-6 rounded-lg font-semibold hover:bg-green-200 transition" data-type="word-order">
                            <i class="fas fa-sort-alpha-down mr-2"></i>
                            語順並べ替え
                        </button>
                        <button class="quiz-type-btn bg-blue-100 text-blue-700 py-4 px-6 rounded-lg font-semibold hover:bg-blue-200 transition" data-type="translation">
                            <i class="fas fa-language mr-2"></i>
                            翻訳問題
                        </button>
                        <button class="quiz-type-btn bg-orange-100 text-orange-700 py-4 px-6 rounded-lg font-semibold hover:bg-orange-200 transition" data-type="reading">
                            <i class="fas fa-volume-up mr-2"></i>
                            読み当て問題
                        </button>
                    </div>
                </div>

                <!-- 問題表示セクション -->
                <div id="quiz-section" class="bg-white rounded-lg shadow-lg p-8 hidden">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">
                        <i class="fas fa-question-circle mr-2"></i>
                        小テスト
                    </h2>
                    
                    <div id="quiz-content"></div>
                    
                    <div class="mt-6 flex gap-4">
                        <button id="submit-answer-btn" 
                                class="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition">
                            <i class="fas fa-check mr-2"></i>
                            解答を提出
                        </button>
                        <button id="new-quiz-btn" 
                                class="bg-gray-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-700 transition">
                            <i class="fas fa-redo mr-2"></i>
                            別の問題を生成
                        </button>
                    </div>
                </div>

                <!-- 結果表示 -->
                <div id="result-section" class="bg-white rounded-lg shadow-lg p-8 mt-8 hidden">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-chart-bar mr-2"></i>
                        採点結果
                    </h2>
                    <div id="result-content"></div>
                </div>

                <!-- ローディング -->
                <div id="loading" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
                    <div class="bg-white rounded-lg p-8 text-center">
                        <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p class="text-gray-700 font-semibold">処理中...</p>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
