/**
 * File parser — extracts text content from documents for chat context.
 * Supports: PDF, plain text (.txt, .md, .csv, .json, .xml, .html, .js, .ts, .py, etc.)
 */

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "html", "htm", "js", "ts", "jsx", "tsx",
  "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs", "swift",
  "kt", "sh", "bash", "zsh", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "log", "sql", "graphql", "css", "scss", "less", "svg", "env",
]);

export interface ParsedFile {
  name: string;
  type: "text" | "pdf" | "image";
  content: string; // extracted text or data URI for images
  size: number;
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function isTextFile(filename: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(filename));
}

function isPdf(filename: string): boolean {
  return getExtension(filename) === "pdf";
}

export function isImageFile(filename: string): boolean {
  const ext = getExtension(filename);
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif"].includes(ext);
}

export function isSupportedFile(filename: string): boolean {
  return isTextFile(filename) || isPdf(filename) || isImageFile(filename);
}

async function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");

  // Use fake worker to avoid web worker setup issues in Tauri
  GlobalWorkerOptions.workerSrc = "";
  const pdfjs = await import("pdfjs-dist");
  if ("workerPort" in GlobalWorkerOptions) {
    // pdfjs v4+ uses workerPort; disable it
    (GlobalWorkerOptions as any).workerPort = null;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join("");
    if (pageText.trim()) pages.push(pageText);
  }

  return pages.join("\n\n");
}

const MAX_TEXT_LENGTH = 50_000; // ~12k tokens

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;

  if (isImageFile(name)) {
    const dataUri = await readAsDataUrl(file);
    return { name, type: "image", content: dataUri, size: file.size };
  }

  if (isPdf(name)) {
    let text = await extractPdfText(file);
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... truncated]";
    }
    return { name, type: "pdf", content: text, size: file.size };
  }

  if (isTextFile(name)) {
    let text = await readAsText(file);
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... truncated]";
    }
    return { name, type: "text", content: text, size: file.size };
  }

  throw new Error(`Unsupported file type: ${name}`);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build a text prefix from attached documents to prepend to the user message.
 */
export function buildFileContext(files: ParsedFile[]): string {
  const docs = files.filter((f) => f.type !== "image");
  if (docs.length === 0) return "";
  return docs
    .map((f) => `<file name="${f.name}">\n${f.content}\n</file>`)
    .join("\n\n") + "\n\n";
}
