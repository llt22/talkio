import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type ConfirmApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmDialogContext = createContext<ConfirmApi | null>(null);

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx;
}

// ── Global appAlert ──
let _globalAlert: ((msg: string) => Promise<void>) | null = null;

export function appAlert(msg: string): Promise<void> {
  if (_globalAlert) return _globalAlert(msg);
  window.alert(msg);
  return Promise.resolve();
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string | undefined>(undefined);
  const [confirmText, setConfirmText] = useState<string>("");
  const [cancelText, setCancelText] = useState<string>("");
  const [destructive, setDestructive] = useState<boolean>(false);
  const [alertMode, setAlertMode] = useState(false);

  const close = useCallback((result: boolean) => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  const confirm = useCallback(
    async (options: ConfirmOptions) => {
      if (resolverRef.current) {
        const prev = resolverRef.current;
        resolverRef.current = null;
        prev(false);
      }

      setAlertMode(false);
      setTitle(options.title);
      setDescription(options.description);
      setConfirmText(options.confirmText ?? t("common.confirm"));
      setCancelText(options.cancelText ?? t("common.cancel"));
      setDestructive(!!options.destructive);
      setOpen(true);

      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [t],
  );

  const alert = useCallback(
    async (msg: string) => {
      if (resolverRef.current) {
        const prev = resolverRef.current;
        resolverRef.current = null;
        prev(false);
      }

      setAlertMode(true);
      setTitle(msg);
      setDescription(undefined);
      setConfirmText(t("common.confirm"));
      setOpen(true);

      return new Promise<void>((resolve) => {
        resolverRef.current = () => resolve();
      });
    },
    [t],
  );

  useEffect(() => {
    _globalAlert = alert;
    return () => {
      _globalAlert = null;
    };
  }, [alert]);

  const api = useMemo<ConfirmApi>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={api}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) close(false);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter>
            {!alertMode && (
              <Button variant="outline" onClick={() => close(false)}>
                {cancelText}
              </Button>
            )}
            <Button
              variant={destructive && !alertMode ? "destructive" : "default"}
              onClick={() => close(true)}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  );
}
