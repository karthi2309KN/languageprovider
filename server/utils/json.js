export function safeStringify(value, space = 2) {
  return JSON.stringify(value, null, space)
}

export function parseJsonWithFallback(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Empty response')
  }

  const trimmed = text.trim()

  try {
    return JSON.parse(trimmed)
  } catch (err) {
    const extracted = extractFirstJsonObject(trimmed)
    if (extracted) {
      return JSON.parse(extracted)
    }

    const withoutCodeFences = trimmed
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()

    return JSON.parse(withoutCodeFences)
  }
}

function extractFirstJsonObject(text) {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  return text.slice(firstBrace, lastBrace + 1)
}
