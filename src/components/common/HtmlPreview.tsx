import React from "react";
import { View, Text, Pressable, SafeAreaView, StatusBar } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

interface HtmlPreviewProps {
  html: string;
  onClose: () => void;
}

export function HtmlPreview({ html, onClose }: HtmlPreviewProps) {
  // P2-4: Sanitize HTML to prevent XSS
  const sanitized = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=/gi, " data-removed=");

  const wrappedHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;" />
      <style>
        body { font-family: -apple-system, system-ui, sans-serif; padding: 16px; margin: 0; }
        @media (prefers-color-scheme: dark) {
          body { background: #1a1a1a; color: #e5e5e5; }
          a { color: #60a5fa; }
        }
      </style>
    </head>
    <body>${sanitized}</body>
    </html>
  `;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <StatusBar barStyle="dark-content" />
      <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
        <Text className="text-lg font-semibold text-gray-900">HTML Preview</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color="#6b7280" />
        </Pressable>
      </View>
      <WebView
        source={{ html: wrappedHtml }}
        style={{ flex: 1 }}
        originWhitelist={["*"]}
        javaScriptEnabled={false}
        scrollEnabled
      />
    </SafeAreaView>
  );
}
