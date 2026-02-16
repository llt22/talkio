import React, { useMemo, createContext, useContext } from "react";
import { View, Text, useColorScheme } from "react-native";

const DarkModeContext = createContext(false);

let parseMarkdownWithOptions: any = null;
let isNitroAvailable = false;

try {
  const nitro = require("react-native-nitro-markdown");
  parseMarkdownWithOptions = nitro.parseMarkdownWithOptions;
  isNitroAvailable = true;
} catch {
  // nitro not available (Expo Go), will use fallback
}

import { MarkdownFallback } from "./MarkdownFallback";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { MermaidRenderer } from "./MermaidRenderer";
import { HtmlPreview } from "../common/HtmlPreview";

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!isNitroAvailable) {
    return <MarkdownFallback content={content} />;
  }

  return <NitroMarkdownRenderer content={content} />;
});

function NitroMarkdownRenderer({ content }: { content: string }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const ast = useMemo(() => {
    return parseMarkdownWithOptions(content, { gfm: true, math: true });
  }, [content]);

  return (
    <DarkModeContext.Provider value={isDark}>
      <NodeRenderer node={ast} />
    </DarkModeContext.Provider>
  );
}

interface NodeRendererProps {
  node: any;
  textClassName?: string;
}

function getTextContent(node: any): string {
  if (node.content) return node.content;
  if (!node.children) return "";
  return node.children.map(getTextContent).join("");
}

function NodeRenderer({ node }: NodeRendererProps) {
  const isDark = useContext(DarkModeContext);

  const renderChildren = (targetNode: any = node) => {
    if (!targetNode.children) return null;
    return targetNode.children.map((child: any, index: number) => (
      <NodeRenderer key={index} node={child} />
    ));
  };

  switch (node.type) {
    case "document":
      return <View className="gap-1">{renderChildren()}</View>;

    case "paragraph":
      return (
        <Text className="text-[15px] leading-[22px] text-gray-800 dark:text-gray-200 mb-1">
          {node.children?.map((child: any, i: number) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </Text>
      );

    case "heading": {
      const level = node.level || 1;
      const sizeClass = [
        "text-[22px] font-bold",
        "text-[19px] font-bold",
        "text-[17px] font-semibold",
        "text-[15px] font-semibold",
        "text-[14px] font-semibold",
        "text-[13px] font-semibold",
      ][level - 1] || "text-[15px] font-semibold";

      return (
        <Text className={`${sizeClass} text-gray-900 dark:text-gray-100 mt-2 mb-1`}>
          {node.children?.map((child: any, i: number) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </Text>
      );
    }

    case "text":
      return <Text>{node.content || ""}</Text>;

    case "soft_break":
      return <Text>{" "}</Text>;

    case "line_break":
      return <Text>{"\n"}</Text>;

    case "bold":
      return (
        <Text className="font-bold">
          {node.children?.map((child: any, i: number) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </Text>
      );

    case "italic":
      return (
        <Text className="italic">
          {node.children?.map((child: any, i: number) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </Text>
      );

    case "strikethrough":
      return (
        <Text className="line-through">
          {node.children?.map((child: any, i: number) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </Text>
      );

    case "code_inline":
      return (
        <Text className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-[13px] font-mono text-rose-600 dark:text-rose-400">
          {node.content || ""}
        </Text>
      );

    case "code_block": {
      const lang = (node.language || "").toLowerCase();
      if (lang === "mermaid") {
        return <MermaidRenderer code={getTextContent(node)} />;
      }
      if (lang === "html" || lang === "svg") {
        return <HtmlPreview code={getTextContent(node)} language={lang} />;
      }
      return (
        <MarkdownCodeBlock
          content={getTextContent(node)}
          language={node.language}
        />
      );
    }

    case "link":
      return (
        <Text className="text-blue-600 dark:text-blue-400 underline">
          {node.children?.map((child: any, i: number) => (
            <NodeRenderer key={i} node={child} />
          ))}
        </Text>
      );

    case "list": {
      const ordered = node.ordered ?? false;
      const start = node.start ?? 1;
      return (
        <View className="my-1 pl-2">
          {node.children?.map((child: any, index: number) => {
            const marker = ordered ? `${start + index}.` : "•";
            return (
              <View key={index} className="flex-row mb-0.5">
                <Text className="text-[15px] text-gray-500 dark:text-gray-400 w-5 mr-1">
                  {marker}
                </Text>
                <View className="flex-1 flex-shrink">
                  {renderChildren(child)}
                </View>
              </View>
            );
          })}
        </View>
      );
    }

    case "list_item":
      return <>{renderChildren()}</>;

    case "blockquote":
      return (
        <View className="border-l-[3px] border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 pl-3 py-1 my-1 rounded-r">
          {renderChildren()}
        </View>
      );

    case "horizontal_rule":
      return <View className="h-px bg-gray-200 dark:bg-gray-700 my-2" />;

    case "table":
      return (
        <View className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden my-2">
          {renderChildren()}
        </View>
      );

    case "table_head":
    case "table_body":
      return <>{renderChildren()}</>;

    case "table_row":
      return (
        <View className="flex-row border-b border-gray-200 dark:border-gray-700">
          {renderChildren()}
        </View>
      );

    case "table_cell":
      return (
        <View className="flex-1 px-2 py-1">
          <Text className={`text-[13px] ${node.isHeader ? "font-bold" : ""} text-gray-800 dark:text-gray-200`}>
            {renderChildren()}
          </Text>
        </View>
      );

    default:
      if (node.children) return <>{renderChildren()}</>;
      if (node.content) return <Text>{node.content}</Text>;
      return null;
  }
}
