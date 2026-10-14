import {PRESETS, completionEndpoint, presetParameters} from '../src/providers';
import {parseLlm, transcribe} from '../src/llm';
const result = (content = '{"latex":"y=x^2","uncertainty":""}', finish_reason = 'stop') => ({choices: [{finish_reason, message: {content}}]});
describe('image-only provider presets', () => {
  test('all named presets support images and have distinct correct endpoints', () => {
    expect(PRESETS.filter(p => p.preset !== 'custom')).toHaveLength(7);
    for (const p of PRESETS.filter(p => p.preset !== 'custom')) {
      expect(p.vision).toBe(true); expect(p.model).toBeTruthy(); expect(completionEndpoint(p.endpoint)).toBe(p.endpoint);
    }
  });
  test('base URL normalization is idempotent', () => {
    expect(completionEndpoint(' https://api.deepseek.com/ ')).toBe('https://api.deepseek.com/chat/completions');
    expect(completionEndpoint('https://example.com/v1')).toBe('https://example.com/v1/chat/completions');
  });
  test.each(['http://example.com/v1', 'https://user:key@example.com/v1', 'https://example.com/v1?key=secret', 'https://{WorkspaceId}.example.com', 'https://example.com/v1/responses'])('rejects incompatible URL %s', s => expect(() => completionEndpoint(s)).toThrow());
  test('provider-specific options only apply to unchanged presets', () => {
    const mini = PRESETS.find(p => p.preset === 'minimax-cn')!;
    expect(presetParameters(mini)).toEqual({max_completion_tokens: 4096, thinking: {type: 'disabled'}});
    expect(presetParameters({...mini, model: 'different'})).toEqual({max_tokens: 4096});
  });
});
describe('LLM output validation', () => {
  test('parses JSON, strips delimiters, carries uncertainty for user review', () => {
    expect(parseLlm(result(JSON.stringify({latex: '\\[y=x^2\\]', uncertainty: '指数可能是 3'})))).toEqual({latex: 'y=x^2', warning: '指数可能是 3'});
  });
  test('handles JSON fences and MiniMax thinking without showing thinking', () => {
    expect(parseLlm(result('<think>private chain</think>\n```json\n{"latex":"x","uncertainty":""}\n```')).latex).toBe('x');
  });
  test.each([result('I think the answer is x'), result('<think>unfinished'), result('{}'), result('', 'length'), result('null'), {error: {message: 'key'}}, {}])('rejects invalid response %#', r => expect(() => parseLlm(r)).toThrow());
});
describe('image request adapter', () => {
  test.each(PRESETS.filter(p => p.preset !== 'custom'))('sends an image to $label', async p => {
    const fetchMock = jest.fn().mockResolvedValue({ok: true, json: async () => result()});
    expect((await transcribe({base64: 'abc', mime: 'image/png'}, p, 'test-key', fetchMock)).latex).toBe('y=x^2');
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe(p.endpoint); expect(options.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(options.body); expect(body.model).toBe(p.model);
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,abc');
    expect(body.stream).toBe(false); expect(body).not.toHaveProperty('temperature');
  });
  test('no request for text-only model, absent key, or oversized input', async () => {
    const fn = jest.fn(), image = {base64: 'abc', mime: 'image/png'};
    await expect(transcribe(image, {...PRESETS[0], vision: false}, 'key', fn)).rejects.toThrow();
    await expect(transcribe(image, {...PRESETS[0], model: 'MiniMax-M2.7'}, 'key', fn)).rejects.toThrow();
    await expect(transcribe(image, PRESETS[0], '', fn)).rejects.toThrow();
    await expect(transcribe({...image, base64: 'a'.repeat(1900001)}, PRESETS[0], 'key', fn)).rejects.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });
  test('HTTP errors are bounded and never echo secrets', async () => {
    const fn = jest.fn().mockResolvedValue({ok: false, status: 401});
    await expect(transcribe({base64: 'abc', mime: 'image/png'}, PRESETS[0], 'secret-value', fn)).rejects.toThrow('401');
  });
});
