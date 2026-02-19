import React, { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable, Modal, Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MotiView } from "moti";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { MarkdownCodeBlock } from "../markdown/MarkdownCodeBlock";

interface HtmlPreviewProps {
  code: string;
  language?: string;
}

export const HtmlPreview = React.memo(function HtmlPreview({ code, language = "html" }: HtmlPreviewProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"preview" | "code">("code");
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [fullscreen, setFullscreen] = useState(false);
  const [userSwitched, setUserSwitched] = useState(false);
  const [codeStable, setCodeStable] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);

  // Debounce code updates to prevent WebView flashing during streaming
  useEffect(() => {
    setCodeStable(false);
    const debounceTimer = setTimeout(() => {
      setDebouncedCode(code);
    }, 120);
    const stableTimer = setTimeout(() => {
      setCodeStable(true);
    }, 500);
    return () => {
      clearTimeout(debounceTimer);
      clearTimeout(stableTimer);
    };
  }, [code]);

  const handleTabSwitch = (tab: "preview" | "code") => {
    setUserSwitched(true);
    setActiveTab(tab);
    if (tab === "preview") {
      setPreviewEnabled(true);
    }
  };

  const wrappedHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body { overflow-x: hidden; max-width: 100vw; overscroll-behavior: none; }
    body { background-color: #fff; color: #121212; margin: 0; padding: 12px; font-family: system-ui, sans-serif; box-sizing: border-box; word-break: break-word; }
  </style>
</head>
<body>${debouncedCode}</body>
</html>`;

  const webViewSource = useMemo(() => ({ html: wrappedHtml }), [wrappedHtml]);

  const handleCopy = () => {
    Clipboard.setStringAsync(code);
  };

  // During streaming: show compact placeholder (skip if user manually switched tab)
  if (!codeStable && !userSwitched) {
    return (
      <View className="mt-1 overflow-hidden rounded-xl border border-border-light bg-white">
        <View className="flex-row items-center gap-3 px-4 py-4">
          <MotiView
            from={{ rotate: "0deg" }}
            animate={{ rotate: "360deg" }}
            transition={{ type: "timing", duration: 1500, loop: true }}
          >
            <Ionicons name="code-slash-outline" size={18} color="#6b7280" />
          </MotiView>
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-600">
              {language.toUpperCase()} {t("htmlPreview.writing")}
            </Text>
            <Text className="mt-0.5 text-[11px] text-gray-400">
              {code.split("\n").length} lines
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="mt-1 overflow-hidden rounded-xl border border-border-light bg-white">
      {/* Tab bar */}
      <View className="flex-row border-b border-border-light">
        <Pressable
          onPress={() => handleTabSwitch("preview")}
          className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 ${
            activeTab === "preview" ? "bg-blue-50" : "bg-slate-50"
          }`}
        >
          <Ionicons
            name="eye-outline"
            size={15}
            color={activeTab === "preview" ? "#2563eb" : "#6b7280"}
          />
          <Text
            className={`text-xs font-bold ${
              activeTab === "preview" ? "text-blue-600" : "text-gray-500"
            }`}
          >
            Preview
          </Text>
        </Pressable>
        <View className="w-px bg-border-light" />
        <Pressable
          onPress={() => handleTabSwitch("code")}
          className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 ${
            activeTab === "code" ? "bg-blue-50" : "bg-slate-50"
          }`}
        >
          <Ionicons
            name="code-slash-outline"
            size={15}
            color={activeTab === "code" ? "#2563eb" : "#6b7280"}
          />
          <Text
            className={`text-xs font-bold ${
              activeTab === "code" ? "text-blue-600" : "text-gray-500"
            }`}
          >
            Code
          </Text>
        </Pressable>
        <View className="w-px bg-border-light" />
        <Pressable
          onPress={handleCopy}
          className="items-center justify-center bg-slate-50 px-3"
        >
          <Ionicons name="copy-outline" size={14} color="#6b7280" />
        </Pressable>
        <View className="w-px bg-border-light" />
        <Pressable
          onPress={() => setFullscreen(true)}
          className="items-center justify-center bg-slate-50 px-3"
        >
          <Ionicons name="expand-outline" size={14} color="#6b7280" />
        </Pressable>
      </View>

      {/* Content: WebView lazy loaded only when Preview tab is active */}
      {activeTab === "preview" && (
        previewEnabled ? (
          <View style={{ height: 400 }}>
            <WebView
              source={webViewSource}
              style={{ flex: 1 }}
              originWhitelist={["https://"]}
              javaScriptEnabled
              scrollEnabled
              showsVerticalScrollIndicator
            />
          </View>
        ) : (
          <Pressable
            onPress={() => setPreviewEnabled(true)}
            className="items-center justify-center px-4 py-6"
          >
            <Text className="text-sm font-semibold text-slate-700">Tap to render preview</Text>
            <Text className="mt-1 text-[11px] text-slate-500">WebView is lazy-loaded to improve performance</Text>
          </Pressable>
        )
      )}
      <View style={{ display: activeTab === "code" ? "flex" : "none" }}>
        <MarkdownCodeBlock content={code} language={language} />
      </View>
      {/* Fullscreen Modal */}
      <Modal visible={fullscreen} animationType="slide" presentationStyle="fullScreen">
        <FullscreenPreview code={debouncedCode} onClose={() => setFullscreen(false)} />
      </Modal>
    </View>
  );
});

function FullscreenPreview({ code, onClose }: { code: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  const fullscreenHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { background-color: #fff; color: #121212; margin: 0; padding: 16px; font-family: system-ui, sans-serif; box-sizing: border-box; word-break: break-word; }
  </style>
</head>
<body>${code}</body>
</html>`;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" />
      <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
        <Text className="text-base font-semibold text-gray-900">HTML Preview</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color="#6b7280" />
        </Pressable>
      </View>
      <WebView
        source={{ html: fullscreenHtml }}
        style={{ flex: 1 }}
        originWhitelist={["https://"]}
        javaScriptEnabled
        scrollEnabled
        nestedScrollEnabled
      />
    </View>
  );
}
