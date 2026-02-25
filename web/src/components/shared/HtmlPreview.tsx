import { memo, useState } from "react";
import { Eye, Code, Maximize2, Minimize2 } from "lucide-react";

interface HtmlPreviewProps {
  code: string;
}

export const HtmlPreview = memo(function HtmlPreview({ code }: HtmlPreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500">HTML</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          >
            {showPreview ? <Code size={12} /> : <Eye size={12} />}
            {showPreview ? "Code" : "Preview"}
          </button>
          {showPreview && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            >
              {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          )}
        </div>
      </div>
      {showPreview ? (
        <iframe
          srcDoc={code}
          sandbox="allow-scripts allow-same-origin"
          className="w-full bg-white border-0"
          style={{ height: expanded ? 480 : 240 }}
          title="HTML Preview"
        />
      ) : (
        <pre className="p-3 text-xs text-gray-800 bg-gray-50 overflow-x-auto max-h-60">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
});
