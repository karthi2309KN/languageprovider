import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { translateAll } from './services/gemini.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/translate', async (req, res) => {
  try {
    const { input, languages } = req.body || {}

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return res.status(400).json({ success: false, error: 'Invalid input JSON.' })
    }

    if (!Array.isArray(languages) || languages.length === 0) {
      return res.status(400).json({ success: false, error: 'Languages array is required.' })
    }

    const cleanedLanguages = languages
      .map((lang) => (typeof lang === 'string' ? lang.trim() : ''))
      .filter((lang) => lang.length > 0)

    if (cleanedLanguages.length === 0) {
      return res.status(400).json({ success: false, error: 'Languages array is empty.' })
    }

    const result = await translateAll({ input, languages: cleanedLanguages })

    return res.json({ success: true, data: result })
  } catch (error) {
    if (error?.code === 'LIMIT_REACHED') {
      return res.status(429).json({ success: false, type: 'LIMIT_REACHED' })
    }

    return res.status(500).json({ success: false, error: 'Translation failed.' })
  }
})

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})
