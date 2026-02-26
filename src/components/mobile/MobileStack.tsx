import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { stackflow, type ActivityComponentType } from "@stackflow/react";
import { basicRendererPlugin } from "@stackflow/plugin-renderer-basic";
import { basicUIPlugin } from "@stackflow/plugin-basic-ui";
import { AppScreen } from "@stackflow/plugin-basic-ui";
import "@stackflow/plugin-basic-ui/index.css";
import { IoAdd, IoTrashOutline, IoChevronForward, IoAddCircleOutline } from "../../icons";
import { useChatStore } from "../../stores/chat-store";
import { useProviderStore } from "../../stores/provider-store";
import { useMcpStore, type McpServerConfig } from "../../stores/mcp-store";
import { useConfirm } from "../shared/ConfirmDialogProvider";
import { getAvatarProps } from "../../lib/avatar-utils";
import { EmptyState } from "../shared/EmptyState";
import { ProviderEditPage } from "../../pages/settings/ProviderEditPage";
import { SttSettingsPage } from "../../pages/settings/SttSettingsPage";
import { McpPage, McpServerForm } from "../../pages/settings/McpPage";
import { IdentityEditPage } from "../../pages/settings/IdentityPage";
import { MobileTabLayout, MobileChatDetail } from "./MobileLayout";
import { MobileNavContext, type MobileNavFunctions } from "../../contexts/MobileNavContext";

// ── Forward declaration for useFlow ──
let _useFlow: ReturnType<typeof stackflow>["useFlow"];

// ══════════════════════════════════════════
// Activity: Home (Tab Layout)
// ══════════════════════════════════════════
const Home: ActivityComponentType = () => {
  const { push } = _useFlow();

  const nav: MobileNavFunctions = useMemo(() => ({
    pushChat: (conversationId: string) => push("ChatDetail", { conversationId }),
    pushIdentityNew: () => push("IdentityNew", {}),
    pushIdentityEdit: (id: string) => push("IdentityEdit", { identityId: id }),
    pushSettingsProviders: () => push("ProvidersList", {}),
    pushSettingsProviderEdit: (editId?: string) => push("ProviderEdit", { editId: editId ?? "" }),
    pushSettingsMcpTools: () => push("McpTools", {}),
    pushSettingsMcpServerEdit: (serverId?: string) => push("McpServerEdit", { serverId: serverId ?? "" }),
    pushSettingsStt: () => push("SttSettings", {}),
  }), [push]);

  return (
    <AppScreen>
      <MobileNavContext.Provider value={nav}>
        <MobileTabLayout />
      </MobileNavContext.Provider>
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: Chat Detail
// ══════════════════════════════════════════
const ChatDetail: ActivityComponentType<{ conversationId: string }> = ({ params }) => {
  const { pop } = _useFlow();
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);

  useEffect(() => {
    if (params.conversationId) setCurrentConversation(params.conversationId);
    return () => setCurrentConversation(null);
  }, [params.conversationId, setCurrentConversation]);

  return (
    <AppScreen>
      <MobileChatDetail conversationId={params.conversationId} onBack={() => pop()} />
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: Identity New
// ══════════════════════════════════════════
const IdentityNew: ActivityComponentType = () => {
  const { t } = useTranslation();
  const { pop } = _useFlow();

  return (
    <AppScreen appBar={{ title: t("identityEdit.newTitle", { defaultValue: "New Identity" }) }}>
      <IdentityEditPage onClose={() => pop()} />
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: Identity Edit
// ══════════════════════════════════════════
const IdentityEdit: ActivityComponentType<{ identityId: string }> = ({ params }) => {
  const { t } = useTranslation();
  const { pop } = _useFlow();

  return (
    <AppScreen appBar={{ title: t("identityEdit.editTitle", { defaultValue: "Edit Identity" }) }}>
      <IdentityEditPage id={params.identityId} onClose={() => pop()} />
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: Providers List
// ══════════════════════════════════════════
const ProvidersList: ActivityComponentType = () => {
  const { t } = useTranslation();
  const { push, pop } = _useFlow();
  const providers = useProviderStore((s) => s.providers);
  const models = useProviderStore((s) => s.models);

  return (
    <AppScreen
      appBar={{
        title: t("settings.providers"),
        renderRight: () => (
          <button onClick={() => push("ProviderEdit", {})} className="p-2 active:opacity-60">
            <IoAdd size={22} color="var(--primary)" />
          </button>
        ),
      }}
    >
      <div className="h-full overflow-y-auto" style={{ backgroundColor: "var(--background)" }}>
        <div className="pb-8">
          {providers.length === 0 ? (
            <EmptyState
              icon={<IoAddCircleOutline size={28} color="var(--muted-foreground)" />}
              title={t("models.noModels")}
              subtitle={t("models.configureHint")}
            />
          ) : (
            <div style={{ borderTop: "0.5px solid var(--border)", borderBottom: "0.5px solid var(--border)" }}>
              {providers.map((provider: { id: string; name: string; status: string; baseUrl: string; type: string; enabled?: boolean }, idx: number) => {
                const providerModels = models.filter((m: { providerId: string; enabled: boolean }) => m.providerId === provider.id);
                const activeModels = providerModels.filter((m: { enabled: boolean }) => m.enabled);
                const isConnected = provider.status === "active" || provider.status === "connected";
                const isError = provider.status === "error";
                const isDisabled = provider.enabled === false;
                return (
                  <button
                    key={provider.id}
                    onClick={() => push("ProviderEdit", { editId: provider.id })}
                    className={`w-full flex items-center gap-4 px-4 py-3 text-left active:bg-black/5 transition-colors ${isDisabled ? "opacity-50" : ""}`}
                    style={{ borderBottom: idx < providers.length - 1 ? "0.5px solid var(--border)" : "none" }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                        style={{ backgroundColor: getAvatarProps(provider.name).color }}
                      >
                        {getAvatarProps(provider.name).initials}
                      </div>
                      <div
                        className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2"
                        style={{
                          borderColor: "var(--background)",
                          backgroundColor: isConnected ? "var(--success)" : isError ? "var(--destructive)" : "var(--border)",
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-medium text-foreground truncate">{provider.name}</p>
                      <p className="text-[13px] text-muted-foreground truncate">
                        {t("providers.modelsCount", { total: providerModels.length, active: activeModels.length })}
                      </p>
                    </div>
                    <IoChevronForward size={18} color="var(--muted-foreground)" style={{ opacity: 0.3 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: Provider Edit
// ══════════════════════════════════════════
const ProviderEdit: ActivityComponentType<{ editId?: string }> = ({ params }) => {
  const { t } = useTranslation();
  const { pop } = _useFlow();
  const { confirm } = useConfirm();
  const deleteProvider = useProviderStore((s) => s.deleteProvider);

  return (
    <AppScreen
      appBar={{
        title: params.editId ? t("settings.editProvider", { defaultValue: "Edit Provider" }) : t("settings.addProvider"),
        renderRight: params.editId ? () => (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: t("common.areYouSure"),
                description: t("providers.deleteConfirm", { name: "" }),
                destructive: true,
              });
              if (ok) {
                deleteProvider(params.editId!);
                pop();
              }
            }}
            className="p-2 active:opacity-60"
          >
            <IoTrashOutline size={18} color="var(--destructive)" />
          </button>
        ) : undefined,
      }}
    >
      <div className="h-full overflow-y-auto">
        <ProviderEditPage editId={params.editId} onClose={() => pop()} />
      </div>
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: MCP Tools
// ══════════════════════════════════════════
const McpTools: ActivityComponentType = () => {
  const { t } = useTranslation();
  const { push, pop } = _useFlow();

  const onPush = (page: { id: string }) => {
    const match = page.id.match(/^mcp-edit-(.+)$/);
    if (match) {
      push("McpServerEdit", { serverId: match[1] });
    } else {
      push("McpServerEdit", {});
    }
  };

  return (
    <AppScreen appBar={{ title: t("settings.mcpTools") }}>
      <McpPage onPush={onPush as any} onPop={() => pop()} />
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: MCP Server Edit
// ══════════════════════════════════════════
const McpServerEdit: ActivityComponentType<{ serverId?: string }> = ({ params }) => {
  const { t } = useTranslation();
  const { pop } = _useFlow();
  const servers = useMcpStore((s) => s.servers) as McpServerConfig[];

  const server = params.serverId ? servers.find((s) => s.id === params.serverId) : undefined;

  return (
    <AppScreen appBar={{ title: server ? server.name : t("personas.addTool") }}>
      <McpServerForm server={server} onClose={() => pop()} />
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Activity: STT Settings
// ══════════════════════════════════════════
const SttSettings: ActivityComponentType = () => {
  const { t } = useTranslation();

  return (
    <AppScreen appBar={{ title: t("settings.sttProvider") }}>
      <SttSettingsPage />
    </AppScreen>
  );
};

// ══════════════════════════════════════════
// Stackflow Configuration
// ══════════════════════════════════════════
const result = stackflow({
  transitionDuration: 250,
  activities: {
    Home,
    ChatDetail,
    IdentityNew,
    IdentityEdit,
    ProvidersList,
    ProviderEdit,
    McpTools,
    McpServerEdit,
    SttSettings,
  },
  plugins: [
    basicRendererPlugin(),
    basicUIPlugin({
      theme: "cupertino",
    }),
  ],
  initialActivity: () => "Home",
});

_useFlow = result.useFlow;
const MobileStackComponent = result.Stack;

// ══════════════════════════════════════════
// Exported Component
// ══════════════════════════════════════════
export function MobileStack() {
  return <MobileStackComponent />;
}
