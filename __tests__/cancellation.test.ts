import {abortable} from '../src/cancellation';
test('cancelling preparation prevents the next upload step', async () => {
  const controller = new AbortController(), upload = jest.fn();
  let finishRead!: (value: string) => void;
  const read = () => new Promise<string>(resolve => { finishRead = resolve; });
  const pending = (async () => {
    await abortable(read, controller.signal);
    await abortable(upload, controller.signal);
  })();
  const assertion = expect(pending).rejects.toThrow('已取消识别');
  await Promise.resolve(); controller.abort(); await assertion;
  finishRead('late image'); await Promise.resolve();
  expect(upload).not.toHaveBeenCalled();
});
