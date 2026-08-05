/**
 * ToolApprovalDialog — global approval UI for tool execution.
 * Mounted once at the app root; subscribes to the toolApproval service and
 * shows a dialog whenever a tool call awaits user approval.
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { toolApproval, type PendingApproval } from "../../services/tool-approval";

export function ToolApprovalDialog() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingApproval[]>([]);

  useEffect(() => {
    const update = () => setPending(toolApproval.getPending());
    update();
    return toolApproval.subscribe(update);
  }, []);

  const current = pending[0];

  const decide = useCallback((approved: boolean) => {
    if (!toolApproval.getPending()[0]) return;
    const first = toolApproval.getPending()[0];
    toolApproval.resolve(first.id, approved);
  }, []);

  return (
    <Dialog
      open={!!current}
      onOpenChange={(open) => {
        if (!open && current) decide(false);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("toolApproval.title", { defaultValue: "Tool approval required" })}
          </DialogTitle>
          <DialogDescription>
            {t("toolApproval.description", {
              defaultValue: "The AI wants to run a tool. Review the request and decide.",
            })}
          </DialogDescription>
        </DialogHeader>
        {current && (
          <div className="space-y-2">
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-sm font-medium break-all">{current.toolName}</p>
              <pre className="text-muted-foreground mt-1 max-h-40 overflow-auto text-xs break-all whitespace-pre-wrap">
                {JSON.stringify(current.args, null, 2)}
              </pre>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => decide(false)}>
            {t("toolApproval.reject", { defaultValue: "Reject" })}
          </Button>
          <Button onClick={() => decide(true)}>
            {t("toolApproval.approve", { defaultValue: "Approve" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
