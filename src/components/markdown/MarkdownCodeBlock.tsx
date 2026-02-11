import React from "react";
import { View, Text, Pressable, useColorScheme } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";

let CodeHighlighter: any = null;
let atomOneDark: any = {};
let atomOneLight: any = {};

try {
  CodeHighlighter = require("react-native-code-highlighter").default;
  const styles = require("react-syntax-highlighter/dist/esm/styles/hljs");
  atomOneDark = styles.atomOneDark;
  atomOneLight = styles.atomOneLight;
} catch {
  // fallback below
}

interface MarkdownCodeBlockProps {
  content: string;
  language?: string;
}

export function MarkdownCodeBlock({ content, language = "text" }: MarkdownCodeBlockProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const lang = language || "text";

  const handleCopy = () => {
    Clipboard.setStringAsync(content);
  };

  return (
    <View className="mt-1 rounded-xl border border-border-light bg-slate-50 overflow-hidden">
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-border-light bg-slate-100/50">
        <Text className="text-[10px] font-mono font-bold text-text-muted uppercase">
          {lang}
        </Text>
        <Pressable onPress={handleCopy} className="flex-row items-center gap-1 px-2 py-0.5 rounded active:bg-slate-200">
          <Ionicons name="copy-outline" size={12} color="#6b7280" />
        </Pressable>
      </View>
      <View className="px-3 py-2">
        {CodeHighlighter ? (
          <CodeHighlighter
            customStyle={{ backgroundColor: "transparent" }}
            scrollViewProps={{ contentContainerStyle: { backgroundColor: "transparent" } }}
            textStyle={{ fontSize: 13, fontFamily: "monospace" }}
            hljsStyle={isDark ? atomOneDark : atomOneLight}
            language={lang}
            horizontal={false}
          >
            {content}
          </CodeHighlighter>
        ) : (
          <Text className="text-[13px] font-mono text-gray-200 dark:text-gray-300">
            {content}
          </Text>
        )}
      </View>
    </View>
  );
}
