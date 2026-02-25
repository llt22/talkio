import { useCallback, useMemo, useState } from "react";
import { useConversations, useMessages } from "./useDatabase";
import { useProviderStore } from "../stores/provider-store";
import { useIdentityStore } from "../stores/identity-store";
import { useChatStore, type ChatState } from "../stores/chat-store";
import type { Conversation, ConversationParticipant, Identity, Message, Model } from "../../../src/types";

export type ModelPickerMode = "add" | "switch";

export function useChatPanelState(conversationId: string): {
  conversations: Conversation[];
  messages: Message[];
  conv: Conversation | undefined;

  identities: Identity[];
  getModelById: (id: string) => Model | undefined;
  getIdentityById: (id: string) => Identity | undefined;

  clearConversationMessages: ChatState["clearConversationMessages"];
  updateParticipantIdentity: ChatState["updateParticipantIdentity"];
  updateParticipantModel: ChatState["updateParticipantModel"];
  addParticipant: ChatState["addParticipant"];
  removeParticipant: ChatState["removeParticipant"];

  isGroup: boolean;
  currentParticipant: ConversationParticipant | null;
  model: Model | null;
  activeIdentity: Identity | null;

  showIdentityPanel: boolean;
  setShowIdentityPanel: React.Dispatch<React.SetStateAction<boolean>>;
  showParticipants: boolean;
  setShowParticipants: React.Dispatch<React.SetStateAction<boolean>>;
  showModelPicker: boolean;
  setShowModelPicker: React.Dispatch<React.SetStateAction<boolean>>;
  modelPickerMode: ModelPickerMode;
  setModelPickerMode: React.Dispatch<React.SetStateAction<ModelPickerMode>>;
  isExporting: boolean;
  setIsExporting: React.Dispatch<React.SetStateAction<boolean>>;

  handleModelPickerSelect: (modelId: string) => void;
} {
  const conversations = useConversations();
  const messages = useMessages(conversationId);

  const conv = useMemo(
    () => conversations.find((c: Conversation) => c.id === conversationId),
    [conversations, conversationId],
  );

  const getModelById = useProviderStore((s) => s.getModelById);
  const getIdentityById = useIdentityStore((s) => s.getIdentityById);
  const identities = useIdentityStore((s) => s.identities);

  const clearConversationMessages = useChatStore((s: ChatState) => s.clearConversationMessages);
  const updateParticipantIdentity = useChatStore((s: ChatState) => s.updateParticipantIdentity);
  const updateParticipantModel = useChatStore((s: ChatState) => s.updateParticipantModel);
  const addParticipant = useChatStore((s: ChatState) => s.addParticipant);
  const removeParticipant = useChatStore((s: ChatState) => s.removeParticipant);

  const [showIdentityPanel, setShowIdentityPanel] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelPickerMode, setModelPickerMode] = useState<ModelPickerMode>("switch");
  const [isExporting, setIsExporting] = useState(false);

  const isGroup = conv?.type === "group";
  const currentParticipant = conv?.participants[0] ?? null;
  const model = currentParticipant ? getModelById(currentParticipant.modelId) : null;
  const activeIdentity = currentParticipant?.identityId ? getIdentityById(currentParticipant.identityId) : null;

  const handleModelPickerSelect = useCallback((modelId: string) => {
    setShowModelPicker(false);
    if (modelPickerMode === "switch" && currentParticipant) {
      updateParticipantModel(conversationId, currentParticipant.id, modelId);
    } else {
      addParticipant(conversationId, modelId);
    }
  }, [addParticipant, conversationId, currentParticipant, modelPickerMode, updateParticipantModel]);

  return {
    conversations,
    messages,
    conv,

    identities,
    getModelById,
    getIdentityById,

    clearConversationMessages,
    updateParticipantIdentity,
    updateParticipantModel,
    addParticipant,
    removeParticipant,

    isGroup: !!isGroup,
    currentParticipant,
    model,
    activeIdentity,

    showIdentityPanel,
    setShowIdentityPanel,
    showParticipants,
    setShowParticipants,
    showModelPicker,
    setShowModelPicker,
    modelPickerMode,
    setModelPickerMode,
    isExporting,
    setIsExporting,

    handleModelPickerSelect,
  };
}
