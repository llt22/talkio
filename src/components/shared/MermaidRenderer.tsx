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
        if (!cancelled) { setSvg(rendered); setError(""); }
      } catch (err: any) {
        if (!cancelled) { setError(err.message || "Render failed"); setSvg(""); }
      }
    }
    render();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className="my-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-600">
        <p className="font-medium mb-1">Mermaid Error</p>
        <pre className="mt-1 text-[10px] bg-red-100 p-2 rounded overflow-x-auto">{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 p-4 rounded-lg bg-gray-50 border border-gray-200 text-center text-xs text-gray-400">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-2 p-3 rounded-lg bg-white border border-gray-200 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});
