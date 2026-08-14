import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { ConversationParticipant, Message } from "../../types";
import { getParticipantLabel, getParticipantLabelParts } from "../../stores/chat-message-builder";
import { useProviderStore } from "../../stores/provider-store";
import { getAvatarProps } from "../../lib/avatar-utils";

interface TaskPromoteDialogProps {
  open: boolean;
  sourceMessage: Message | null;
  participants: ConversationParticipant[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (title: string, description: string, assigneeParticipantId: string) => Promise<void>;
}

/**
 * Promote an AI message to a discussion task: title + description default
 * from the source message (both editable), plus an assignee.
 */
export function TaskPromoteDialog({
  open,
  sourceMessage,
  participants,
  onOpenChange,
  onConfirm,
}: TaskPromoteDialogProps) {
  const { t } = useTranslation();
  const getModelById = useProviderStore((s) => s.getModelById);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Defaults from the source message: title = first 40 chars, description = full content.
  const defaults = useMemo(() => {
    const text = (sourceMessage?.content ?? "").replace(/\s+/g, " ").trim();
    return {
      title: text ? text.slice(0, 40) : "",
      description: sourceMessage?.content ?? "",
    };
  }, [sourceMessage]);

  useEffect(() => {
    if (!open) return;
    setTitle(defaults.title);
    setDescription(defaults.description);
    setAssigneeId(participants[0]?.id ?? null);
  }, [open, defaults, participants]);

  const handleConfirm = async () => {
    const trimmed = title.trim();
    if (!trimmed || !assigneeId || saving) return;
    setSaving(true);
    try {
      await onConfirm(trimmed, description.trim(), assigneeId);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("chat.promoteToTask")}</DialogTitle>
          <DialogDescription>{t("chat.taskAssignee")}</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={title}
          maxLength={80}
          placeholder={t("chat.taskTitlePlaceholder")}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) void handleConfirm();
          }}
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary h-10 w-full rounded-md border px-3 text-sm outline-none"
        />
        <textarea
          value={description}
          maxLength={2000}
          rows={3}
          placeholder={t("chat.taskDescriptionPlaceholder")}
          onChange={(event) => setDescription(event.target.value)}
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary w-full resize-none rounded-md border px-3 py-2 text-sm leading-relaxed outline-none"
        />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {participants.map((participant) => {
            const label = getParticipantLabel(participant, participants);
            const { color: avatarColor, initials } = getAvatarProps(label);
            const parts = getParticipantLabelParts(participant, participants);
            const model = getModelById(participant.modelId);
            if (!model) return null;
            const secondLine = [parts.identityName, parts.providerName].filter(Boolean).join(" · ");
            const selected = assigneeId === participant.id;
            return (
              <button
                key={participant.id}
                onClick={() => setAssigneeId(participant.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left active:opacity-60 ${selected ? "bg-primary/10" : ""}`}
              >
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                  style={{ backgroundColor: avatarColor }}
                >
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-foreground block truncate text-[14px] font-medium">
                    {parts.modelName}
                    {parts.suffix && <span className="text-muted-foreground"> {parts.suffix}</span>}
                  </span>
                  {secondLine && (
                    <span className="text-muted-foreground block truncate text-[12px]">
                      {secondLine}
                    </span>
                  )}
                </div>
                {selected && <span className="text-primary text-xs font-semibold">✓</span>}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !title.trim() || !assigneeId}>
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
