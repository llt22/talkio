import { createContext, useContext } from "react";

export interface MobileNavFunctions {
  pushChat: (conversationId: string) => void;
  pushAddMember: (conversationId?: string) => void;
  pushIdentityNew: () => void;
  pushIdentityEdit: (id: string) => void;
  pushSettingsProviders: () => void;
  pushSettingsProviderEdit: (editId?: string) => void;
  pushSettingsMcpTools: () => void;
  pushSettingsMcpServerEdit: (serverId?: string) => void;
  pushSettingsStt: () => void;
}

export const MobileNavContext = createContext<MobileNavFunctions | null>(null);

export function useMobileNav() {
  return useContext(MobileNavContext);
}
