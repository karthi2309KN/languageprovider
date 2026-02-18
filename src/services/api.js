const DEFAULT_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'
const DEFAULT_API_VERSION = import.meta.env.VITE_GEMINI_API_VERSION || 'v1beta'
const DEFAULT_BATCH_SIZE = Number(import.meta.env.VITE_GEMINI_BATCH_SIZE) || 4

function buildPrompt(input, languages) {
  const inputJson = JSON.stringify(input, null, 2)
  const langList = languages.join(', ')

  return `You are a professional SaaS UI translator.

Translate the JSON values from English into ALL of the target languages listed below.

Rules:
- Keep JSON keys unchanged.
- Translate only the values.
- Preserve placeholders exactly as-is: X, {name}, :count, %s, {{variable}}.
- Use a professional, concise SaaS UI tone.
- You MUST include every single target language as provided.
- Return ONLY valid JSON. No prose, no markdown, no code fences, no extra text.

Input JSON:
${inputJson}

Target languages (include ALL of these exactly as written):
${langList}

Output format (strict JSON, include every language above):
{
  "French": { "key": "..." },
  "ta": { "key": "..." }
}`
}

function buildEndpoint(model = DEFAULT_MODEL, apiVersion = DEFAULT_API_VERSION) {
  return `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`
}

function extractText(responseJson) {
  const text = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text
  return typeof text === 'string' ? text : ''
}

function extractFirstJsonObject(text) {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  return text.slice(first, last + 1)
}

function parseJsonWithFallback(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('Empty response from Gemini')

  try {
    return JSON.parse(trimmed)
  } catch {
    const extracted = extractFirstJsonObject(trimmed)
    if (extracted) {
      return JSON.parse(extracted)
    }
    const withoutFences = trimmed.replace(/```json/gi, '').replace(/```/g, '')
    return JSON.parse(withoutFences.trim())
  }
}

export async function translateLanguages({ input, languages, apiKey, signal, batchSize }) {
  try {
    return await requestTranslations({ input, languages, apiKey, signal })
  } catch (err) {
    if (err?.code === 'OUTPUT_TRUNCATED' && languages.length > 1) {
      const chunks = chunkArray(languages, batchSize || DEFAULT_BATCH_SIZE)
      const merged = {}
      for (const chunk of chunks) {
        const partial = await requestTranslations({ input, languages: chunk, apiKey, signal })
        Object.assign(merged, partial)
      }
      return merged
    }
    throw err
  }
}

async function requestTranslations({ input, languages, apiKey, signal }) {
  const endpoint = buildEndpoint()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(input, languages) }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 8192
      }
    }),
    signal
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 429) {
      const err = new Error('LIMIT_REACHED')
      err.code = 'LIMIT_REACHED'
      const retryHeader = response.headers.get('Retry-After')
      err.retryAfter = Number(retryHeader) || 60
      throw err
    }
    const errMessage = body?.error?.message || body?.error || 'Gemini request failed'
    const err = new Error(errMessage)
    err.code = 'REQUEST_FAILED'
    throw err
  }

  const finishReason = body?.candidates?.[0]?.finishReason
  const text = extractText(body)
  if (finishReason === 'MAX_TOKENS') {
    const err = new Error('OUTPUT_TRUNCATED')
    err.code = 'OUTPUT_TRUNCATED'
    throw err
  }
  const parsed = parseJsonWithFallback(text)
  return parsed || {}
}

export async function validateApiKey({ apiKey, signal }) {
  const endpoint = buildEndpoint()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Reply with JSON: {"ok":true}' }]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 32
      }
    }),
    signal
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const err = new Error(body?.error?.message || 'Key validation failed')
    err.code = 'REQUEST_FAILED'
    const retryHeader = response.headers.get('Retry-After')
    err.retryAfter = Number(retryHeader) || 60
    throw err
  }

  return true
}

function chunkArray(list, size) {
  const chunkSize = Math.max(1, Number(size) || 1)
  const chunks = []
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize))
  }
  return chunks
}
