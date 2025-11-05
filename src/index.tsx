import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  AI: any
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイルの配信
app.use('/static/*', serveStatic({ root: './public' }))

// 画像解析API
app.post('/api/analyze-image', async (c) => {
  try {
    const { imageUrl } = await c.req.json()
    
    if (!imageUrl) {
      return c.json({ error: '画像URLが必要です' }, 400)
    }

    // Gemini API を使用して画像を解析
    const GEMINI_API_KEY = 'AIzaSyBq-5l_LLS7yjIkkTs8kytVPLzKsLT0vH0'
    
    // Data URLの場合は直接使用、通常のURLの場合は取得
    let base64Image = imageUrl
    if (!imageUrl.startsWith('data:')) {
      const imageResponse = await fetch(imageUrl)
      const imageBlob = await imageResponse.blob()
      const imageBuffer = await imageBlob.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))
      base64Image = `data:${imageBlob.type};base64,${base64}`
    }

    // data:image/png;base64, の部分を削除
    const base64Data = base64Image.split(',')[1]
    const mimeType = base64Image.split(';')[0].split(':')[1]

    const response = await fetch(
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
                text: 'この教科書・テキストの内容を詳細に読み取ってください。画像内のすべてのテキスト、図、表、数式などの情報を抽出してください。日本語のテキストはそのまま日本語で、英語のテキストはそのまま英語で出力してください。'
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
    )

    const data = await response.json()
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      const extractedText = data.candidates[0].content.parts[0].text
      return c.json({ 
        success: true,
        text: extractedText
      })
    } else {
      return c.json({ 
        error: '画像からテキストを抽出できませんでした',
        details: JSON.stringify(data)
      }, 500)
    }
  } catch (error) {
    console.error('画像解析エラー:', error)
    return c.json({ 
      error: '画像解析に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// 問題生成API
app.post('/api/generate-quiz', async (c) => {
  try {
    const { text, quizType, language } = await c.req.json()
    
    if (!text || !quizType) {
      return c.json({ error: 'テキストと問題タイプが必要です' }, 400)
    }

    let prompt = ''
    
    switch (quizType) {
      case 'vocabulary':
        prompt = `以下のテキストから重要な単語を5つ抽出し、それぞれの意味を問う問題を作成してください。
テキスト: ${text}

JSON形式で以下のように出力してください：
{
  "questions": [
    {
      "word": "単語",
      "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correct": 0,
      "explanation": "説明"
    }
  ]
}`
        break
        
      case 'word-order':
        prompt = `以下のテキストから文章を3つ選び、語順並べ替え問題を作成してください。
テキスト: ${text}

JSON形式で以下のように出力してください：
{
  "questions": [
    {
      "original": "元の文章",
      "shuffled": ["単語1", "単語2", "単語3"],
      "answer": "元の文章",
      "explanation": "説明"
    }
  ]
}`
        break
        
      case 'translation':
        prompt = `以下のテキストから文章を3つ選び、翻訳問題を作成してください（${language === 'ja' ? '日本語から英語へ' : '英語から日本語へ'}）。
テキスト: ${text}

JSON形式で以下のように出力してください：
{
  "questions": [
    {
      "question": "翻訳する文章",
      "answer": "正解の翻訳",
      "explanation": "説明"
    }
  ]
}`
        break
        
      case 'reading':
        prompt = `以下のテキストから単語を5つ選び、発音・アクセント問題を作成してください。
テキスト: ${text}

JSON形式で以下のように出力してください：
{
  "questions": [
    {
      "word": "単語",
      "options": ["発音1", "発音2", "発音3", "発音4"],
      "correct": 0,
      "explanation": "説明"
    }
  ]
}`
        break
        
      default:
        return c.json({ error: '無効な問題タイプです' }, 400)
    }

    // Gemini API で問題を生成
    const GEMINI_API_KEY = 'AIzaSyBq-5l_LLS7yjIkkTs8kytVPLzKsLT0vH0'
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `あなたは教育用の問題作成アシスタントです。\n\n${prompt}\n\n必ずJSON形式のみで出力してください。他の説明文は不要です。`
            }]
          }]
        })
      }
    )

    const data = await response.json()
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      let generatedText = data.candidates[0].content.parts[0].text
      
      // ```json ``` で囲まれている場合は除去
      generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      
      // JSONを抽出
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const quizData = JSON.parse(jsonMatch[0])
        return c.json({ 
          success: true,
          quiz: quizData
        })
      }
    }

    return c.json({ 
      error: '問題生成に失敗しました',
      raw: data
    }, 500)
    
  } catch (error) {
    console.error('問題生成エラー:', error)
    return c.json({ 
      error: '問題生成に失敗しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// 解答チェックAPI
app.post('/api/check-answer', async (c) => {
  try {
    const { userAnswer, correctAnswer, questionType } = await c.req.json()
    
    if (!userAnswer || !correctAnswer) {
      return c.json({ error: '解答と正解が必要です' }, 400)
    }

    const prompt = `以下の解答を採点してください。

問題タイプ: ${questionType}
正解: ${correctAnswer}
ユーザーの解答: ${userAnswer}

厳密な一致は求めず、意味が合っていれば正解としてください。
JSON形式で以下のように出力してください：
{
  "isCorrect": true/false,
  "score": 0-100,
  "feedback": "フィードバック"
}`

    // Gemini API で採点
    const GEMINI_API_KEY = 'AIzaSyBq-5l_LLS7yjIkkTs8kytVPLzKsLT0vH0'
    
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `あなたは教育用の採点アシスタントです。\n\n${prompt}\n\n必ずJSON形式のみで出力してください。他の説明文は不要です。`
            }]
          }]
        })
      }
    )

    const data = await response.json()
    
    if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
      let generatedText = data.candidates[0].content.parts[0].text
      
      // ```json ``` で囲まれている場合は除去
      generatedText = generatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0])
        return c.json({ 
          success: true,
          result
        })
      }
    }

    return c.json({ 
      error: '採点に失敗しました',
      raw: data
    }, 500)
    
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
                <p class="text-gray-600">テキストブックの画像をアップロードして、自動的に小テストを作成</p>
            </header>

            <div id="app" class="max-w-4xl mx-auto">
                <!-- アップロードセクション -->
                <div id="upload-section" class="bg-white rounded-lg shadow-lg p-8 mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">
                        <i class="fas fa-upload mr-2"></i>
                        画像をアップロード
                    </h2>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            画像URL（または画像ファイル選択）
                        </label>
                        <input type="text" id="image-url" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                               placeholder="画像URLを入力...">
                        <div class="mt-2">
                            <input type="file" id="image-file" accept="image/*"
                                   class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                        </div>
                    </div>

                    <div id="image-preview" class="mb-4 hidden">
                        <img id="preview-img" class="max-w-full h-auto rounded-lg border-2 border-gray-200" alt="プレビュー">
                    </div>

                    <button id="analyze-btn" 
                            class="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <i class="fas fa-search mr-2"></i>
                        画像を解析
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
