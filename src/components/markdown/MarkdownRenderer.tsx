import React, { useMemo } from "react";
import { View } from "react-native";
import Markdown from "@ronradtke/react-native-markdown-display";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { MermaidRenderer } from "./MermaidRenderer";
import { HtmlPreview } from "../common/HtmlPreview";

interface MarkdownRendererProps {
  content: string;
}

// P1: 将样式和规则移到组件外部，避免每次渲染重新创建
const mdStyles = {
  body: { fontSize: 15, lineHeight: 22, color: "#1f2937" },
  heading1: { fontSize: 22, fontWeight: "700" as const, color: "#111827", marginTop: 8, marginBottom: 4 },
  heading2: { fontSize: 19, fontWeight: "700" as const, color: "#111827", marginTop: 6, marginBottom: 4 },
  heading3: { fontSize: 17, fontWeight: "600" as const, color: "#111827", marginTop: 4, marginBottom: 2 },
  heading4: { fontSize: 15, fontWeight: "600" as const, color: "#111827", marginTop: 4, marginBottom: 2 },
  paragraph: { marginTop: 0, marginBottom: 4 },
  strong: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  link: { color: "#2563eb" },
  blockquote: { backgroundColor: "#f9fafb", borderLeftWidth: 3, borderLeftColor: "#d1d5db", paddingLeft: 10, paddingVertical: 4, marginVertical: 4 },
  code_inline: { backgroundColor: "#f3f4f6", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, fontSize: 13, fontFamily: "monospace", color: "#e11d48" },
  code_block: { backgroundColor: "#1f2937", padding: 12, borderRadius: 8, fontSize: 13, fontFamily: "monospace", color: "#e5e7eb", marginVertical: 4 },
  fence: { backgroundColor: "#1f2937", padding: 12, borderRadius: 8, fontSize: 13, fontFamily: "monospace", color: "#e5e7eb", marginVertical: 4 },
  bullet_list: { marginVertical: 2 },
  ordered_list: { marginVertical: 2 },
  list_item: { marginVertical: 1 },
  hr: { backgroundColor: "#e5e7eb", height: 1, marginVertical: 8 },
  table: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, marginVertical: 4 },
  tr: { borderBottomWidth: 1, borderColor: "#e5e7eb" },
  td: { padding: 6, fontSize: 13 },
  th: { padding: 6, fontSize: 13, fontWeight: "700" as const },
};

const rules = {
  fence: (node: any) => {
    const lang = (node.sourceInfo || "").toLowerCase();
    const code = node.content || "";
    if (lang === "mermaid") {
      return <MermaidRenderer key={node.key} code={code} />;
    }
    if (lang === "html" || lang === "svg") {
      return <HtmlPreview key={node.key} code={code} language={lang} />;
    }
    return (
      <View key={node.key}>
        <MarkdownCodeBlock content={code} language={node.sourceInfo} />
      </View>
    );
  },
  code_block: (node: any) => {
    const code = node.content || "";
    return (
      <View key={node.key}>
        <MarkdownCodeBlock content={code} language="" />
      </View>
    );
  },
};

// P2: 添加内容长度限制，避免超长内容导致卡顿
const MAX_CONTENT_LENGTH = 50000;

export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // P3: 使用 useMemo 缓存处理后的内容
  const processedContent = useMemo(() => {
    if (content.length > MAX_CONTENT_LENGTH) {
      return content.slice(0, MAX_CONTENT_LENGTH) + "\n\n... (内容过长，已截断)";
    }
    return content;
  }, [content]);

  return (
    <Markdown style={mdStyles} rules={rules}>
      {processedContent}
    </Markdown>
  );
});
