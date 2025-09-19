type Options = { timeoutMs?: number; retries?: number; backoffMs?: number; breakerKey?: string; halfOpenAfterMs?: number };

const breakerState = new Map<string, { open: boolean; lastFailureAt: number; failures: number }>();

export async function withResilience<T>(fn: () => Promise<T>, opts: Options = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 500;
  const breakerKey = opts.breakerKey;
  const halfOpenAfterMs = opts.halfOpenAfterMs ?? 15000;

  if (breakerKey) {
    const st = breakerState.get(breakerKey);
    if (st?.open && Date.now() - st.lastFailureAt < halfOpenAfterMs) {
      throw new Error(`circuit_open:${breakerKey}`);
    }
  }

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await promiseWithTimeout(fn(), timeoutMs);
      if (breakerKey) breakerState.set(breakerKey, { open: false, lastFailureAt: 0, failures: 0 });
      return result;
    } catch (err) {
      lastErr = err;
      if (breakerKey) {
        const st = breakerState.get(breakerKey) || { open: false, lastFailureAt: 0, failures: 0 };
        st.failures += 1;
        st.lastFailureAt = Date.now();
        if (st.failures >= 3) st.open = true;
        breakerState.set(breakerKey, st);
      }
      if (attempt < retries) await sleep(backoffMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}

function promiseWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); });
  return Promise.race([p.finally(() => clearTimeout(t)), timeout]);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
