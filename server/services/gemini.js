import { GoogleGenerativeAI } from '@google/generative-ai'
import { LRUCache } from 'lru-cache'
import { parseJsonWithFallback, safeStringify } from '../utils/json.js'

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set. API calls will fail.')
}

const genAI = new GoogleGenerativeAI(apiKey || '')
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

const cache = new LRUCache({ max: 100 })

export async function translateAll({ input, languages }) {
  const cacheKey = safeStringify({ input, languages })
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const prompt = buildPrompt({ input, languages })

  try {
    const result = await model.generateContent(prompt)
    const text = result?.response?.text?.() || ''
    const parsed = parseJsonWithFallback(text)

    validateShape(parsed, languages)

    cache.set(cacheKey, parsed)
    return parsed
  } catch (error) {
    if (isQuotaError(error)) {
      const err = new Error('Limit reached')
      err.code = 'LIMIT_REACHED'
      throw err
    }

    throw error
  }
}

function buildPrompt({ input, languages }) {
  return `You are a professional SaaS UI translator.\n\nTranslate the JSON values from English into the target languages.\n\nRules:\n- Keep JSON keys unchanged.\n- Translate only the values.\n- Preserve placeholders exactly as-is: X, {name}, :count, %s, {{variable}}.\n- Use a professional, concise SaaS UI tone.\n- Return STRICT JSON only. No extra text.\n\nInput JSON:\n${safeStringify(input, 2)}\n\nTarget language codes:\n${languages.join(', ')}\n\nOutput format (strict JSON):\n{\n  "ar": { "key": "..." },\n  "de": { "key": "..." }\n}\n`
}

function validateShape(parsed, languages) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid AI response format')
  }

  for (const lang of languages) {
    if (!parsed[lang]) {
      throw new Error(`Missing language in response: ${lang}`)
    }
  }
}

function isQuotaError(error) {
  const message = `${error?.message || ''}`.toLowerCase()
  return message.includes('quota') || message.includes('rate limit') || message.includes('429')
}
