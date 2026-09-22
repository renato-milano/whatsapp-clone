import { z } from "zod";

export const readinessSchema = z.object({
  status: z.literal("ready"),
  database: z.literal("ok"),
  storage: z.literal("ok"),
});

export type Readiness = z.infer<typeof readinessSchema>;

// Foundation diagnostics only: chat rooms will require authenticated membership.
export type ChatMessage = {
  id: string;
  conversationId: string;
  memberId: string;
  authorName: string;
  body: string;
  createdAt: string;
  replyTo?: { id: string; authorName: string; body: string };
  editedAt?: string;
  deletedAt?: string;
  reaction?: { emoji: string; count: number; mine: boolean; names?: string[] };
  // Personal star: true only for the member reading the timeline.
  saved?: boolean;
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    viewOnce?: boolean;
    consumedAt?: string;
    localUrl?: string;
    pending?: boolean;
  };
  deliveryStatus?: "uploading" | "failed";
  music?: {
    trackId: string;
    trackUri: string;
    title: string;
    artist: string;
    album: string;
    imageUrl?: string;
    spotifyUrl: string;
    startMs: number;
    endMs: number;
  };
};

// Entry of the personal "Salvati" list: enough to render a preview with its
// date without loading the surrounding timeline.
export type SavedMessage = {
  id: string;
  memberId: string;
  authorName: string;
  body: string;
  createdAt: string;
  savedAt: string;
  musicTitle?: string | null;
  // Absent for a view-once attachment: fetching its content consumes it, so
  // the saved list must never be able to render one.
  attachmentId?: string | null;
  attachmentFilename?: string | null;
  attachmentMime?: string | null;
};

export interface ServerEvents {
  "service.ready": (payload: { status: "connected" }) => void;
  "chat.message.created": (message: ChatMessage) => void;
  "chat.typing": (payload: {
    memberId: string;
    displayName: string;
    isTyping: boolean;
  }) => void;
  "chat.message.updated": (message: ChatMessage) => void;
  "chat.message.deleted": (payload: { id: string; deletedAt: string }) => void;
  "chat.message.reaction": (payload: {
    messageId: string;
    emoji?: string;
    count: number;
    memberId: string;
    displayName: string;
  }) => void;
}

export interface ClientEvents {
  "service.ping": (ack: (payload: { status: "ok" }) => void) => void;
  "chat.message.send": (
    payload: { body: string; replyToId?: string; music?: ChatMessage["music"] },
    ack: (result: { message?: ChatMessage; error?: string }) => void,
  ) => void;
  "chat.typing": (payload: { isTyping: boolean }) => void;
  "chat.message.edit": (
    payload: { id: string; body: string },
    ack: (result: { message?: ChatMessage; error?: string }) => void,
  ) => void;
  "chat.message.delete": (
    payload: { id: string },
    ack: (result: { ok?: boolean; error?: string }) => void,
  ) => void;
  "chat.message.react": (
    payload: { messageId: string; emoji: string },
    ack: (result: { ok?: boolean; error?: string }) => void,
  ) => void;
}
