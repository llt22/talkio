import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";


export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  type: text("type").notNull().default("single"),
  title: text("title").notNull().default(""),
  participants: text("participants").notNull().default("[]"),
  lastMessage: text("lastMessage"),
  lastMessageAt: text("lastMessageAt"),
  pinned: integer("pinned").notNull().default(0),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    senderModelId: text("senderModelId"),
    senderName: text("senderName"),
    identityId: text("identityId"),
    content: text("content").notNull().default(""),
    reasoningContent: text("reasoningContent"),
    toolCalls: text("toolCalls").notNull().default("[]"),
    toolResults: text("toolResults").notNull().default("[]"),
    branchId: text("branchId"),
    parentMessageId: text("parentMessageId"),
    images: text("images").notNull().default("[]"),
    generatedImages: text("generatedImages").notNull().default("[]"),
    reasoningDuration: real("reasoningDuration"),
    isStreaming: integer("isStreaming").notNull().default(0),
    status: text("status").notNull().default("success"),
    errorMessage: text("errorMessage"),
    tokenUsage: text("tokenUsage"),
    participantId: text("participantId"),
    createdAt: text("createdAt").notNull(),
  },
  (table) => [
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_branch").on(table.branchId),
  ],
);

export const messageBlocks = sqliteTable(
  "message_blocks",
  {
    id: text("id").primaryKey(),
    messageId: text("messageId")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("main_text"),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("success"),
    metadata: text("metadata"),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt"),
  },
  (table) => [
    index("idx_blocks_message").on(table.messageId),
    index("idx_blocks_message_order").on(table.messageId, table.sortOrder),
  ],
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  blocks: many(messageBlocks),
}));

export const messageBlocksRelations = relations(messageBlocks, ({ one }) => ({
  message: one(messages, {
    fields: [messageBlocks.messageId],
    references: [messages.id],
  }),
}));
