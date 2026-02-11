import * as FileSystem from "expo-file-system/legacy";

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_MAP: Record<LogLevel, number> = {
  error: 3,
  warn: 2,
  info: 1,
  debug: 0,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: "🔴",
  warn: "🟡",
  info: "🔵",
  debug: "⚪",
};

const IS_DEV = __DEV__;
const CONSOLE_LEVEL: LogLevel = IS_DEV ? "debug" : "warn";
const FILE_LOG_LEVEL: LogLevel = "warn";

class LoggerService {
  private static instance: LoggerService;
  private module: string = "";
  private logQueue: string[] = [];
  private isWriting = false;
  private logFileUri: string | null = null;
  private fileInitFailed = false;

  private constructor() {
    this.initLogFile();
  }

  private initLogFile() {
    if (this.fileInitFailed) return;
    try {
      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        this.fileInitFailed = true;
        return;
      }
      this.logFileUri = `${docDir}app.log`;
    } catch {
      this.fileInitFailed = true;
      this.logFileUri = null;
    }
  }

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  withContext(module: string): LoggerService {
    const child = Object.create(this) as LoggerService;
    child.module = module;
    return child;
  }

  error(message: string, ...data: any[]) {
    this.log("error", message, data);
  }

  warn(message: string, ...data: any[]) {
    this.log("warn", message, data);
  }

  info(message: string, ...data: any[]) {
    this.log("info", message, data);
  }

  debug(message: string, ...data: any[]) {
    this.log("debug", message, data);
  }

  private log(level: LogLevel, message: string, data: any[]) {
    const timestamp = new Date().toISOString();
    const prefix = this.module ? `[${this.module}]` : "";
    const formatted = `${LEVEL_COLORS[level]} ${timestamp} ${prefix} ${message}`;

    // Console output
    if (LEVEL_MAP[level] >= LEVEL_MAP[CONSOLE_LEVEL]) {
      const args = data.length > 0 ? [formatted, ...data] : [formatted];
      switch (level) {
        case "error":
          console.error(...args);
          break;
        case "warn":
          console.warn(...args);
          break;
        default:
          console.log(...args);
      }
    }

    // File output (warn+ only)
    if (!this.fileInitFailed && LEVEL_MAP[level] >= LEVEL_MAP[FILE_LOG_LEVEL]) {
      const fileLine = `${timestamp} [${level.toUpperCase()}] ${prefix} ${message}${
        data.length > 0 ? " " + JSON.stringify(data) : ""
      }\n`;
      this.enqueueWrite(fileLine);
    }
  }

  private enqueueWrite(line: string) {
    const root = (this as any).root || this;
    root.logQueue.push(line);
    if (!root.isWriting) {
      root.flushQueue();
    }
  }

  private cachedContent: string | null = null;

  private async flushQueue() {
    if (this.isWriting || this.logQueue.length === 0) return;
    this.isWriting = true;

    try {
      const batch = this.logQueue.splice(0);
      const newContent = batch.join("");
      const root = (this as any).root || this;
      const uri = root.logFileUri as string;
      if (!uri) return;
      // P2-1: Read file only once, then append in memory
      if (root.cachedContent === null) {
        try {
          const info = await FileSystem.getInfoAsync(uri);
          root.cachedContent = info.exists ? await FileSystem.readAsStringAsync(uri) : "";
        } catch {
          root.cachedContent = "";
        }
      }
      root.cachedContent += newContent;
      await FileSystem.writeAsStringAsync(uri, root.cachedContent);
    } catch {
      // Silently fail - logging should never crash the app
    } finally {
      this.isWriting = false;
      if (this.logQueue.length > 0) {
        this.flushQueue();
      }
    }
  }

  async getLogContent(): Promise<string> {
    try {
      if (!this.logFileUri) return "";
      const info = await FileSystem.getInfoAsync(this.logFileUri);
      if (!info.exists) return "";
      return await FileSystem.readAsStringAsync(this.logFileUri);
    } catch {
      return "";
    }
  }

  async clearLogs(): Promise<void> {
    try {
      if (!this.logFileUri) return;
      const info = await FileSystem.getInfoAsync(this.logFileUri);
      if (info.exists) await FileSystem.deleteAsync(this.logFileUri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

export const logger = LoggerService.getInstance();
