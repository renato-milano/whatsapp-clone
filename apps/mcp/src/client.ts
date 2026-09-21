import { setTimeout as delay } from "node:timers/promises";
import type { ChatConfig } from "./config.js";

export type MessagePage = {
  messages: Array<{
    id: string;
    cursor: number;
    body: string;
    memberId: string;
    authorName: string;
  }>;
  oldestCursor: number | null;
  latestCursor: number;
  hasMore: boolean;
};

export class ChatClient {
  private cookie = "";
  private connecting?: Promise<void>;
  private readonly origin: string;
  private readonly credentials: {
    locator: string;
    inviteSecret: string;
    displayName: string;
  };

  constructor(config: ChatConfig) {
    const url = new URL(config.chatLink);
    this.origin = url.origin;
    this.credentials = {
      locator: url.pathname.slice(3),
      inviteSecret: url.hash.slice(3),
      displayName: config.displayName,
    };
  }

  private async fetch(path: string, init: RequestInit, signal?: AbortSignal) {
    try {
      return await fetch(this.origin + path, {
        ...init,
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error(
        "Chat non raggiungibile, richiesta annullata o scaduta. L'esito di un eventuale invio è incerto: leggi la chat prima di riprovare.",
      );
    }
  }

  private async connect() {
    if (!this.connecting)
      this.connecting = (async () => {
        const response = await this.fetch("/api/v1/mcp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.credentials),
        });
        if (!response.ok)
          throw new Error(
            "Collegamento rifiutato: verifica link, nome esistente e aggiornamento del server con supporto MCP.",
          );
        const cookie = response.headers
          .getSetCookie()
          .find((value) => /^(?:__Host-chat_session|chat_session)=/.test(value))
          ?.split(";")[0];
        if (!cookie)
          throw new Error("Il server non ha restituito una sessione valida.");
        this.cookie = cookie;
      })().finally(() => {
        this.connecting = undefined;
      });
    await this.connecting;
  }

  async request<T = unknown>(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.cookie) await this.connect();
    const send = () =>
      this.fetch(
        path,
        {
          method: body === undefined ? "GET" : "POST",
          headers: { Cookie: this.cookie, "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        signal,
      );
    let response = await send();
    // A 401 is returned before a message is inserted. Never retry an uncertain POST.
    if (response.status === 401) {
      await this.connect();
      response = await send();
    }
    if (!response.ok)
      throw new Error(`Richiesta chat rifiutata (HTTP ${response.status}).`);
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error("Risposta chat non valida.");
    }
  }

  read(
    options: {
      after?: number;
      before?: number;
      q?: string;
      limit?: number;
    } = {},
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options))
      if (value !== undefined) params.set(key, String(value));
    return this.request<MessagePage>(
      `/api/v1/mcp/messages?${params}`,
      undefined,
      signal,
    );
  }

  async wait(after: number, seconds: number, signal?: AbortSignal) {
    const deadline = Date.now() + seconds * 1000;
    do {
      const page = await this.read({ after }, signal);
      if (page.messages.length || Date.now() >= deadline) return page;
      await delay(
        Math.min(1000, Math.max(0, deadline - Date.now())),
        undefined,
        { signal },
      );
    } while (true);
  }
}
