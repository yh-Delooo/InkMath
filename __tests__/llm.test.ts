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

describe('cancellation, timeouts and HTTP diagnostics', () => {
  const image = {base64: 'abc', mime: 'image/png'};
  afterEach(() => jest.useRealTimers());
  test('503 explains temporary service failure without exposing response body', async () => {
    const fn = jest.fn().mockResolvedValue({ok: false, status: 503, json: jest.fn(() => ({error: {message: 'secret'}}))});
    await expect(transcribe(image, PRESETS[0], 'secret', fn)).rejects.toThrow('服务端或中间网关暂不可用');
  });
  test('pre-cancelled recognition never sends a request', async () => {
    const controller = new AbortController(), fn = jest.fn(); controller.abort();
    await expect(transcribe(image, PRESETS[0], 'key', fn, {signal: controller.signal})).rejects.toThrow('已取消识别');
    expect(fn).not.toHaveBeenCalled();
  });
  test('cancellation releases a hanging transport and aborts the actual request', async () => {
    const controller = new AbortController();
    const fn = jest.fn(() => new Promise<Response>(() => {}));
    const pending = transcribe(image, PRESETS[0], 'key', fn, {signal: controller.signal});
    const assertion = expect(pending).rejects.toThrow('已取消识别');
    await Promise.resolve(); controller.abort();
    await assertion;
    expect((fn.mock.calls as any)[0][1].signal.aborted).toBe(true);
  });
  test('timeout releases a transport even when it ignores AbortSignal', async () => {
    jest.useFakeTimers();
    const pending = transcribe(image, PRESETS[0], 'key', jest.fn(() => new Promise<Response>(() => {})));
    const assertion = expect(pending).rejects.toThrow('未收到完整响应');
    await jest.advanceTimersByTimeAsync(90000); await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });
  test('cancellation while reading response discards late results', async () => {
    const controller = new AbortController(), progress = jest.fn();
    let complete!: (data: unknown) => void;
    const json = jest.fn(() => new Promise(resolve => { complete = resolve; }));
    const pending = transcribe(image, PRESETS[0], 'key', jest.fn().mockResolvedValue({ok: true, json}), {signal: controller.signal, onProgress: progress});
    const assertion = expect(pending).rejects.toThrow('已取消识别');
    for (let i = 0; i < 5; i++) { await Promise.resolve(); }
    expect(json).toHaveBeenCalled();
    controller.abort(); await assertion; complete(result());
    expect(progress.mock.calls).toEqual([[40], [80]]);
  });
  test('timeout includes response-read stage', async () => {
    jest.useFakeTimers();
    const pending = transcribe(image, PRESETS[0], 'key', jest.fn().mockResolvedValue({ok: true, json: () => new Promise(() => {})}));
    const assertion = expect(pending).rejects.toThrow('已收到响应');
    await jest.advanceTimersByTimeAsync(90000); await assertion;
  });
});
