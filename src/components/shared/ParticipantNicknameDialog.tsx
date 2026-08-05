import { useEffect, useState } from "react";
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

interface ParticipantNicknameDialogProps {
  open: boolean;
  participantName: string;
  initialNickname: string;
  onOpenChange: (open: boolean) => void;
  onSave: (nickname: string) => Promise<void>;
}

export function ParticipantNicknameDialog({
  open,
  participantName,
  initialNickname,
  onOpenChange,
  onSave,
}: ParticipantNicknameDialogProps) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initialNickname);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNickname(initialNickname);
    setError("");
  }, [open, initialNickname]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(nickname);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "Participant nickname already exists"
          ? t("chat.nicknameDuplicate")
          : err instanceof Error
            ? err.message
            : t("common.error"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("chat.editNickname")}</DialogTitle>
          <DialogDescription>{participantName}</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={nickname}
          maxLength={40}
          placeholder={t("chat.nicknamePlaceholder")}
          onChange={(event) => setNickname(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !saving) void handleSave();
          }}
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-primary h-10 w-full rounded-md border px-3 text-sm outline-none"
        />
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
