import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export type BackupSecretsChoice = boolean | null;

export function useBackupSecretsChoice() {
  const { t } = useTranslation();
  const resolverRef = useRef<((value: BackupSecretsChoice) => void) | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback((value: BackupSecretsChoice) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(value);
  }, []);

  const prompt = useCallback(async () => {
    if (resolverRef.current) {
      const previous = resolverRef.current;
      resolverRef.current = null;
      previous(null);
    }

    setOpen(true);
    return new Promise<BackupSecretsChoice>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(
    () => () => {
      if (resolverRef.current) {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        resolve(null);
      }
    },
    [],
  );

  return {
    prompt,
    dialog: (
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("settings.exportBackup")}</DialogTitle>
            <DialogDescription>{t("settings.exportSecretsPrompt")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => close(null)}>
              {t("common.cancel")}
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => close(false)}>
              {t("settings.exportWithoutSecrets")}
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => close(true)}
            >
              {t("settings.exportWithSecrets")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    ),
  };
}
