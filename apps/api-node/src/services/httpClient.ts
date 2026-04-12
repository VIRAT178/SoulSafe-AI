type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type RequestOptions = {
  serviceName: string;
  url: string;
  method?: "GET" | "POST" | "PATCH";
  body?: Record<string, JsonValue>;
  retries?: number;
  timeoutMs?: number;
};

type CircuitState = {
  failures: number;
  openUntil: number;
};

const circuits = new Map<string, CircuitState>();

function getState(serviceName: string): CircuitState {
  return circuits.get(serviceName) || { failures: 0, openUntil: 0 };
}

function setState(serviceName: string, state: CircuitState): void {
  circuits.set(serviceName, state);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resilientJsonRequest<T>(options: RequestOptions): Promise<T> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 3000;

  const state = getState(options.serviceName);
  if (Date.now() < state.openUntil) {
    throw new Error(`${options.serviceName} circuit is open`);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(options.url, {
        method: options.method || "GET",
        headers: { "Content-Type": "application/json" },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`${options.serviceName} returned status ${response.status}`);
      }

      setState(options.serviceName, { failures: 0, openUntil: 0 });
      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error as Error;

      const current = getState(options.serviceName);
      const failures = current.failures + 1;
      const openUntil = failures >= 3 ? Date.now() + 15000 : 0;
      setState(options.serviceName, { failures, openUntil });

      if (attempt < retries) {
        await sleep((attempt + 1) * 300);
      }
    }
  }

  throw lastError || new Error("Request failed");
}
