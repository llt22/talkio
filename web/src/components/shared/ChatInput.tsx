import { memo, useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IoClose, IoArrowUp, IoImageOutline, IoSwapHorizontalOutline, IoStop, IoMicOutline } from "react-icons/io5";

// ── ChatInput — direct 1:1 port of RN src/components/chat/ChatInput.tsx ──

interface ChatInputProps {
  onSend: (text: string, images?: string[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  placeholder?: string;
  modelName?: string;
  onSwitchModel?: () => void;
  isMobile?: boolean;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  isGenerating,
  onStop,
  placeholder,
  modelName,
  onSwitchModel,
  isMobile = false,
}: ChatInputProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("chat.message");
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    const hasImages = attachedImages.length > 0;
    if ((!trimmed && !hasImages) || isGenerating) return;
    onSend(trimmed, hasImages ? attachedImages : undefined);
    setText("");
    setAttachedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachedImages, isGenerating, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMobile) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [isMobile, handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, []);

  // RN: ImagePicker.launchImageLibraryAsync → web: <input type="file">
  const handleAttach = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files) return;
      const newImages: string[] = [];
      for (let i = 0; i < Math.min(files.length, 4); i++) {
        const file = files[i];
        const reader = new FileReader();
        const dataUri = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newImages.push(dataUri);
      }
      setAttachedImages((prev) => [...prev, ...newImages].slice(0, 4));
    };
    input.click();
  }, []);

  // RN: ScrollView horizontal → web: flex overflow-x-auto
  return (
    <div className="flex-shrink-0" style={{ backgroundColor: "var(--background)", borderTop: "0.5px solid var(--border)" }}>
      {/* Attached images preview — RN: ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-2" */}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 px-4 pt-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {attachedImages.map((uri: string, idx: number) => (
            <div key={idx} className="relative flex-shrink-0 mr-2">
              {/* RN: Image source={{ uri: img.uri }} className="h-16 w-16 rounded-lg" contentFit="cover" */}
              <img src={uri} className="h-16 w-16 rounded-lg object-cover" />
              {/* RN: Pressable className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-black/60" */}
              <button
                onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute -right-1 -top-1 h-5 w-5 flex items-center justify-center rounded-full active:opacity-60"
                style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
              >
                {/* RN: Ionicons name="close" size={12} color="#fff" */}
                <IoClose size={12} color="white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Row 1: Input area — RN: View className="px-4 pt-2.5 pb-1.5" */}
      <div className="px-4 pt-2.5 pb-1.5">
        {/* RN: View className="flex-row items-end rounded-2xl border border-border-light/50 bg-bg-input px-3" */}
        <div
          className="flex items-center rounded-2xl px-3"
          style={{ backgroundColor: "var(--muted)", border: "0.5px solid color-mix(in srgb, var(--border) 50%, transparent)" }}
        >
          {/* RN: TextInput className="max-h-24 min-h-[44px] flex-1 text-[16px] text-text-main py-2.5" */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => { setText(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder={resolvedPlaceholder}
            disabled={isGenerating}
            rows={1}
            className="flex-1 min-h-[44px] max-h-24 resize-none bg-transparent text-[16px] text-foreground py-2.5 outline-none placeholder:text-muted-foreground/50"
          />
          {/* RN: Pressable className="mb-1.5 ml-1.5 h-9 w-9 items-center justify-center rounded-full bg-primary" */}
          {(text.trim() || attachedImages.length > 0) && !isGenerating && (
            <button
              onClick={handleSend}
              className="my-1.5 ml-1.5 h-9 w-9 flex items-center justify-center rounded-full flex-shrink-0 active:opacity-70"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {/* RN: Ionicons name="arrow-up" size={18} color="#fff" */}
              <IoArrowUp size={18} color="white" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Action bar — RN: View className="flex-row items-center px-3 pb-1 gap-0.5" */}
      <div className="flex items-center px-3 pb-1 gap-0.5">
        {/* Image attach — RN: Ionicons name="image-outline" size={22} */}
        <button
          onClick={handleAttach}
          className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-60"
          disabled={isGenerating}
        >
          <IoImageOutline size={22} color={isGenerating ? "#8E8E93" : "#6b7280"} />
        </button>

        {/* Model switch (single chat only) — RN: Ionicons name="swap-horizontal-outline" + modelName */}
        {modelName && onSwitchModel && (
          <button
            onClick={onSwitchModel}
            className="flex items-center gap-1.5 rounded-full px-3 py-2 ml-0.5 active:opacity-60"
            disabled={isGenerating}
          >
            {/* RN: Ionicons name="swap-horizontal-outline" size={16} */}
            <IoSwapHorizontalOutline size={16} color={isGenerating ? "#8E8E93" : "#6b7280"} />
            <span className="text-[13px] font-medium truncate max-w-[150px]" style={{ color: isGenerating ? "#8E8E93" : "#6b7280" }}>{modelName}</span>
          </button>
        )}

        <div className="flex-1" />

        {/* Voice / Stop — RN: isGenerating ? stop : mic-outline */}
        {isGenerating ? (
          <button
            onClick={onStop}
            className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: "#ef4444" }}
          >
            {/* RN: Ionicons name="stop" size={14} color="#fff" */}
            <IoStop size={14} color="white" />
          </button>
        ) : (
          <button className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-60">
            {/* RN: Ionicons name="mic-outline" size={22} color={colors.textSecondary} */}
            <IoMicOutline size={22} color="#6b7280" />
          </button>
        )}
      </div>
    </div>
  );
});
