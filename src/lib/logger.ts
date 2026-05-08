type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  module?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

function sanitize(data: unknown): unknown {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack?.split("\n").slice(0, 3).join("\n") };
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (["password", "passwordHash", "token", "secret", "authorization"].includes(k.toLowerCase())) {
        clean[k] = "[REDACTED]";
      } else {
        clean[k] = v;
      }
    }
    return clean;
  }
  return data;
}

function emit(entry: LogEntry) {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    emit({ level: "info", message, data: data ? sanitize(data) as Record<string, unknown> : undefined, timestamp: new Date().toISOString() });
  },
  warn(message: string, data?: Record<string, unknown>) {
    emit({ level: "warn", message, data: data ? sanitize(data) as Record<string, unknown> : undefined, timestamp: new Date().toISOString() });
  },
  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    emit({
      level: "error",
      message,
      data: { ...(data || {}), error: sanitize(error) } as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    });
  },
  api(method: string, path: string, error?: unknown) {
    emit({
      level: "error",
      message: `${method} ${path} failed`,
      module: "api",
      data: error ? { error: sanitize(error) } as Record<string, unknown> : undefined,
      timestamp: new Date().toISOString(),
    });
  },
};
