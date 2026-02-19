import React, { useState, useCallback } from "react";
import { View, Text, Pressable, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";

interface MermaidRendererProps {
  code: string;
}

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [height, setHeight] = useState(200);
  const [active, setActive] = useState(false);

  const onMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "resize" && data.height > 0) {
        setHeight(Math.ceil(data.height) + 16);
      }
    } catch {
      // ignore
    }
  }, []);

  const escaped = code.replace(/`/g, "\\`").replace(/<\/script/gi, "<\\/script");

  if (!active) {
    return (
      <Pressable
        onPress={() => setActive(true)}
        className="my-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
      >
        <View className="px-4 py-3">
          <Text className="text-sm font-semibold text-slate-700">Mermaid Diagram</Text>
          <Text className="mt-1 text-[11px] text-slate-500">Tap to render diagram preview</Text>
        </View>
      </Pressable>
    );
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: ${isDark ? "#1e293b" : "#f8fafc"}; display: flex; justify-content: center; padding: 8px; }
    #mermaid-container { width: 100%; overflow-x: auto; }
    #mermaid-container svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="mermaid-container">
    <pre class="mermaid">${escaped}</pre>
  </div>
  <script src="${MERMAID_CDN}"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: '${isDark ? "dark" : "default"}',
      securityLevel: 'strict',
    });
    mermaid.run().then(() => {
      setTimeout(() => {
        const el = document.getElementById('mermaid-container');
        if (el) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'resize',
            height: el.scrollHeight
          }));
        }
      }, 100);
    }).catch(() => {});
  </script>
</body>
</html>`;

  return (
    <View className="my-1 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
      <WebView
        source={{ html }}
        style={{ height, backgroundColor: "transparent" }}
        scrollEnabled={false}
        originWhitelist={["https://"]}
        javaScriptEnabled
        onMessage={onMessage}
      />
    </View>
  );
}
