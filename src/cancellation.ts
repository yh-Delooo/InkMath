export class RecognitionCancelled extends Error {
  constructor() { super('已取消识别'); this.name = 'RecognitionCancelled'; }
}

// Release the UI even when a native operation ignores AbortSignal.
export function abortable<T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { return Promise.reject(new RecognitionCancelled()); }
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { cleanup(); reject(new RecognitionCancelled()); };
    const cleanup = () => signal.removeEventListener('abort', cancel);
    signal.addEventListener('abort', cancel);
    Promise.resolve().then(() => {
      if (signal.aborted) { throw new RecognitionCancelled(); }
      return action();
    }).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
