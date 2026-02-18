<template>
  <div class="app">
    <div v-if="errorMessage" class="alert-banner error">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="alert-banner success">
      {{ successMessage }}
    </div>

    <header class="hero">
      <div>
        <h1>AI Language Translation Generator</h1>
        <p>Paste English UI keys, add language codes or names, and generate production-ready translation files.</p>
      </div>
      <div class="settings">
        <button class="icon-btn" @click="showSettings = !showSettings" :aria-expanded="showSettings">
          <span class="icon">⚙</span>
          <span>Settings</span>
        </button>
        <div v-if="showSettings" class="settings-card">
          <label>Gemini API Key</label>
          <input v-model="apiKey" type="password" class="input" placeholder="Paste API key (stored locally)" />
          <div class="key-row">
            <label class="toggle">
              <input type="checkbox" v-model="saveApiKey" @change="persistApiKey" />
              <span>Save key in this browser</span>
            </label>
            <button class="btn ghost" @click="clearApiKey">Clear</button>
            <button class="btn secondary" @click="testApiKey" :disabled="testingKey || testCooldown > 0">
              {{ testingKey ? 'Testing…' : testCooldown > 0 ? `Wait ${testCooldown}s` : 'Test Key' }}
            </button>
          </div>
          <span class="key-note">Required. Stored only in this browser if enabled.</span>
          <div class="divider"></div>
          <label>Batch Size</label>
          <input
            v-model.number="batchSize"
            type="number"
            class="input"
            min="1"
            max="12"
            step="1"
            placeholder="4"
          />
          <p class="helper">Higher values reduce API calls but may hit token limits.</p>
          <p v-if="cooldownRemaining > 0" class="cooldown">
            Rate limit reached. Retry in {{ cooldownRemaining }}s.
          </p>
          <p class="helper">Testing the key uses a real API request.</p>
        </div>
      </div>
    </header>

    <section class="panel">
      <div class="field">
        <label>English Input</label>
        <textarea
          v-model="inputJson"
          class="textarea"
          rows="10"
          placeholder="'save' => 'Save',\n'upd8' => 'Update',\n'twitter' => 'X'"
        ></textarea>
        <p class="hint">Accepts Laravel array pairs (key => value) or valid JSON.</p>
        <div class="actions">
          <button class="btn secondary" @click="normalizeInputSingleLine" :disabled="loading">
            Normalize (Single Line)
          </button>
          <button class="btn secondary" @click="normalizeInputMultiLine" :disabled="loading">
            Normalize (Multi Line)
          </button>
        </div>
      </div>

      <div class="field">
        <label>Languages (codes or names)</label>
        <div class="tag-input">
          <div class="tags">
            <span v-for="lang in languages" :key="lang" class="tag">
              {{ lang }}
              <button class="tag-remove" @click="removeLanguage(lang)">×</button>
            </span>
          </div>
          <div class="tag-controls">
            <input
              v-model="languageInput"
              @keydown.enter.prevent="addLanguage"
              @keydown.comma.prevent="addLanguage"
              class="input"
              placeholder="Type language code or name and press Enter"
            />
            <button class="btn secondary" @click="addLanguage">Add</button>
            <button class="btn ghost" @click="clearLanguages" v-if="languages.length">Clear</button>
          </div>
        </div>
        <p class="hint">Use ISO codes (e.g. `fr`, `zh-CN`) or full names (e.g. `French`, `Simplified Chinese`).</p>
      </div>

      <div class="actions">
        <label class="toggle">
          <span>Output format</span>
          <select v-model="outputFormat" class="input">
            <option value="json">JSON</option>
            <option value="laravel">Laravel PHP</option>
          </select>
        </label>
        <button class="btn primary" @click="generate" :disabled="loading || cooldownRemaining > 0">
          <span v-if="loading" class="spinner" aria-hidden="true"></span>
          {{ loading ? 'Generating…' : 'Generate Translations' }}
        </button>
        <button class="btn ghost" @click="resetAll" :disabled="loading">Reset</button>
      </div>

    </section>

    <section v-if="Object.keys(results).length" class="results">
      <div class="results-header">
        <h2>Translations</h2>
        <p>Edit any language JSON before exporting.</p>
      </div>

      <div class="language-card" v-for="lang in Object.keys(results)" :key="lang">
        <div class="language-header">
          <h3>{{ lang }}</h3>
          <div class="language-actions">
            <button class="btn secondary" @click="toggleEdit(lang)">
              {{ editableMode[lang] ? 'Lock' : 'Edit' }}
            </button>
            <button class="btn secondary" @click="copyJson(lang)">Copy JSON</button>
            <button class="btn secondary" @click="copyLaravel(lang)">Copy Laravel</button>
            <button class="btn ghost" @click="downloadJson(lang)">Download JSON</button>
            <button class="btn ghost" @click="downloadLaravel(lang)">Download PHP</button>
          </div>
        </div>
        <textarea
          v-if="outputFormat === 'json'"
          class="textarea"
          rows="10"
          v-model="editable[lang]"
          :readonly="!editableMode[lang]"
        ></textarea>
        <textarea
          v-else
          class="textarea"
          rows="10"
          :value="formatLaravel(lang)"
          readonly
        ></textarea>
        <p v-if="editableErrors[lang]" class="inline-error">{{ editableErrors[lang] }}</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { translateLanguages, validateApiKey } from './services/api'

const inputJson = ref('')
const languageInput = ref('')
const defaultLanguages = [
  'ar',
  'bs',
  'de',
  'es',
  'fr',
  'id',
  'it',
  'ko',
  'mt',
  'nl',
  'no',
  'pt',
  'ru',
  'vi',
  'zh-CN',
  'zh-TW'
]
const languages = ref([...defaultLanguages])
const apiKey = ref('')
const saveApiKey = ref(false)
const showSettings = ref(true)
const batchSize = ref(4)
const loading = ref(false)
const testingKey = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const results = ref({})
const editable = reactive({})
const editableErrors = reactive({})
const editableMode = reactive({})
const outputFormat = ref('json')
const cooldownRemaining = ref(0)
let cooldownTimer = null
const translateCache = new Map()
const keyTestCache = new Map()
const testCooldown = ref(0)
let testCooldownTimer = null
let alertTimer = null
let translateAbort = null
let validateAbort = null

const storedKey = localStorage.getItem('gemini_api_key') || ''
if (storedKey) {
  apiKey.value = storedKey
  saveApiKey.value = true
}

function addLanguage() {
  const value = languageInput.value.trim()
  if (!value) return

  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  for (const part of parts) {
    if (!languages.value.includes(part)) {
      languages.value.push(part)
    }
  }

  languageInput.value = ''
}

function removeLanguage(lang) {
  languages.value = languages.value.filter((item) => item !== lang)
}

function clearLanguages() {
  languages.value = []
}

function resetAll() {
  inputJson.value = ''
  languages.value = [...defaultLanguages]
  languageInput.value = ''
  results.value = {}
  errorMessage.value = ''
  successMessage.value = ''
  clearEditable()
}

function clearEditable() {
  for (const key of Object.keys(editable)) delete editable[key]
  for (const key of Object.keys(editableErrors)) delete editableErrors[key]
  for (const key of Object.keys(editableMode)) delete editableMode[key]
}

async function generate() {
  if (loading.value) return
  clearAlerts()
  clearEditable()

  if (!inputJson.value.trim()) {
    setError('Please paste the English input.')
    return
  }

  if (!languages.value.length) {
    setError('Please add at least one language.')
    return
  }

  if (!apiKey.value.trim()) {
    setError('Please enter a Gemini API key.')
    return
  }

  const parsedResult = parseInput(inputJson.value)
  if (!parsedResult.data) {
    setError(parsedResult.error || 'Invalid input. Use JSON or Laravel array format.')
    return
  }
  const parsedInput = parsedResult.data

  const cacheKey = buildCacheKey(parsedInput)
  const cached = translateCache.get(cacheKey)
  if (cached) {
    results.value = cached
    for (const lang of Object.keys(cached)) {
      editable[lang] = JSON.stringify(cached[lang], null, 2)
      editableMode[lang] = false
    }
    setSuccess('Loaded from cache.')
    return
  }

  if (translateAbort) translateAbort.abort()
  translateAbort = new AbortController()

  loading.value = true
  try {
    const safeBatchSize = Math.max(1, Math.min(12, Number(batchSize.value) || 4))
    const data = await translateLanguages({
      input: parsedInput,
      languages: languages.value,
      apiKey: apiKey.value.trim() || null,
      batchSize: safeBatchSize,
      signal: translateAbort.signal
    })

    results.value = data
    translateCache.set(cacheKey, data)
    for (const lang of Object.keys(data)) {
      editable[lang] = JSON.stringify(data[lang], null, 2)
      editableMode[lang] = false
    }
  } catch (err) {
    if (err.name === 'AbortError') return
    if (err.code === 'LIMIT_REACHED') {
      startCooldown(err.retryAfter || 60)
      setError('Gemini quota reached. Please wait for cooldown.')
    } else if (err.code === 'OUTPUT_TRUNCATED') {
      setError('Output was truncated. Try fewer languages, a smaller batch size, or split the input.')
    } else {
      setError(
        err.message?.includes('Failed to fetch')
          ? 'Network error. Please check your connection.'
          : err.message || 'Translation failed. Please try again.'
      )
    }
  } finally {
    loading.value = false
  }
}

function parseEditable(lang) {
  if (!editableMode[lang]) {
    editableErrors[lang] = 'Enable edit mode to modify.'
  }
  try {
    const parsed = JSON.parse(editable[lang])
    editableErrors[lang] = ''
    return parsed
  } catch {
    editableErrors[lang] = 'Invalid JSON. Fix before exporting.'
    return null
  }
}

function parseInput(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return { data: null, error: 'Input is empty.' }

  const looksLikeLaravel = /=>/.test(trimmed)
  if (looksLikeLaravel) {
    const laravelResult = parseLaravelPairs(trimmed)
    if (laravelResult.data) return laravelResult
    return laravelResult
  }

  try {
    return { data: JSON.parse(trimmed), error: null }
  } catch {
    const laravelResult = parseLaravelPairs(trimmed)
    if (laravelResult.data) return laravelResult
    return { data: null, error: 'Invalid JSON input.' }
  }
}

function parseLaravelPairs(text) {
  const result = {}
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')

  const segments = splitLaravelPairs(normalized)
    .map((segment) => segment.trim())
    .filter(
      (segment) =>
        segment &&
        segment !== 'return [' &&
        segment !== 'return[' &&
        segment !== '[' &&
        segment !== ']' &&
        segment !== '];'
    )

  const pairRegex = /(['"])((?:\\.|(?!\1).)*)\1\s*=>\s*(['"])((?:\\.|(?!\3).)*)\3\s*,?;?$/

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    const match = segment.match(pairRegex)
    if (!match) {
      return {
        data: null,
        error: `Invalid Laravel pair at item ${i + 1}: ${segment}. If your text contains a ' character, wrap the value in double quotes or escape it as \\\'.`
      }
    }
    const keyQuote = match[1]
    const keyRaw = match[2]
    const valueQuote = match[3]
    const valueRaw = match[4]
    const key = unescapeQuoted(keyRaw, keyQuote)
    const value = unescapeQuoted(valueRaw, valueQuote)
    result[key] = value
  }

  return Object.keys(result).length
    ? { data: result, error: null }
    : { data: null, error: 'No valid key/value pairs found.' }
}

function splitLaravelPairs(text) {
  const parts = []
  let buffer = ''
  let quote = null
  let escaped = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (escaped) {
      buffer += char
      escaped = false
      continue
    }

    if (char === '\\') {
      buffer += char
      escaped = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      }
      buffer += char
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      buffer += char
      continue
    }

    if (char === ',') {
      const segment = buffer.trim()
      if (segment) parts.push(segment)
      buffer = ''
      continue
    }

    buffer += char
  }

  const finalSegment = buffer.trim()
  if (finalSegment) parts.push(finalSegment)

  return parts
}

function normalizeInputSingleLine() {
  clearAlerts()
  if (!inputJson.value.trim()) {
    setError('Please paste the English input.')
    return
  }

  const parsedResult = parseInput(inputJson.value)
  if (!parsedResult.data) {
    setError(parsedResult.error || 'Invalid input. Use JSON or Laravel array format.')
    return
  }

  inputJson.value = toLaravelPairsSingleLine(parsedResult.data)
  setSuccess('Input normalized to single-line Laravel pairs.')
}

function normalizeInputMultiLine() {
  clearAlerts()
  if (!inputJson.value.trim()) {
    setError('Please paste the English input.')
    return
  }

  const parsedResult = parseInput(inputJson.value)
  if (!parsedResult.data) {
    setError(parsedResult.error || 'Invalid input. Use JSON or Laravel array format.')
    return
  }

  inputJson.value = toLaravelPairsOnly(parsedResult.data)
  setSuccess('Input normalized to multi-line Laravel pairs.')
}

function unescapeQuoted(value, quoteChar) {
  const escapedQuote = new RegExp('\\\\' + quoteChar, 'g')
  return value.replace(escapedQuote, quoteChar).replace(/\\\\/g, '\\')
}

function toggleEdit(lang) {
  if (outputFormat.value === 'laravel') {
    setError('Switch output format to JSON to edit translations.')
    return
  }
  editableMode[lang] = !editableMode[lang]
  if (!editableMode[lang]) {
    editableErrors[lang] = ''
  }
}

function persistApiKey() {
  if (saveApiKey.value && apiKey.value.trim()) {
    localStorage.setItem('gemini_api_key', apiKey.value.trim())
  } else {
    localStorage.removeItem('gemini_api_key')
  }
}

function clearApiKey() {
  apiKey.value = ''
  saveApiKey.value = false
  localStorage.removeItem('gemini_api_key')
}

async function testApiKey() {
  if (testingKey.value) return
  clearAlerts()

  if (!apiKey.value.trim()) {
    setError('Please enter a Gemini API key to test.')
    return
  }

  if (testCooldown.value > 0) {
    setError(`Please wait ${testCooldown.value}s before retesting.`)
    return
  }

  const cacheKey = buildKeyTestCacheKey()
  const cached = keyTestCache.get(cacheKey)
  if (cached) {
    setSuccess('Gemini API key is valid (cached).')
    return
  }

  if (validateAbort) validateAbort.abort()
  validateAbort = new AbortController()

  testingKey.value = true
  try {
    await validateApiKey({
      apiKey: apiKey.value.trim(),
      signal: validateAbort.signal
    })
    setSuccess('Gemini API key is valid.')
    keyTestCache.set(cacheKey, true)
    startTestCooldown(10)
  } catch (err) {
    if (err.name === 'AbortError') return
    if (err.code === 'LIMIT_REACHED') {
      startCooldown(err.retryAfter || 60)
      setError('Quota limit reached. Please retry after cooldown.')
    } else {
      setError(
        err.message?.includes('Failed to fetch')
          ? 'Network error. Please check your connection.'
          : err.message || 'API key validation failed.'
      )
    }
  } finally {
    testingKey.value = false
  }
}

function buildCacheKey(parsedInput) {
  return JSON.stringify({
    input: parsedInput,
    languages: languages.value,
    apiKey: apiKey.value.trim() || null
  })
}

function buildKeyTestCacheKey() {
  return JSON.stringify({
    apiKey: apiKey.value.trim() || null
  })
}

function startTestCooldown(seconds) {
  testCooldown.value = Math.max(1, Number(seconds) || 10)
  if (testCooldownTimer) clearInterval(testCooldownTimer)
  testCooldownTimer = setInterval(() => {
    testCooldown.value -= 1
    if (testCooldown.value <= 0) {
      clearInterval(testCooldownTimer)
      testCooldownTimer = null
      testCooldown.value = 0
    }
  }, 1000)
}

function startCooldown(seconds) {
  cooldownRemaining.value = Math.max(1, Number(seconds) || 60)
  if (cooldownTimer) clearInterval(cooldownTimer)

  cooldownTimer = setInterval(async () => {
    cooldownRemaining.value -= 1
    if (cooldownRemaining.value <= 0) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
      cooldownRemaining.value = 0
    }
  }, 1000)
}

function setError(message, timeout = 5000) {
  errorMessage.value = message
  successMessage.value = ''
  scheduleAlertClear(timeout)
}

function setSuccess(message, timeout = 4000) {
  successMessage.value = message
  errorMessage.value = ''
  scheduleAlertClear(timeout)
}

function clearAlerts() {
  errorMessage.value = ''
  successMessage.value = ''
  if (alertTimer) {
    clearTimeout(alertTimer)
    alertTimer = null
  }
}

function scheduleAlertClear(timeout) {
  if (alertTimer) clearTimeout(alertTimer)
  alertTimer = setTimeout(() => {
    errorMessage.value = ''
    successMessage.value = ''
    alertTimer = null
  }, timeout)
}

function copyJson(lang) {
  const parsed = parseEditable(lang)
  if (!parsed) return
  navigator.clipboard.writeText(JSON.stringify(parsed, null, 2))
}

function copyLaravel(lang) {
  const parsed = parseEditable(lang)
  if (!parsed) return
  navigator.clipboard.writeText(toLaravel(parsed))
}

function downloadJson(lang) {
  const parsed = parseEditable(lang)
  if (!parsed) return
  const content = JSON.stringify(parsed, null, 2)
  downloadFile(`${lang}.json`, content)
}

function downloadLaravel(lang) {
  const parsed = parseEditable(lang)
  if (!parsed) return
  downloadFile(`${lang}.php`, toLaravel(parsed))
}

function formatLaravel(lang) {
  try {
    const parsed = JSON.parse(editable[lang])
    editableErrors[lang] = ''
    return toLaravel(parsed)
  } catch {
    editableErrors[lang] = 'Invalid JSON. Switch to JSON view to fix.'
    return '// Invalid JSON'
  }
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}

function toLaravel(obj) {
  const lines = Object.entries(obj).map(([key, value]) => {
    const k = String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const v = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    return `  '${k}' => '${v}',`
  })
  return `<?php\n\nreturn [\n${lines.join('\n')}\n];\n`
}

function toLaravelPairsOnly(obj) {
  return Object.entries(obj)
    .map(([key, value]) => {
      const k = String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const v = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return `'${k}' => '${v}',`
    })
    .join('\n')
}

function toLaravelPairsSingleLine(obj) {
  return Object.entries(obj)
    .map(([key, value]) => {
      const k = String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      const v = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return `'${k}' => '${v}'`
    })
    .join(', ') + ','
}
</script>

<style scoped>
.app {
  font-family: "Space Grotesk", "IBM Plex Sans", sans-serif;
  background: radial-gradient(circle at top left, #f7efe0, #f2f5ff 45%, #edf6f1 100%);
  min-height: 100vh;
  padding: 36px;
  color: #1b1b28;
  width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 28px;
}

.hero h1 {
  font-size: 34px;
  margin: 0;
}

.hero p {
  margin: 8px 0 0;
  color: #5b5b72;
  max-width: 540px;
}

.settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 280px;
}

.icon-btn {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #d6d6e8;
  background: #ffffff;
  color: #1b1b28;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(20, 20, 40, 0.08);
}

.icon {
  font-size: 16px;
}

.settings-card {
  min-width: 280px;
  background: #ffffff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 16px 40px rgba(20, 20, 40, 0.08);
}

.key-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 10px;
  flex-wrap: wrap;
}

.toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #2b2b40;
}

.key-note {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #6f6f86;
}

.panel {
  background: #ffffff;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(20, 20, 40, 0.1);
  margin-bottom: 28px;
  width: 100%;
}

.field {
  margin-bottom: 20px;
}

label {
  display: block;
  font-weight: 600;
  margin-bottom: 10px;
}

.textarea {
  width: 100%;
  border-radius: 12px;
  border: 1px solid #e1e1ec;
  padding: 12px;
  font-family: "Fira Code", monospace;
  font-size: 14px;
  background: #fbfbff;
}

.hint {
  margin-top: 8px;
  color: #6f6f86;
  font-size: 13px;
}

.tag-input {
  border: 1px dashed #d6d6e8;
  border-radius: 16px;
  padding: 16px;
  background: #f8f8ff;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tag {
  background: #1b1b28;
  color: #fff;
  padding: 6px 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.tag-remove {
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.tag-controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.input {
  flex: 1;
  min-width: 200px;
  border-radius: 10px;
  border: 1px solid #d6d6e8;
  padding: 10px;
  background: #fff;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.btn.primary {
  background: #ff6a3d;
  color: #fff;
  box-shadow: 0 12px 24px rgba(255, 106, 61, 0.25);
}

.btn.secondary {
  background: #f0f1ff;
  color: #2b2b40;
}

.btn.ghost {
  background: transparent;
  border: 1px solid #d6d6e8;
  color: #2b2b44;
}

.btn:hover {
  transform: translateY(-1px);
}

.spinner {
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.alert-banner {
  position: sticky;
  top: 16px;
  z-index: 20;
  margin-bottom: 20px;
  padding: 12px 16px;
  border-radius: 12px;
  font-weight: 600;
  box-shadow: 0 10px 24px rgba(20, 20, 40, 0.12);
  backdrop-filter: blur(8px);
}

.alert-banner.error {
  background: rgba(255, 227, 222, 0.9);
  color: #7f1d1d;
  border: 1px solid #ffd0c7;
}

.alert-banner.success {
  background: rgba(227, 247, 232, 0.9);
  color: #11663a;
  border: 1px solid #c9efd5;
}

.divider {
  height: 1px;
  background: #ececf4;
  margin: 14px 0;
}

.cooldown {
  margin: 10px 0 0;
  font-size: 12px;
  color: #8a3b12;
  font-weight: 600;
}

.helper {
  margin: 6px 0 0;
  font-size: 12px;
  color: #6f6f86;
}

.results {
  display: grid;
  gap: 20px;
  width: 100%;
}

.results-header h2 {
  margin: 0 0 6px;
}

.language-card {
  background: #ffffff;
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 15px 40px rgba(20, 20, 40, 0.08);
}

.language-header {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.language-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tags {
  overflow-x: auto;
  padding-bottom: 4px;
}

.tags::-webkit-scrollbar {
  height: 6px;
}

.tags::-webkit-scrollbar-thumb {
  background: #d6d6e8;
  border-radius: 999px;
}

.inline-error {
  color: #b42318;
  margin-top: 6px;
  font-weight: 600;
}

@media (max-width: 720px) {
  .app {
    padding: 20px;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .language-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .settings-card {
    width: 100%;
  }
}
</style>
