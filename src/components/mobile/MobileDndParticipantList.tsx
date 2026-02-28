import { useTranslation } from "react-i18next";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IoTrashOutline } from "../../icons";
import { useChatStore } from "../../stores/chat-store";
import type { ConversationParticipant } from "../../types";

function MobileSortableRow({
  participant: p,
  index: idx,
  getModelById,
  getIdentityById,
  onEditRole,
  onRemove,
  isSequential,
}: {
  participant: ConversationParticipant;
  index: number;
  getModelById: (id: string) => any;
  getIdentityById: (id: string) => any;
  onEditRole: () => void;
  onRemove: () => void;
  isSequential: boolean;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const pModel = getModelById(p.modelId);
  const pIdentity = p.identityId ? getIdentityById(p.identityId) : null;
  const displayName = pModel?.displayName ?? p.modelId;
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2.5 py-2">
      {isSequential && (
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing flex-shrink-0 p-0.5 touch-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="5" r="1.5" fill="var(--muted-foreground)"/><circle cx="16" cy="5" r="1.5" fill="var(--muted-foreground)"/><circle cx="8" cy="12" r="1.5" fill="var(--muted-foreground)"/><circle cx="16" cy="12" r="1.5" fill="var(--muted-foreground)"/><circle cx="8" cy="19" r="1.5" fill="var(--muted-foreground)"/><circle cx="16" cy="19" r="1.5" fill="var(--muted-foreground)"/></svg>
        </button>
      )}
      <span className="text-[11px] text-muted-foreground w-4 text-center flex-shrink-0">{idx + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{displayName}</p>
      </div>
      <button
        className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] active:opacity-60"
        style={{ backgroundColor: "color-mix(in srgb, var(--primary) 8%, transparent)", color: "var(--primary)" }}
        onClick={onEditRole}
      >
        {pIdentity ? pIdentity.name : t("chat.noIdentity")}
      </button>
      <button className="p-1 active:opacity-60 flex-shrink-0" onClick={onRemove}>
        <IoTrashOutline size={15} color="var(--destructive)" />
      </button>
    </div>
  );
}

export function MobileDndParticipantList({
  participants,
  conversationId,
  isSequential,
  getModelById,
  getIdentityById,
  onEditRole,
  onRemove,
}: {
  participants: ConversationParticipant[];
  conversationId: string;
  isSequential: boolean;
  getModelById: (id: string) => any;
  getIdentityById: (id: string) => any;
  onEditRole: (participantId: string) => void;
  onRemove: (participantId: string, displayName: string) => void;
}) {
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
          const ids = participants.map((pp) => pp.id);
          const oldIdx = ids.indexOf(active.id as string);
          const newIdx = ids.indexOf(over.id as string);
          useChatStore.getState().reorderParticipants(conversationId, arrayMove(ids, oldIdx, newIdx));
        }
      }}
    >
      <SortableContext items={participants.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {participants.map((p, idx) => (
          <MobileSortableRow
            key={p.id}
            participant={p}
            index={idx}
            getModelById={getModelById}
            getIdentityById={getIdentityById}
            onEditRole={() => onEditRole(p.id)}
            onRemove={() => {
              const m = getModelById(p.modelId);
              onRemove(p.id, m?.displayName ?? p.modelId);
            }}
            isSequential={isSequential}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
