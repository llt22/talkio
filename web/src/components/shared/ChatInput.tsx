import { memo, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, ArrowUp, Image, ArrowLeftRight, Square, Mic, MessagesSquare, AtSign } from "lucide-react";
import type { ConversationParticipant, Model } from "../../../../src/types";
import { extractMentionedModelIds } from "../../lib/mention-parser";
import { useProviderStore } from "../../stores/provider-store";
import { getAvatarProps } from "../../lib/avatar-utils";

// ── ChatInput — 1:1 port of RN src/components/chat/ChatInput.tsx ──

interface ChatInputProps {
  onSend: (text: string, mentionedModelIds?: string[], images?: string[]) => void;
  isGenerating: boolean;
  onStop: () => void;
  placeholder?: string;
  modelName?: string;
  onSwitchModel?: () => void;
  isMobile?: boolean;
  isGroup?: boolean;
  participants?: ConversationParticipant[];
  hasMessages?: boolean;
  onStartAutoDiscuss?: (rounds: number, topicText?: string) => void;
  onStopAutoDiscuss?: () => void;
  autoDiscussRemaining?: number;
  autoDiscussTotalRounds?: number;
}

export const ChatInput = memo(function ChatInput({
  onSend,
  isGenerating,
  onStop,
  placeholder,
  modelName,
  onSwitchModel,
  isMobile = false,
  isGroup = false,
  participants = [],
  hasMessages = false,
  onStartAutoDiscuss,
  onStopAutoDiscuss,
  autoDiscussRemaining = 0,
  autoDiscussTotalRounds = 0,
}: ChatInputProps) {
  const { t } = useTranslation();
  const getModelById = useProviderStore((s) => s.getModelById);
  const resolvedPlaceholder = placeholder ?? t("chat.message");
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  const isAutoDiscussing = autoDiscussRemaining > 0;

  const modelNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      const model = getModelById(p.modelId);
      if (model) map.set(p.modelId, model.displayName);
    }
    return map;
  }, [participants, getModelById]);

  const participantModels = useMemo(() => {
    return participants.map((p) => getModelById(p.modelId)).filter(Boolean) as Model[];
  }, [participants, getModelById]);

  const insertMention = useCallback((modelId: string) => {
    const model = getModelById(modelId);
    if (!model) return;
    const mentionText = "@" + model.displayName.replace(/\s+/g, "") + " ";
    setText((prev) => prev + mentionText);
    setShowMentionPicker(false);
    textareaRef.current?.focus();
  }, [getModelById]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    const hasImages = attachedImages.length > 0;
    if ((!trimmed && !hasImages) || isGenerating) return;
    let mentionedIds: string[] | undefined;
    if (isGroup) {
      const ids = extractMentionedModelIds(trimmed, modelNames);
      if (ids.length > 0) mentionedIds = ids;
    }
    onSend(trimmed, mentionedIds, hasImages ? attachedImages : undefined);
    setText("");
    setAttachedImages([]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, attachedImages, isGenerating, onSend, isGroup, modelNames]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMobile) return;
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    },
    [isMobile, handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, []);

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

  return (
    <div className="flex-shrink-0" style={{ backgroundColor: "var(--background)", borderTop: "0.5px solid var(--border)" }}>
      {/* Auto-discuss round picker */}
      {showRoundPicker && !isAutoDiscussing && (
        <div className="px-4 py-3">
          <p className="mb-3 text-[13px] text-muted-foreground">{t("chat.autoDiscussHint")}</p>
          <div className="flex gap-2.5">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setShowRoundPicker(false);
                  if (!hasMessages) {
                    const trimmed = text.trim();
                    if (!trimmed) { textareaRef.current?.focus(); return; }
                    setText("");
                    onStartAutoDiscuss?.(n, trimmed);
                  } else {
                    onStartAutoDiscuss?.(n);
                  }
                }}
                className="flex-1 flex flex-col items-center rounded-2xl border py-3 active:opacity-70"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--secondary)" }}
              >
                <span className="text-[18px] font-bold" style={{ color: "var(--primary)" }}>{n}</span>
                <span className="mt-0.5 text-[11px] text-muted-foreground">{t("chat.autoDiscussRounds", { count: n })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* @Mention picker */}
      {showMentionPicker && isGroup && (
        <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--border)", backgroundColor: "var(--muted)" }}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("chat.selectModel")}
          </p>
          {participantModels.map((model) => {
            const { color: avatarColor, initials } = getAvatarProps(model.displayName);
            return (
              <button
                key={model.id}
                onClick={() => insertMention(model.id)}
                className="flex items-center gap-3 py-2.5 w-full text-left active:opacity-60"
              >
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials}
                </div>
                <span className="text-[15px] font-medium text-foreground">{model.displayName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Auto-discuss control panel */}
      {isAutoDiscussing ? (
        <div className="px-4 pt-3 pb-2">
          <div className="rounded-2xl px-4 py-4" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)" }}>
            <div className="flex items-center justify-center mb-3">
              <MessagesSquare size={20} color="var(--primary)" className="animate-pulse" />
              <span className="ml-2 text-[15px] font-semibold" style={{ color: "var(--primary)" }}>
                {t("chat.autoDiscussRunning")}
              </span>
            </div>
            <div className="mb-3.5 rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 15%, transparent)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ backgroundColor: "var(--primary)", width: ((autoDiscussTotalRounds - autoDiscussRemaining + 1) / autoDiscussTotalRounds * 100) + "%" }}
              />
            </div>
            <p className="text-center text-[13px] text-muted-foreground mb-4">
              {t("chat.autoDiscussProgress", { current: autoDiscussTotalRounds - autoDiscussRemaining + 1, total: autoDiscussTotalRounds })}
            </p>
            <button
              onClick={onStopAutoDiscuss}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 active:opacity-70"
              style={{ backgroundColor: "var(--card)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}
            >
              <div className="h-5 w-5 flex items-center justify-center rounded-full" style={{ backgroundColor: "var(--destructive)" }}>
                <Square size={10} color="white" />
              </div>
              <span className="text-[14px] font-semibold" style={{ color: "var(--destructive)" }}>{t("chat.autoDiscussStop")}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Attached images preview */}
          {attachedImages.length > 0 && (
            <div className="flex gap-2 px-4 pt-2 overflow-x-auto" style={{ scrollbarWidth: "none" as any }}>
              {attachedImages.map((uri: string, idx: number) => (
                <div key={idx} className="relative flex-shrink-0 mr-2">
                  <img src={uri} className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute -right-1 -top-1 h-5 w-5 flex items-center justify-center rounded-full active:opacity-60"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                  >
                    <X size={12} color="white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="px-4 pt-2.5 pb-1.5">
            <div
              className="flex items-center rounded-2xl px-3"
              style={{ backgroundColor: "var(--muted)", border: "0.5px solid color-mix(in srgb, var(--border) 50%, transparent)" }}
            >
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
              {(text.trim() || attachedImages.length > 0) && !isGenerating && (
                <button
                  onClick={handleSend}
                  className="my-1.5 ml-1.5 h-9 w-9 flex items-center justify-center rounded-full flex-shrink-0 active:opacity-70"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  <ArrowUp size={18} color="white" />
                </button>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center px-3 gap-0.5" style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 4px))" }}>
            <button onClick={handleAttach} className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-60" disabled={isGenerating}>
              <Image size={22} color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"} />
            </button>

            {isGroup && (
              <button
                onClick={() => { setShowMentionPicker((v) => !v); setShowRoundPicker(false); }}
                className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-60"
                disabled={isGenerating}
              >
                <AtSign size={20} color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"} />
              </button>
            )}

            {modelName && onSwitchModel && (
              <button onClick={onSwitchModel} className="flex items-center gap-1.5 rounded-full px-3 py-2 ml-0.5 active:opacity-60" disabled={isGenerating}>
                <ArrowLeftRight size={16} color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"} />
                <span className="text-[13px] font-medium truncate max-w-[150px]" style={{ color: isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)" }}>{modelName}</span>
              </button>
            )}

            {isGroup && (
              <button
                onClick={() => { setShowRoundPicker((v) => !v); setShowMentionPicker(false); }}
                className="flex items-center gap-1.5 rounded-full px-3 py-2 ml-0.5 active:opacity-60"
                disabled={isGenerating}
              >
                <MessagesSquare size={20} color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"} />
                <span className="text-[13px] font-medium" style={{ color: isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)" }}>
                  {t("chat.autoDiscuss")}
                </span>
              </button>
            )}

            <div className="flex-1" />

            {isGenerating ? (
              <button onClick={onStop} className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-70" style={{ backgroundColor: "var(--destructive)" }}>
                <Square size={14} color="white" />
              </button>
            ) : (
              <button className="h-10 w-10 flex items-center justify-center rounded-full active:opacity-60">
                <Mic size={22} color="var(--secondary-foreground)" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
});
