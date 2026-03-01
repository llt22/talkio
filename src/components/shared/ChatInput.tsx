import { memo, useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  ArrowUp,
  Image,
  ArrowLeftRight,
  Square,
  Mic,
  MessagesSquare,
  AtSign,
  Loader2,
  FileText,
  Paperclip,
} from "lucide-react";
import type { ConversationParticipant, Model } from "../../types";
import { extractMentionedParticipantIds } from "../../lib/mention-parser";
import { useProviderStore } from "../../stores/provider-store";
import { getParticipantLabel } from "../../stores/chat-message-builder";
import { useSettingsStore } from "../../stores/settings-store";
import { getAvatarProps } from "../../lib/avatar-utils";
import { appFetch } from "../../lib/http";
import { appAlert } from "../../components/shared/ConfirmDialogProvider";
import {
  parseFile,
  buildFileContext,
  formatFileSize,
  type ParsedFile,
} from "../../lib/file-parser";

// ── ChatInput — 1:1 port of RN src/components/chat/ChatInput.tsx ──

interface ChatInputProps {
  onSend: (text: string, mentionedParticipantIds?: string[], images?: string[]) => void;
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
  externalFiles?: { images: string[]; files: ParsedFile[] } | null;
  onExternalFilesConsumed?: () => void;
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
  externalFiles,
  onExternalFilesConsumed,
}: ChatInputProps) {
  const { t } = useTranslation();
  const getModelById = useProviderStore((s) => s.getModelById);
  const basePlaceholder = placeholder ?? t("chat.message");
  const resolvedPlaceholder = isMobile
    ? basePlaceholder
    : `${basePlaceholder}  (Enter · Shift+Enter ${t("chat.newLine")})`;
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<ParsedFile[]>([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showRoundPicker, setShowRoundPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const handleMicPressRef = useRef<(() => void) | null>(null);
  const isAutoDiscussing = autoDiscussRemaining > 0;

  const participantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      const label = getParticipantLabel(p, participants);
      map.set(p.id, label);
    }
    return map;
  }, [participants]);

  const participantEntries = useMemo(() => {
    return participants
      .map((p) => ({
        participant: p,
        model: getModelById(p.modelId),
        label: getParticipantLabel(p, participants),
      }))
      .filter((e) => e.model != null);
  }, [participants, getModelById]);

  const insertMention = useCallback(
    (participantId: string) => {
      const label = participantNames.get(participantId);
      if (!label) return;
      const mentionText = "@" + label.replace(/\s+/g, "") + " ";
      setText((prev) => {
        if (prev.endsWith("@")) return prev.slice(0, -1) + mentionText;
        return prev + mentionText;
      });
      setShowMentionPicker(false);
      textareaRef.current?.focus();
    },
    [participantNames],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    const hasImages = attachedImages.length > 0;
    const hasFiles = attachedFiles.length > 0;
    if ((!trimmed && !hasImages && !hasFiles) || isGenerating) return;
    let mentionedIds: string[] | undefined;
    if (isGroup) {
      const ids = extractMentionedParticipantIds(trimmed, participantNames);
      if (ids.length > 0) mentionedIds = ids;
    }
    // Prepend document text to the message
    const fileContext = buildFileContext(attachedFiles);
    const finalText = fileContext ? fileContext + trimmed : trimmed;
    // Collect image data URIs from both attachedImages and attachedFiles
    const fileImages = attachedFiles.filter((f) => f.type === "image").map((f) => f.content);
    const allImages = [...attachedImages, ...fileImages];
    onSend(finalText, mentionedIds, allImages.length > 0 ? allImages : undefined);
    setText("");
    setAttachedImages([]);
    setAttachedFiles([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      if (!isMobile) textareaRef.current.focus();
    }
  }, [text, attachedImages, attachedFiles, isGenerating, onSend, isGroup, participantNames]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isMobile) return;
      if (showMentionPicker && isGroup && participantEntries.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % participantEntries.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => (i - 1 + participantEntries.length) % participantEntries.length);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          insertMention(participantEntries[mentionIndex].participant.id);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowMentionPicker(false);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      isMobile,
      handleSend,
      showMentionPicker,
      isGroup,
      participantEntries,
      mentionIndex,
      insertMention,
    ],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, []);

  // Recording timer + 60s auto-stop
  useEffect(() => {
    if (!isRecording) {
      setRecordingDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setRecordingDuration((d) => {
        if (d >= 59) {
          handleMicPressRef.current?.();
          return 0;
        }
        return d + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleMicPress = useCallback(async () => {
    if (isTranscribing) return;

    if (isRecording) {
      // Stop recording
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      setIsRecording(false);
    } else {
      // Check STT configuration before starting recording
      const { sttApiKey } = useSettingsStore.getState().settings;
      if (!sttApiKey) {
        appAlert(t("chat.noSttProvider"));
        return;
      }
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "audio/mp4";
        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Stop all tracks to release mic
          stream.getTracks().forEach((t) => t.stop());

          const chunks = audioChunksRef.current;
          if (chunks.length === 0) return;

          const audioBlob = new Blob(chunks, { type: mimeType });
          audioChunksRef.current = [];

          // Transcribe
          setIsTranscribing(true);
          try {
            const { sttBaseUrl, sttApiKey, sttModel } = useSettingsStore.getState().settings;

            const ext = mimeType.includes("webm") ? "webm" : "mp4";
            const formData = new FormData();
            formData.append("file", audioBlob, `recording.${ext}`);
            formData.append("model", sttModel || "whisper-large-v3-turbo");

            const baseUrl = sttBaseUrl.replace(/\/+$/, "");
            const res = await appFetch(`${baseUrl}/audio/transcriptions`, {
              method: "POST",
              headers: { Authorization: `Bearer ${sttApiKey}` },
              body: formData,
              signal: AbortSignal.timeout(30000),
            });

            if (!res.ok) {
              const errText = await res.text();
              throw new Error(`Transcription failed: ${res.status} - ${errText}`);
            }

            const data = await res.json();
            const transcribedText = data.text ?? "";
            if (transcribedText) {
              setText((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
              textareaRef.current?.focus();
            }
          } catch (err) {
            appAlert(err instanceof Error ? err.message : "Transcription failed");
          } finally {
            setIsTranscribing(false);
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
      } catch {
        appAlert(t("chat.micPermissionDenied"));
      }
    }
  }, [isRecording, isTranscribing, t]);

  handleMicPressRef.current = handleMicPress;

  const handleAttach = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = isMobile
      ? "image/*"
      : "image/*,.pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.json,.xml,.html,.js,.ts,.jsx,.tsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.cs,.swift,.sh,.yaml,.yml,.toml,.sql,.css,.scss,.svg,.log";
    input.multiple = true;
    input.onchange = async () => {
      const files = input.files;
      if (!files) return;
      for (let i = 0; i < Math.min(files.length, 4); i++) {
        try {
          const parsed = await parseFile(files[i]);
          if (parsed.type === "image") {
            setAttachedImages((prev) => [...prev, parsed.content].slice(0, 4));
          } else {
            setAttachedFiles((prev) => [...prev, parsed].slice(0, 4));
          }
        } catch (err) {
          appAlert(err instanceof Error ? err.message : `Failed to parse: ${files[i].name}`);
        }
      }
    };
    input.click();
  }, [isMobile]);

  // Merge external files from drag-drop in ChatView
  useEffect(() => {
    if (!externalFiles) return;
    if (externalFiles.images.length > 0) {
      setAttachedImages((prev) => [...prev, ...externalFiles.images].slice(0, 4));
    }
    if (externalFiles.files.length > 0) {
      setAttachedFiles((prev) => [...prev, ...externalFiles.files].slice(0, 4));
    }
    onExternalFilesConsumed?.();
  }, [externalFiles, onExternalFilesConsumed]);

  return (
    <div
      className="flex-shrink-0"
      style={{ backgroundColor: "var(--background)", borderTop: "0.5px solid var(--border)" }}
    >
      {/* Auto-discuss round picker */}
      {showRoundPicker && !isAutoDiscussing && (
        <div className="px-4 py-3">
          <p className="text-muted-foreground mb-3 text-[13px]">{t("chat.autoDiscussHint")}</p>
          <div className="flex gap-2.5">
            {[3, 5, 10].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setShowRoundPicker(false);
                  if (!hasMessages) {
                    const trimmed = text.trim();
                    if (!trimmed) {
                      textareaRef.current?.focus();
                      return;
                    }
                    setText("");
                    onStartAutoDiscuss?.(n, trimmed);
                  } else {
                    onStartAutoDiscuss?.(n);
                  }
                }}
                className="flex flex-1 flex-col items-center rounded-2xl border py-3 active:opacity-70"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--secondary)" }}
              >
                <span className="text-[18px] font-bold" style={{ color: "var(--primary)" }}>
                  {n}
                </span>
                <span className="text-muted-foreground mt-0.5 text-[11px]">
                  {t("chat.autoDiscussRounds", { count: n })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* @Mention picker */}
      {showMentionPicker && isGroup && (
        <div
          className="px-4 py-3"
          style={{ borderBottom: "0.5px solid var(--border)", backgroundColor: "var(--muted)" }}
        >
          <p className="text-muted-foreground mb-2 text-[11px] font-bold tracking-widest uppercase">
            {t("chat.selectModel")}
          </p>
          {participantEntries.map((entry, idx) => {
            const { color: avatarColor, initials } = getAvatarProps(entry.label);
            return (
              <button
                key={entry.participant.id}
                onClick={() => insertMention(entry.participant.id)}
                className={`-mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:opacity-60 ${idx === mentionIndex ? "bg-primary/10" : ""}`}
              >
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials}
                </div>
                <span className="text-foreground text-[15px] font-medium">{entry.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Auto-discuss control panel */}
      {isAutoDiscussing ? (
        <div
          className="px-4 pt-3"
          style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom, 8px))" }}
        >
          <div className="mb-2.5 flex items-center gap-2">
            <MessagesSquare
              size={16}
              color="var(--primary)"
              className="flex-shrink-0 animate-pulse"
            />
            <span className="text-[13px] font-semibold" style={{ color: "var(--primary)" }}>
              {t("chat.autoDiscussRunning")}
            </span>
            <span className="text-muted-foreground text-[13px]">
              {t("chat.autoDiscussProgress", {
                current: autoDiscussTotalRounds - autoDiscussRemaining + 1,
                total: autoDiscussTotalRounds,
              })}
            </span>
          </div>
          <div
            className="mb-3 h-1 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                backgroundColor: "var(--primary)",
                width:
                  ((autoDiscussTotalRounds - autoDiscussRemaining + 1) / autoDiscussTotalRounds) *
                    100 +
                  "%",
              }}
            />
          </div>
          <button
            onClick={onStopAutoDiscuss}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 active:opacity-70"
            style={{ backgroundColor: "var(--secondary)", border: "0.5px solid var(--border)" }}
          >
            <Square size={12} color="var(--destructive)" />
            <span className="text-[14px] font-medium" style={{ color: "var(--destructive)" }}>
              {t("chat.autoDiscussStop")}
            </span>
          </button>
        </div>
      ) : (
        <>
          {/* Attached images preview */}
          {attachedImages.length > 0 && (
            <div
              className="flex gap-2 overflow-x-auto px-4 pt-2"
              style={{ scrollbarWidth: "none" as any }}
            >
              {attachedImages.map((uri: string, idx: number) => (
                <div key={idx} className="relative mr-2 flex-shrink-0">
                  <img src={uri} className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full active:opacity-60"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                  >
                    <X size={12} color="white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Attached document files preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pt-2">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                  style={{ backgroundColor: "var(--muted)", border: "0.5px solid var(--border)" }}
                >
                  <FileText size={14} color="var(--primary)" className="flex-shrink-0" />
                  <span className="text-foreground max-w-[120px] truncate text-[12px] font-medium">
                    {file.name}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                    className="ml-0.5 rounded-full p-0.5 active:opacity-60"
                  >
                    <X size={12} color="var(--muted-foreground)" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="px-4 pt-2.5 pb-1.5">
            {isRecording ? (
              <div
                className="flex min-h-[44px] items-center justify-center rounded-2xl px-4 py-2.5"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--destructive) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--destructive) 20%, transparent)",
                }}
              >
                <div
                  className="mr-2 h-2 w-2 animate-pulse rounded-full"
                  style={{ backgroundColor: "var(--destructive)" }}
                />
                <span className="text-base font-semibold" style={{ color: "var(--destructive)" }}>
                  {`${Math.floor(recordingDuration / 60)
                    .toString()
                    .padStart(2, "0")}:${(recordingDuration % 60).toString().padStart(2, "0")}`}
                </span>
                <span
                  className="ml-2 text-xs"
                  style={{ color: "color-mix(in srgb, var(--destructive) 60%, transparent)" }}
                >
                  /01:00
                </span>
              </div>
            ) : (
              <div
                className="flex items-center rounded-2xl px-3"
                style={{
                  backgroundColor: "var(--muted)",
                  border: "0.5px solid color-mix(in srgb, var(--border) 50%, transparent)",
                }}
              >
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => {
                    const val = e.target.value;
                    setText(val);
                    handleInput();
                    if (isGroup && val.endsWith("@") && !showMentionPicker) {
                      setShowMentionPicker(true);
                      setMentionIndex(0);
                      setShowRoundPicker(false);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of items) {
                      if (item.type.startsWith("image/")) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        if (!blob) continue;
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            setAttachedImages((prev) =>
                              [...prev, reader.result as string].slice(0, 4),
                            );
                          }
                        };
                        reader.readAsDataURL(blob);
                        break;
                      }
                    }
                  }}
                  placeholder={resolvedPlaceholder}
                  disabled={isGenerating}
                  rows={1}
                  className={`text-foreground placeholder:text-muted-foreground/50 flex-1 resize-none bg-transparent outline-none ${isMobile ? "max-h-24 min-h-[44px] py-2.5 text-[16px]" : "max-h-32 min-h-[36px] py-2 text-[14px]"}`}
                />
                {isGenerating ? (
                  <button
                    onClick={onStop}
                    className="my-1.5 ml-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full active:opacity-70"
                    style={{ backgroundColor: "var(--destructive)" }}
                  >
                    <Square size={14} color="white" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={
                      !text.trim() && attachedImages.length === 0 && attachedFiles.length === 0
                    }
                    className="my-1.5 ml-1.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-70"
                    style={{
                      backgroundColor: "var(--primary)",
                      opacity:
                        text.trim() || attachedImages.length > 0 || attachedFiles.length > 0
                          ? 1
                          : 0.3,
                    }}
                  >
                    <ArrowUp size={18} color="white" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Action bar */}
          <div
            className="flex items-center gap-0.5 pl-3 pr-7"
            style={{
              paddingBottom: isMobile ? "max(4px, env(safe-area-inset-bottom, 4px))" : "4px",
            }}
          >
            <button
              onClick={handleAttach}
              className={`flex items-center justify-center rounded-full active:opacity-60 ${isMobile ? "h-10 w-10" : "h-8 w-8"}`}
              disabled={isGenerating}
            >
              {isMobile ? (
                <Image
                  size={20}
                  color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"}
                />
              ) : (
                <Paperclip
                  size={20}
                  color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"}
                />
              )}
            </button>

            {isGroup && (
              <button
                onClick={() => {
                  setShowMentionPicker((v) => !v);
                  setShowRoundPicker(false);
                }}
                className={`flex items-center justify-center rounded-full active:opacity-60 ${isMobile ? "h-10 w-10" : "h-8 w-8"}`}
                disabled={isGenerating}
              >
                <AtSign
                  size={isMobile ? 20 : 18}
                  color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"}
                />
              </button>
            )}

            {modelName && onSwitchModel && (
              <button
                onClick={onSwitchModel}
                className="ml-0.5 flex min-w-0 items-center gap-1.5 rounded-full px-3 py-2 active:opacity-60"
                disabled={isGenerating}
              >
                <ArrowLeftRight
                  size={16}
                  className="flex-shrink-0"
                  color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"}
                />
                <span
                  className="truncate text-[13px] font-medium"
                  style={{
                    color: isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)",
                  }}
                >
                  {modelName}
                </span>
              </button>
            )}

            {isGroup && (
              <button
                onClick={() => {
                  setShowRoundPicker((v) => !v);
                  setShowMentionPicker(false);
                }}
                className="ml-0.5 flex items-center gap-1.5 rounded-full px-3 py-2 active:opacity-60"
              >
                <MessagesSquare
                  size={20}
                  color={isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)"}
                />
                <span
                  className="text-[13px] font-medium"
                  style={{
                    color: isGenerating ? "var(--muted-foreground)" : "var(--secondary-foreground)",
                  }}
                >
                  {t("chat.autoDiscuss")}
                </span>
              </button>
            )}

            <div className="flex-1" />

            {isTranscribing ? (
              <div
                className={`flex items-center justify-center ${isMobile ? "h-10 w-10" : "h-8 w-8"}`}
              >
                <Loader2 size={20} color="var(--primary)" className="animate-spin" />
              </div>
            ) : (
              <button
                onClick={handleMicPress}
                className={`flex items-center justify-center rounded-full active:opacity-70 ${isMobile ? "h-10 w-10" : "h-8 w-8"}`}
                style={isRecording ? { backgroundColor: "var(--destructive)" } : undefined}
              >
                {isRecording ? (
                  <Square size={14} color="white" />
                ) : (
                  <Mic size={22} color="var(--secondary-foreground)" />
                )}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
});
