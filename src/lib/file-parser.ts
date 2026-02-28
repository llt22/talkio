/**
 * File parser — extracts text content from documents for chat context.
 * Supports: PDF, Word (.docx), Excel (.xlsx/.xls), plain text (.txt, .md, .csv, etc.)
 */

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "html", "htm", "js", "ts", "jsx", "tsx",
  "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs", "swift",
  "kt", "sh", "bash", "zsh", "yaml", "yml", "toml", "ini", "cfg", "conf",
  "log", "sql", "graphql", "css", "scss", "less", "svg", "env",
]);

export interface ParsedFile {
  name: string;
  type: "text" | "pdf" | "docx" | "excel" | "image";
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

function isDocx(filename: string): boolean {
  return getExtension(filename) === "docx";
}

function isExcel(filename: string): boolean {
  return ["xlsx", "xls"].includes(getExtension(filename));
}

function isImageFile(filename: string): boolean {
  const ext = getExtension(filename);
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif"].includes(ext);
}


async function readAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  // Try UTF-8 first
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  // If UTF-8 produces replacement characters (U+FFFD), try GBK
  if (utf8.includes("\uFFFD")) {
    try {
      return new TextDecoder("gbk").decode(buffer);
    } catch {
      // GBK decoder not available, return UTF-8 result
    }
  }
  return utf8;
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
  const pdfjs = await import("pdfjs-dist");
  // @ts-ignore — Vite ?url import resolves to a local URL served from same origin (CSP safe)
  const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Langchain-style text extraction with Y-position line breaks
    let lastY: number | undefined;
    const textItems: string[] = [];
    for (const item of content.items) {
      if ("str" in item) {
        if (lastY === (item as any).transform[5] || lastY === undefined) {
          textItems.push((item as any).str);
        } else {
          textItems.push(`\n${(item as any).str}`);
        }
        lastY = (item as any).transform[5];
      }
    }
    const pageText = textItems.join("").replace(/\0/g, "");
    if (pageText.trim()) pages.push(pageText);
    page.cleanup();
  }

  await pdf.destroy();
  return pages.join("\n\n");
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.default.extractRawText({ arrayBuffer });
  return result.value;
}

function sheetToMarkdownTable(jsonData: Record<string, any>[]): string {
  if (!jsonData || jsonData.length === 0) return "*Sheet is empty.*";
  const headers = Object.keys(jsonData[0] || {});
  if (headers.length === 0) return "*Sheet has no data.*";
  const headerRow = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = jsonData.map((row) => {
    const cells = headers.map((h) => {
      const v = row[h];
      return v == null ? "" : String(v).replace(/\|/g, "\\|").trim();
    });
    return `| ${cells.join(" | ")} |`;
  }).join("\n");
  return `${headerRow}\n${separator}\n${dataRows}`;
}

async function extractExcelText(file: File): Promise<string> {
  const xlsx = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = xlsx.read(arrayBuffer, { type: "array" });
  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const json = xlsx.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
    const md = sheetToMarkdownTable(json);
    sheets.push(`## Sheet: ${name}\n\n${md}`);
  }
  return sheets.join("\n\n");
}

const MAX_TEXT_LENGTH = 50_000; // ~12k tokens

function truncate(text: string): string {
  if (text.length > MAX_TEXT_LENGTH) {
    return text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... truncated]";
  }
  return text;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;

  if (isImageFile(name)) {
    const dataUri = await readAsDataUrl(file);
    return { name, type: "image", content: dataUri, size: file.size };
  }

  if (isPdf(name)) {
    const text = truncate(await extractPdfText(file));
    return { name, type: "pdf", content: text, size: file.size };
  }

  if (isDocx(name)) {
    const text = truncate(await extractDocxText(file));
    return { name, type: "docx", content: text, size: file.size };
  }

  if (isExcel(name)) {
    const text = truncate(await extractExcelText(file));
    return { name, type: "excel", content: text, size: file.size };
  }

  if (isTextFile(name)) {
    const text = truncate(await readAsText(file));
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
