import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Keep the current branch's model and generation parameters unchanged.
const MODEL = 'Qwen3.5-0.8B · Q4_0';
const stateFile = fileURLToPath(new URL('../../.local-ai/runtime.json', import.meta.url));
const unavailable = () => Object.assign(new Error('Local model unavailable'), { code: 'model_unavailable' });

export function createDisabledModelProvider(model = MODEL) {
  return {
    model,
    async status() { return { ready: false, engine: 'knowledge_search', model }; },
    async select() { throw unavailable(); },
  };
}

// This adapter alone knows the llama.cpp process state, local credentials and
// OpenAI-compatible wire format. No browser-supplied endpoint is accepted.
export function createLocalModelProvider({ readState = () => readFile(stateFile, 'utf8'), fetchImpl = fetch,
  disabled = () => process.env.ASAR_AI_DISABLED === '1' || process.env.ASAR_DISABLE_AI === '1' } = {}) {
  let generating = false;
  async function runtime() {
    if (disabled()) return null;
    try {
      const config = JSON.parse(await readState());
      if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535
        || typeof config.key !== 'string' || !/^[a-f0-9]{64}$/.test(config.key)) return null;
      return { url: `http://127.0.0.1:${config.port}`, key: config.key };
    } catch { return null; }
  }
  return {
    model: MODEL,
    async status() {
      const config = await runtime();
      if (config) {
        try {
          const response = await fetchImpl(`${config.url}/v1/models`, {
            headers: { Authorization: `Bearer ${config.key}` }, signal: AbortSignal.timeout(700), redirect: 'error',
          });
          if (response.ok) {
            const body = await response.json();
            if (body.data?.some(item => item.id === 'asar-hr-local')) {
              return { ready: true, engine: 'llama.cpp · CPU · local', model: MODEL };
            }
          }
        } catch { /* HR and knowledge search stay available without the model. */ }
      }
      return { ready: false, engine: 'knowledge_search', model: MODEL };
    },
    async select({ question, previews }) {
      const started = performance.now();
      const config = await runtime();
      if (!config || generating) {
        throw Object.assign(new Error('Model not ready'), { code: generating ? 'model_busy' : 'model_unavailable' });
      }
      generating = true;
      try {
        const response = await fetchImpl(`${config.url}/v1/chat/completions`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
          body: JSON.stringify({
            model: 'asar-hr-local', temperature: 0, max_tokens: 3, stream: false,
            chat_template_kwargs: { enable_thinking: false },
            messages: [
              { role: 'system', content: 'Select evidence number. None: 0.' },
              { role: 'user', content: `${question.slice(0, 80)}\n${previews.map((preview, index) => `${index + 1}: ${preview}`).join('\n')}` },
            ],
            response_format: { type: 'json_object', schema: { type: 'integer', enum: [0, ...previews.map((_, index) => index + 1)] } },
          }),
        });
        if (!response.ok) throw Object.assign(new Error('Model HTTP error'), { code: 'model_http_error' });
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        const result = {
          raw_model_output: typeof content === 'string' ? content : null,
          model_request_ms: performance.now() - started,
          generation_ms: null,
        };
        if (Number.isFinite(data.timings?.predicted_ms) && data.timings.predicted_ms >= 0) result.generation_ms = data.timings.predicted_ms;
        if (data.usage && Number.isInteger(data.usage.prompt_tokens)) result.input_tokens = data.usage.prompt_tokens;
        if (data.usage && Number.isInteger(data.usage.completion_tokens)) result.output_tokens = data.usage.completion_tokens;
        return result;
      } finally { generating = false; }
    },
  };
}

// Shared admission control for the default application and evaluation selector.
export const localModelProvider = createLocalModelProvider();
