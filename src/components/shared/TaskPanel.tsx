import { useTranslation } from "react-i18next";
import { Pause, Play, RotateCcw, X, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { ConversationParticipant, Task } from "../../types";
import { getParticipantLabel } from "../../stores/chat-message-builder";

interface TaskPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  participants: ConversationParticipant[];
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onJumpToRequest: (requestMessageId: string) => void;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending: {
    bg: "color-mix(in srgb, var(--primary) 15%, transparent)",
    fg: "var(--primary)",
  },
  running: {
    bg: "color-mix(in srgb, var(--primary) 15%, transparent)",
    fg: "var(--primary)",
  },
  paused: { bg: "color-mix(in srgb, #f59e0b 15%, transparent)", fg: "#f59e0b" },
  done: { bg: "color-mix(in srgb, #22c55e 15%, transparent)", fg: "#22c55e" },
  failed: {
    bg: "color-mix(in srgb, var(--destructive) 15%, transparent)",
    fg: "var(--destructive)",
  },
};

/**
 * Task list panel — statuses, assignees, and lifecycle actions.
 */
export function TaskPanel({
  open,
  onOpenChange,
  tasks,
  participants,
  onPause,
  onResume,
  onRetry,
  onJumpToRequest,
}: TaskPanelProps) {
  const { t } = useTranslation();
  const sorted = [...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              📋 {t("chat.tasks")}
              <span className="text-muted-foreground text-xs font-normal">
                {tasks.length > 0 ? tasks.length : ""}
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">{t("chat.taskEmpty")}</p>
          )}
          {sorted.map((task) => {
            const assignee = task.assigneeParticipantId
              ? participants.find((p) => p.id === task.assigneeParticipantId)
              : undefined;
            const resultMessageId = task.resultMessageId;
            const colors = STATUS_COLORS[task.status] ?? STATUS_COLORS.pending;
            const statusLabel = t(`chat.taskStatus.${task.status}`, {
              defaultValue: task.status,
            });
            return (
              <div
                key={task.id}
                className="rounded-xl p-3"
                style={{ backgroundColor: "var(--muted)", border: "0.5px solid var(--border)" }}
              >
                <div className="flex items-start gap-2">
                  <button
                    className="text-foreground min-w-0 flex-1 text-left text-[13px] font-medium break-words hover:opacity-70"
                    onClick={() =>
                      task.requestMessageId && onJumpToRequest(task.requestMessageId)
                    }
                    title={t("chat.jumpToRequest", { defaultValue: "Locate in discussion" })}
                  >
                    {task.title}
                  </button>
                  <span
                    className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: colors.bg, color: colors.fg }}
                  >
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {assignee && (
                    <span className="text-muted-foreground truncate text-[11px]">
                      {getParticipantLabel(assignee, participants)}
                    </span>
                  )}
                  <div className="flex-1" />
                  {task.status === "running" && (
                    <button
                      onClick={() => onPause(task.id)}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium active:opacity-60"
                      style={{ backgroundColor: "var(--secondary)", color: "var(--muted-foreground)" }}
                    >
                      <Pause size={11} />
                      {t("chat.taskPause")}
                    </button>
                  )}
                  {task.status === "paused" && (
                    <button
                      onClick={() => onResume(task.id)}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium active:opacity-60"
                      style={{ backgroundColor: STATUS_COLORS.done.bg, color: STATUS_COLORS.done.fg }}
                    >
                      <Play size={11} />
                      {t("chat.taskResume")}
                    </button>
                  )}
                  {task.status === "failed" && (
                    <button
                      onClick={() => onRetry(task.id)}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium active:opacity-60"
                      style={{
                        backgroundColor: STATUS_COLORS.failed.bg,
                        color: STATUS_COLORS.failed.fg,
                      }}
                    >
                      <RotateCcw size={11} />
                      {t("chat.taskRetry")}
                    </button>
                  )}
                  {task.status === "done" && resultMessageId && (
                    <button
                      onClick={() => onJumpToRequest(resultMessageId)}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium active:opacity-60"
                      style={{ backgroundColor: STATUS_COLORS.done.bg, color: STATUS_COLORS.done.fg }}
                    >
                      <Check size={11} />
                      {t("chat.taskDoneBadge")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="text-muted-foreground hover:bg-muted/50 mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-medium active:opacity-60"
        >
          <X size={14} />
          {t("common.close", { defaultValue: "Close" })}
        </button>
      </DialogContent>
    </Dialog>
  );
}
