import { useEffect, useRef, useState, memo } from "react";

let mermaidCounter = 0;
let mermaidInstance: any = null;

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance;
  const { default: m } = await import("mermaid");
  m.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });
  mermaidInstance = m;
  return m;
}

interface MermaidRendererProps {
  chart: string;
}

export const MermaidRenderer = memo(function MermaidRenderer({ chart }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const idRef = useRef(`mermaid-${++mermaidCounter}`);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const m = await getMermaid();
        const { svg: rendered } = await m.render(idRef.current, chart.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError("");
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Render failed");
          setSvg("");
        }
      }
    }
    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
        <p className="mb-1 font-medium">Mermaid Error</p>
        <pre className="mt-1 overflow-x-auto rounded bg-red-100 p-2 text-[10px]">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-400">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-2 overflow-x-auto rounded-lg border border-gray-200 bg-white p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
