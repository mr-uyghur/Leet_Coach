/**
 * Phase 3 verification script — tests all three provider streaming paths.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/test-providers.mjs
 *
 * Requires Ollama running with qwen3:14b pulled, and/or LM Studio running with a model loaded.
 * Skips any provider that isn't reachable rather than hard-failing.
 */

// ---------------------------------------------------------------------------
// <think> boundary-safe parser (mirrors src/background/api.ts)
// ---------------------------------------------------------------------------

function makeThinkParser() {
  const state = { insideThink: false, pending: '' }

  function findPartialSuffix(input, tag, from) {
    const sub = input.slice(from)
    for (let len = Math.min(tag.length - 1, sub.length); len >= 1; len--) {
      if (tag.startsWith(sub.slice(sub.length - len))) return len
    }
    return 0
  }

  function emit(chunks, type, text) {
    if (text) chunks.push({ type, text })
  }

  function feed(raw) {
    const input = state.pending + raw
    state.pending = ''
    const chunks = []
    let pos = 0

    while (pos < input.length) {
      if (state.insideThink) {
        const closeTag = '</think>'
        const closeIdx = input.indexOf(closeTag, pos)
        if (closeIdx === -1) {
          const tail = findPartialSuffix(input, closeTag, pos)
          if (tail > 0) {
            emit(chunks, 'thinking', input.slice(pos, input.length - tail))
            state.pending = input.slice(input.length - tail)
          } else {
            emit(chunks, 'thinking', input.slice(pos))
          }
          pos = input.length
        } else {
          emit(chunks, 'thinking', input.slice(pos, closeIdx))
          state.insideThink = false
          pos = closeIdx + closeTag.length
        }
      } else {
        const openTag = '<think>'
        const openIdx = input.indexOf(openTag, pos)
        if (openIdx === -1) {
          const tail = findPartialSuffix(input, openTag, pos)
          if (tail > 0) {
            emit(chunks, 'content', input.slice(pos, input.length - tail))
            state.pending = input.slice(input.length - tail)
          } else {
            emit(chunks, 'content', input.slice(pos))
          }
          pos = input.length
        } else {
          emit(chunks, 'content', input.slice(pos, openIdx))
          state.insideThink = true
          pos = openIdx + openTag.length
        }
      }
    }
    return chunks
  }

  function flush() {
    if (!state.pending) return []
    const chunk = { type: state.insideThink ? 'thinking' : 'content', text: state.pending }
    state.pending = ''
    return chunk.text ? [chunk] : []
  }

  return { feed, flush }
}

// ---------------------------------------------------------------------------
// Anthropic SSE streaming
// ---------------------------------------------------------------------------

async function testAnthropic(apiKey) {
  const label = 'Anthropic claude-sonnet-4-6'
  if (!apiKey) {
    console.log(`\n⏭  Skipping ${label} — set ANTHROPIC_API_KEY to test`)
    return
  }

  console.log(`\n▶  ${label}`)
  let content = ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'What is the two-sum problem? Answer in one sentence.' }],
      max_tokens: 256,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`   ❌ HTTP ${res.status}: ${err}`)
    return
  }

  const decoder = new TextDecoder()
  let eventType = ''
  let dataBuffer = ''

  for await (const value of res.body) {
    const text = decoder.decode(value, { stream: true })
    for (const line of text.split('\n')) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataBuffer = line.slice(5).trim()
        if (eventType === 'content_block_delta' && dataBuffer) {
          try {
            const parsed = JSON.parse(dataBuffer)
            if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
              process.stdout.write(parsed.delta.text)
              content += parsed.delta.text
            }
          } catch { /* skip malformed */ }
          eventType = ''
          dataBuffer = ''
        }
      } else if (line === '') {
        eventType = ''
        dataBuffer = ''
      }
    }
  }

  console.log(`\n   ✅ Streamed ${content.length} chars`)
}

// ---------------------------------------------------------------------------
// OpenAI-compatible SSE streaming (Ollama + LM Studio)
// ---------------------------------------------------------------------------

async function testOpenAICompat(label, baseUrl, model) {
  console.log(`\n▶  ${label} @ ${baseUrl}`)

  let res
  try {
    res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the two-sum problem? Answer in one sentence.' },
        ],
        stream: true,
      }),
      // 5-second connect timeout
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.log(`   ⏭  Skipped — not reachable (${err.message})`)
    return
  }

  if (!res.ok) {
    const err = await res.text()
    console.error(`   ❌ HTTP ${res.status}: ${err}`)
    return
  }

  const decoder = new TextDecoder()
  const parser = makeThinkParser()
  let content = ''
  let thinking = ''
  let incomplete = ''

  for await (const value of res.body) {
    const text = decoder.decode(value, { stream: true })
    const lines = (incomplete + text).split('\n')
    incomplete = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') {
        for (const chunk of parser.flush()) {
          if (chunk.type === 'content') { process.stdout.write(chunk.text); content += chunk.text }
          else thinking += chunk.text
        }
        break
      }
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          for (const chunk of parser.feed(delta)) {
            if (chunk.type === 'content') { process.stdout.write(chunk.text); content += chunk.text }
            else thinking += chunk.text
          }
        }
      } catch { /* skip malformed */ }
    }
  }

  console.log(`\n   ✅ Streamed ${content.length} chars content`)
  if (thinking) console.log(`   💭 ${thinking.length} chars thinking (separated from content ✓)`)
}

// ---------------------------------------------------------------------------
// Boundary-split <think> parser self-test
// ---------------------------------------------------------------------------

function selfTestParser() {
  console.log('\n▶  <think> boundary-split parser self-test')
  const parser = makeThinkParser()

  // Simulate tag split across two chunks: "<thi" then "nk>reasoning</think>visible"
  const chunks1 = parser.feed('prefix<thi')
  const chunks2 = parser.feed('nk>reasoning</think>visible')
  const all = [...chunks1, ...chunks2, ...parser.flush()]

  const content = all.filter(c => c.type === 'content').map(c => c.text).join('')
  const thk = all.filter(c => c.type === 'thinking').map(c => c.text).join('')

  const ok = content === 'prefixvisible' && thk === 'reasoning'
  if (ok) {
    console.log('   ✅ Tag split across chunk boundary handled correctly')
  } else {
    console.error(`   ❌ FAIL — content="${content}" thinking="${thk}"`)
    process.exitCode = 1
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? ''

selfTestParser()
await testAnthropic(ANTHROPIC_KEY)
await testOpenAICompat('Ollama qwen3:14b', 'http://localhost:11434/v1/chat/completions', 'qwen3:14b')
await testOpenAICompat('LM Studio qwen3:14b', 'http://localhost:1234/v1/chat/completions', 'qwen3:14b')

console.log('\n✅ Phase 3 verification complete.\n')
