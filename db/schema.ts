import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
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
    reasoningDuration: integer("reasoningDuration"),
    isStreaming: integer("isStreaming").notNull().default(0),
    createdAt: text("createdAt").notNull(),
  },
  (table) => [
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_branch").on(table.branchId),
  ],
);

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
