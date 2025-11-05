import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  AI?: any
  GEMINI_API_KEY?: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの配信
app.use('/static/*', serveStatic({ root: './public' }))

// 画像解析API - テキストを直接受け取る
app.post('/api/analyze-image', async (c) => {
  try {
    const { text } = await c.req.json()
    
    if (!text) {
      return c.json({ error: 'テキストが必要です' }, 400)
    }

    return c.json({ 
      success: true,
      text: text
    })
  } catch (error) {
    console.error('画像解析エラー:', error)
    return c.json({ 
      error: '画像解析に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// シンプルな問題生成（ルールベース）
app.post('/api/generate-quiz', async (c) => {
  try {
    const { text, quizType } = await c.req.json()
    
    if (!text || !quizType) {
      return c.json({ error: 'テキストと問題タイプが必要です' }, 400)
    }

    // 文章を分割
    const sentences = text.split(/[.。！？!?]/).filter(s => s.trim().length > 5).slice(0, 5)
    const words = text.split(/[\s\n,、]+/).filter(w => w.length > 2).slice(0, 10)
    
    let quizData = { questions: [] }
    
    switch (quizType) {
      case 'vocabulary':
        // 単語問題（シンプル版）
        quizData.questions = words.slice(0, 3).map(word => ({
          word: word,
          options: [
            `${word}の意味1`,
            `${word}の意味2`,
            `${word}の意味3`,
            `${word}の意味4`
          ],
          correct: 0,
          explanation: `${word}は重要な単語です`
        }))
        break
        
      case 'word-order':
        // 語順並べ替え
        quizData.questions = sentences.slice(0, 3).map(sentence => {
          const trimmed = sentence.trim()
          const wordList = trimmed.split(/\s+/)
          const shuffled = [...wordList].sort(() => Math.random() - 0.5)
          return {
            original: trimmed,
            shuffled: shuffled,
            answer: trimmed,
            explanation: `正しい語順は「${trimmed}」です`
          }
        })
        break
        
      case 'translation':
        // 翻訳問題
        quizData.questions = sentences.slice(0, 3).map(sentence => ({
          question: sentence.trim(),
          answer: `${sentence.trim()}の翻訳`,
          explanation: `この文章を翻訳しましょう`
        }))
        break
        
      case 'reading':
        // 発音問題
        quizData.questions = words.slice(0, 3).map(word => ({
          word: word,
          options: [
            `/${word}/（正しい発音）`,
            `/${word}1/`,
            `/${word}2/`,
            `/${word}3/`
          ],
          correct: 0,
          explanation: `${word}の発音を確認しましょう`
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

// シンプルな解答チェック
app.post('/api/check-answer', async (c) => {
  try {
    const { userAnswer, correctAnswer } = await c.req.json()
    
    if (!userAnswer || !correctAnswer) {
      return c.json({ error: '解答と正解が必要です' }, 400)
    }

    // シンプルな文字列比較
    const userLower = userAnswer.toString().trim().toLowerCase()
    const correctLower = correctAnswer.toString().trim().toLowerCase()
    
    const isCorrect = userLower === correctLower || userLower.includes(correctLower) || correctLower.includes(userLower)
    const score = isCorrect ? 100 : 0
    const feedback = isCorrect 
      ? '正解です！よくできました！' 
      : `不正解です。正解は「${correctAnswer}」です。`

    return c.json({ 
      success: true,
      result: {
        isCorrect,
        score,
        feedback
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
                <p class="text-gray-600">テキストを入力して、自動的に小テストを作成</p>
            </header>

            <div id="app" class="max-w-4xl mx-auto">
                <!-- テキスト入力セクション -->
                <div id="upload-section" class="bg-white rounded-lg shadow-lg p-8 mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-edit mr-2"></i>
                        学習テキストを入力
                    </h2>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            教科書・テキストの内容を入力してください
                        </label>
                        <textarea id="text-input" 
                                  class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                  rows="10"
                                  placeholder="学習したいテキストをここに貼り付けてください...&#10;&#10;例:&#10;The quick brown fox jumps over the lazy dog.&#10;これは英語の練習文です。"></textarea>
                    </div>

                    <button id="analyze-btn" 
                            class="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <i class="fas fa-arrow-right mr-2"></i>
                        問題を作成
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
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
