import { Fragment, StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import { type ClientEvents, type ServerEvents } from "@private-chat/contracts";
import type { ChatMessage } from "@private-chat/contracts";
import "./style.css";

type Member = { id: string; displayName: string; role: "owner" | "member" };
type Conversation = {
  id: string;
  locator: string;
  title: string;
  member: Member;
};
type ApiError = { error?: { message?: string } };
function dateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateKey(value) === dateKey(today.toISOString())) return "Oggi";
  if (dateKey(value) === dateKey(yesterday.toISOString())) return "Ieri";
  return date.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).replace(/\./g, "");
}
function highlightSearch(text: string, query: string) {
  const value = query.trim();
  if (!value) return text;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLocaleLowerCase() === value.toLocaleLowerCase() ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    ),
  );
}
async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok)
    throw new Error(payload.error?.message ?? "Operazione non riuscita.");
  return payload as T;
}

function Welcome({
  onReady,
}: {
  onReady: (
    conversation: Conversation,
    recoveryCode?: string,
    inviteLink?: string,
  ) => void;
}) {
  const [mode, setMode] = useState<"create" | "join" | "recover">("create");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const invite = useMemo(() => {
    try {
      const url = new URL(link);
      const locator = url.pathname.match(/\/c\/([A-Za-z0-9_-]{16,64})$/)?.[1];
      const secret = url.hash.startsWith("#i=") ? url.hash.slice(3) : "";
      return locator && secret ? { locator, inviteSecret: secret } : null;
    } catch {
      return null;
    }
  }, [link]);
  useEffect(() => {
    const match = window.location.pathname.match(
      /^\/c\/([A-Za-z0-9_-]{16,64})$/,
    );
    const secret = window.location.hash.startsWith("#i=")
      ? window.location.hash.slice(3)
      : "";
    if (match && secret) {
      setMode("join");
      setLink(window.location.origin + "/c/" + match[1] + "#i=" + secret);
      window.history.replaceState({}, "", "/c/" + match[1]);
    }
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "create") {
        const result = await api<{
          conversation: Conversation;
          recoveryCode: string;
          inviteLink: string;
        }>("/api/v1/conversations", {
          method: "POST",
          body: JSON.stringify({ displayName: name, title }),
        });
        onReady(result.conversation, result.recoveryCode, result.inviteLink);
      } else if (mode === "join") {
        if (!invite)
          throw new Error("Incolla il link completo ricevuto per entrare.");
        const result = await api<{
          conversation: Conversation;
          recoveryCode: string;
        }>("/api/v1/conversations/join", {
          method: "POST",
          body: JSON.stringify({ ...invite, displayName: name }),
        });
        onReady(result.conversation, result.recoveryCode);
      } else {
        const value = code.trim();
        const parsed = value.match(
          /^https?:\/\/[^/]+\/c\/([A-Za-z0-9_-]{16,64})#r=([A-Za-z0-9_-]+)$/,
        );
        const shortParsed = value.match(
          /^([A-Za-z0-9_-]{16,64})#r=([A-Za-z0-9_-]+)$/,
        );
        const locator = parsed?.[1] ?? shortParsed?.[1] ?? "";
        const recoveryCode = parsed?.[2] ?? shortParsed?.[2] ?? value;
        if (!locator)
          throw new Error("Usa il codice nel formato link#r=codice.");
        const result = await api<{ conversation: Conversation }>(
          "/api/v1/conversations/recover",
          { method: "POST", body: JSON.stringify({ locator, recoveryCode }) },
        );
        onReady(result.conversation);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Operazione non riuscita.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell">
      <header>
        <span className="brand-icon" aria-hidden="true">
          ◌
        </span>
        <strong>Chat privata</strong>
        <span className="label">Prima configurazione</span>
      </header>
      <section className="welcome">
        <p className="eyebrow">Uno spazio solo vostro</p>
        <h1>
          <span>Un po' come whatsapp, ma nostro.</span>
        </h1>
        <p>
          Crei una conversazione, condividi il link e tornate qui quando volete.
          Lo storico arriverà nel prossimo passo.
        </p>
        <div className="tabs" role="tablist">
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
            role="tab"
            aria-selected={mode === "create"}
          >
            Crea chat
          </button>
          <button
            className={mode === "join" ? "active" : ""}
            onClick={() => setMode("join")}
            role="tab"
            aria-selected={mode === "join"}
          >
            Ho un link
          </button>
          <button
            className={mode === "recover" ? "active" : ""}
            onClick={() => setMode("recover")}
            role="tab"
            aria-selected={mode === "recover"}
          >
            Recupera
          </button>
        </div>
        <form onSubmit={submit}>
          {mode !== "recover" && (
            <label>
              Il tuo nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Come ti chiamerà l’altra persona?"
                maxLength={50}
                required
              />
            </label>
          )}
          {mode === "create" && (
            <label>
              Titolo
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Conversazione privata"
                maxLength={100}
              />
            </label>
          )}
          {mode === "join" && (
            <label>
              Link di invito
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://…/c/…#i=…"
                required
              />
            </label>
          )}
          {mode === "recover" && (
            <label>
              Codice personale
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="https://…/c/…#r=…"
                required
              />
            </label>
          )}
          <button className="submit" disabled={busy}>
            {busy
              ? "Un momento…"
              : mode === "create"
                ? "Crea la conversazione"
                : mode === "join"
                  ? "Entra nella conversazione"
                  : "Recupera il mio accesso"}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <footer>
        <span>Struttura iniziale · 0.2.0</span>
        <p>
          Il nome è un’etichetta, non una password. Conserva il codice personale
          in un luogo sicuro.
        </p>
      </footer>
    </main>
  );
}

function Ready({
  conversation,
  recoveryCode,
  inviteLink,
  onReset,
}: {
  conversation: Conversation;
  recoveryCode?: string;
  inviteLink?: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState("");
  const copy = (value: string, label: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(label);
  };
  return (
    <main className="shell">
      <header>
        <span className="brand-icon" aria-hidden="true">
          ◌
        </span>
        <strong>Chat privata</strong>
        <span className="label">Conversazione pronta</span>
      </header>
      <section className="conversation-ready">
        <p className="eyebrow">Accesso configurato</p>
        <h1>{conversation.title}</h1>
        <p>
          Hai effettuato l’accesso come{" "}
          <strong>{conversation.member.displayName}</strong>. Il prossimo
          incremento aggiungerà messaggi e allegati.
        </p>
        {inviteLink && (
          <div className="secret-box">
            <span>Link da condividere</span>
            <code>{inviteLink}</code>
            <button onClick={() => copy(inviteLink, "Link copiato")}>
              {copied || "Copia il link"}
            </button>
          </div>
        )}
        {recoveryCode && (
          <div className="secret-box warning">
            <span>Codice personale · mostrato una sola volta</span>
            <code>
              {conversation.locator}#r={recoveryCode}
            </code>
            <button
              onClick={() =>
                copy(
                  conversation.locator + "#r=" + recoveryCode,
                  "Codice copiato",
                )
              }
            >
              {copied || "Copia il codice"}
            </button>
          </div>
        )}
        <button className="secondary" onClick={onReset}>
          Torna all’ingresso
        </button>
      </section>
      <footer>
        <span>Stanza · {conversation.locator}</span>
        <p>
          Non condividere il codice personale: serve per associare un nuovo
          dispositivo.
        </p>
      </footer>
    </main>
  );
}
function Chat({
  conversation,
  inviteLink,
  recoveryCode,
  onLogout,
}: {
  conversation: Conversation;
  inviteLink?: string;
  recoveryCode?: string;
  onLogout: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [sendingBody, setSendingBody] = useState<string>();
  const [error, setError] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const [typingUser, setTypingUser] = useState<string>();
  const [copied, setCopied] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<string>();
  const [pendingFile, setPendingFile] = useState<File>();
  const [viewOnce, setViewOnce] = useState(false);
  const [consumedMedia, setConsumedMedia] = useState<Set<string>>(() => new Set());
  const [recording, setRecording] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string>();
  const [fullscreenVideo, setFullscreenVideo] = useState<string>();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<Array<{ id: string; createdAt: string }>>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [highlightMessage, setHighlightMessage] = useState<string>();
  const [showInvite, setShowInvite] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [scrollDate, setScrollDate] = useState<string>();
  const [replyTo, setReplyTo] = useState<ChatMessage>();
  const [editingMessage, setEditingMessage] = useState<ChatMessage>();
  const [menuMessage, setMenuMessage] = useState<ChatMessage>();
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [reactionTarget, setReactionTarget] = useState<string>();
  const [reactions, setReactions] = useState<
    Record<string, { emoji: string; count: number; names: string[] }>
  >({});
  const messagesRef = useRef<HTMLElement | null>(null);
  const atBottomRef = useRef(true);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const initialLoadRef = useRef(false);
  const socketRef = useRef<Socket<ServerEvents, ClientEvents> | null>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const pendingScrollRestore = useRef<{ top: number; height: number } | undefined>(undefined);
  const pendingSearchTarget = useRef<string | undefined>(undefined);
  const reconnectNoticeTimer = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const searchTarget = pendingSearchTarget.current;
    if (searchTarget) {
      const targetElement = messageRefs.current[searchTarget];
      if (targetElement) {
        const centerTarget = () =>
          messageRefs.current[searchTarget]?.scrollIntoView({ behavior: "auto", block: "center" });
        centerTarget();
        for (const delay of [40, 120, 300, 700]) window.setTimeout(centerTarget, delay);
        pendingSearchTarget.current = undefined;
        return;
      }
    }
    const pending = pendingScrollRestore.current;
    const container = messagesRef.current;
    if (!pending || !container || loadingOlder) return;
    const restore = () => {
      container.scrollTop = pending.top + (container.scrollHeight - pending.height);
    };
    restore();
    // Media elements can change the height after the React commit.
    for (const delay of [40, 120, 300, 700]) window.setTimeout(restore, delay);
    pendingScrollRestore.current = undefined;
  }, [messages, loadingOlder]);
  useEffect(() => {
    void api<{ messages: ChatMessage[] }>("/api/v1/messages")
      .then((result) => {
        setMessages(result.messages);
        setScrollDate(result.messages.at(-1)?.createdAt);
        atBottomRef.current = true;
        initialLoadRef.current = true;
        for (const delay of [0, 100, 400, 900])
          window.setTimeout(() => {
            if (initialLoadRef.current && messagesRef.current)
              messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }, delay);
        window.setTimeout(() => {
          initialLoadRef.current = false;
        }, 1200);
        setReactions(
          Object.fromEntries(
            result.messages
              .filter((message) => message.reaction)
              .map((message) => [
                message.id,
                {
                  emoji: message.reaction!.emoji,
                  count: message.reaction!.count,
                  names: message.reaction!.names ?? [],
                },
              ]),
          ),
        );
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Errore"),
      );
    const socket: Socket<ServerEvents, ClientEvents> = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      window.clearTimeout(reconnectNoticeTimer.current);
      setReloadRequired(false);
      setError("");
      // A deploy replaces the Socket.IO process. Refresh the current window
      // after reconnect so messages missed during the rollout are recovered.
      void api<{ messages: ChatMessage[] }>("/api/v1/messages").then((result) => {
        setMessages(result.messages);
        setReactions(
          Object.fromEntries(
            result.messages
              .filter((message) => message.reaction)
              .map((message) => [
                message.id,
                {
                  emoji: message.reaction!.emoji,
                  count: message.reaction!.count,
                  names: message.reaction!.names ?? [],
                },
              ]),
          ),
        );
      }).catch(() => undefined);
    });
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") {
        setError("");
        window.clearTimeout(reconnectNoticeTimer.current);
        reconnectNoticeTimer.current = window.setTimeout(() => {
          setReloadRequired(true);
          socket.disconnect();
        }, 2500);
      }
    });
    socket.on("connect_error", () => {
      setError("");
    });
    socket.on("chat.message.created", (message) => {
      if (message.memberId !== conversation.member.id && !atBottomRef.current)
        setUnreadCount((count) => count + 1);
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
    });
    socket.on("chat.message.updated", (message) =>
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, ...message } : item,
        ),
      ),
    );
    socket.on(
      "chat.message.reaction",
      ({ messageId, emoji, count, displayName }) =>
        setReactions((current) => ({
          ...current,
          [messageId]: {
            emoji: emoji ?? "❤️",
            count,
            names: [...(current[messageId]?.names ?? []), displayName],
          },
        })),
    );
    socket.on("chat.message.deleted", ({ id, deletedAt }) =>
      setMessages((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, deletedAt, body: "Questo messaggio è stato eliminato" }
            : item,
        ),
      ),
    );
    socket.on("chat.typing", (payload) => {
      if (payload.memberId !== conversation.member.id)
        setTypingUser(payload.isTyping ? payload.displayName : undefined);
    });
    return () => {
      window.clearTimeout(reconnectNoticeTimer.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    return () => {
      if ("scrollRestoration" in history) history.scrollRestoration = "auto";
    };
  }, []);
  useEffect(() => {
    const element = messagesRef.current;
    if (element && atBottomRef.current) {
      element.scrollTo({
        top: element.scrollHeight,
        behavior: initialLoadRef.current ? "auto" : "smooth",
      });
      window.setTimeout(() => {
        if (atBottomRef.current && messagesRef.current)
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }, 260);
      window.setTimeout(() => {
        if (atBottomRef.current && messagesRef.current)
          messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      }, 700);
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (atBottomRef.current && messagesRef.current)
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
        }),
      );
    }
  }, [messages, typingUser]);
  useEffect(() => {
    if (!search.trim()) {
      setSearchMatches([]);
      setSearchTotal(0);
      if (showSearch)
        void api<{ messages: ChatMessage[] }>("/api/v1/messages").then((result) => setMessages(result.messages));
      return;
    }
    setSearchIndex(0);
    const timer = window.setTimeout(() => {
      void api<{ messages: ChatMessage[]; total?: number; matches?: Array<{ id: string; createdAt: string }> }>(
        `/api/v1/messages?q=${encodeURIComponent(search)}`,
      ).then((result) => {
        atBottomRef.current = false;
        setMessages(result.messages);
        setSearchMatches(result.matches ?? []);
        setSearchTotal(result.total ?? result.messages.length);
        const first = result.matches?.[0]?.id;
        if (first) {
          pendingSearchTarget.current = first;
          setHighlightMessage(first);
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, showSearch]);
  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".message-menu")) setMenuMessage(undefined);
      if (!target.closest(".emoji-picker") && !target.closest(".emoji-button"))
        setShowEmoji(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (pendingFile) {
      const form = new FormData();
      form.append("caption", text);
      if (replyTo?.id) form.append("replyToId", replyTo.id);
      form.append("file", pendingFile);
      if (viewOnce) form.append("viewOnce", "1");
      const response = await fetch("/api/v1/messages/attachment", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!response.ok) setError("Upload non riuscito");
      else {
        setBody("");
        setReplyTo(undefined);
        setPendingFile(undefined);
        setAttachmentPreview(undefined);
        setViewOnce(false);
        void api<{ messages: ChatMessage[] }>("/api/v1/messages").then(
          (result) => setMessages(result.messages),
        );
      }
      return;
    }
    if (!text || !socketRef.current) return;
    if (!socketRef.current.connected) {
      setError("Connessione in ripristino, riprova tra un momento.");
      return;
    }
    setShowEmoji(false);
    window.clearTimeout(typingTimer.current);
    socketRef.current.emit("chat.typing", { isTyping: false });
    if (editingMessage) {
      socketRef.current.emit(
        "chat.message.edit",
        { id: editingMessage.id, body: text },
        (result) => {
          if (result.error) setError(result.error);
          else {
            setBody("");
            setEditingMessage(undefined);
          }
        },
      );
      return;
    }
    setSendingBody(text);
    socketRef.current.emit(
      "chat.message.send",
      { body: text, replyToId: replyTo?.id },
      (result) => {
        if (result.error) {
          setError(result.error);
          setSendingBody(undefined);
        } else {
          setBody("");
          setReplyTo(undefined);
          setSendingBody(undefined);
          window.setTimeout(() => {
            if (atBottomRef.current && messagesRef.current)
              messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }, 280);
        }
      },
    );
  }
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      setError("Per registrare audio è necessario aprire la chat tramite HTTPS. Su iPhone gli indirizzi HTTP della rete locale non possono usare il microfono.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("La registrazione audio non è disponibile in questo contesto.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "";
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recordingChunks.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordingChunks.current, { type: recorder.mimeType || "audio/mp4" });
        const extension = blob.type.includes("webm") ? "webm" : "m4a";
        const file = new File([blob], `messaggio-vocale-${Date.now()}.${extension}`, { type: blob.type || "audio/mp4" });
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/v1/messages/attachment", { method: "POST", body: form, credentials: "include" });
        if (!response.ok) setError("Invio del messaggio vocale non riuscito.");
        setRecording(false);
        recorderRef.current = null;
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError("Non è stato possibile accedere al microfono.");
    }
  }
  return (
    <main className="chat-shell">
      <header>
        <strong>{conversation.title}</strong>
        <button
          className="search-toggle"
          aria-label="Cerca messaggi"
          onClick={() => setShowSearch((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2"/><path d="m16 16 5 5"/></svg>
        </button>
        <span className="label">{conversation.member.displayName}</span>
        {inviteLink && (
          <button
            className="info-button"
            aria-expanded={showInvite}
            onClick={() => setShowInvite((open) => !open)}
          >
            {showInvite ? "Chiudi info" : "Info stanza"}
          </button>
        )}
        <button
          onClick={() => {
            void api("/api/v1/logout", { method: "POST" });
            onLogout();
          }}
        >
          Nuova chat
        </button>
      </header>
      {showSearch && (
        <div className="search-bar" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="search-close"
            aria-label="Chiudi ricerca"
            onClick={() => {
              setShowSearch(false);
              setSearch("");
              void api<{ messages: ChatMessage[] }>("/api/v1/messages").then((result) => setMessages(result.messages));
            }}
          >×</button>
          <input
            autoFocus
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca nei messaggi"
          />
          {search.trim() && (
            <div className="search-controls">
              <span>{searchMatches.length ? `${searchIndex + 1} di ${searchTotal}` : `0 di ${searchTotal}`}</span>
              <button
                type="button"
                aria-label="Messaggi meno recenti"
                disabled={!searchMatches.length || searchIndex >= searchMatches.length - 1}
                onClick={async () => {
                  const next = Math.min(searchMatches.length - 1, searchIndex + 1);
                  setSearchIndex(next);
                  const target = searchMatches[next];
                  if (!target) return;
                  const result = await api<{ messages: ChatMessage[] }>(`/api/v1/messages?around=${target.id}`);
                  atBottomRef.current = false;
                  pendingSearchTarget.current = target.id;
                  setMessages(result.messages);
                  setHighlightMessage(target.id);
                }}
                >↑</button>
              <button
                type="button"
                aria-label="Messaggi più recenti"
                disabled={!searchMatches.length || searchIndex <= 0}
                onClick={async () => {
                  const next = Math.max(0, searchIndex - 1);
                  setSearchIndex(next);
                  const target = searchMatches[next];
                  if (!target) return;
                  const result = await api<{ messages: ChatMessage[] }>(`/api/v1/messages?around=${target.id}`);
                  atBottomRef.current = false;
                  pendingSearchTarget.current = target.id;
                  setMessages(result.messages);
                  setHighlightMessage(target.id);
                }}
              >↓</button>
            </div>
          )}
        </div>
      )}
      {inviteLink && showInvite && (
        <div className="chat-invite">
          <span>Link da condividere</span>
          <code>{inviteLink}</code>
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(inviteLink);
              setCopied("Link copiato");
            }}
          >
            {copied || "Copia il link"}
          </button>
          {recoveryCode && (
            <small>
              Codice personale: {conversation.locator}#r={recoveryCode}
            </small>
          )}
        </div>
      )}
      <section
        className={`messages${search ? " searching" : ""}`}
        ref={messagesRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const containerRect = element.getBoundingClientRect();
          const visible = messages.find((message) => {
            const item = messageRefs.current[message.id];
            if (!item) return false;
            const rect = item.getBoundingClientRect();
            return rect.bottom >= containerRect.top + 18 && rect.top <= containerRect.bottom;
          });
          if (visible) setScrollDate(visible.createdAt);
          atBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            48;
          setShowJumpToLatest(!atBottomRef.current);
          if (atBottomRef.current) setUnreadCount(0);
          // Prefetch before the user reaches the oldest loaded message. The
          // threshold is roughly 10–15 message bubbles on mobile and desktop.
          const prefetchDistance = Math.max(720, element.clientHeight * 1.25);
          const loadingOlderMessages = element.scrollTop < prefetchDistance && !search;
          const loadingSearchOlder = element.scrollTop < prefetchDistance && !!search;
          const loadingSearchNewer =
            element.scrollHeight - element.scrollTop - element.clientHeight < prefetchDistance && !!search;
          if (
            (loadingOlderMessages || loadingSearchOlder || loadingSearchNewer) &&
            !loadingOlder &&
            messages.length &&
            messages[0]
          ) {
            setLoadingOlder(true);
            const edge = loadingSearchNewer ? messages[messages.length - 1] : messages[0];
            const previousScrollTop = element.scrollTop;
            const previousScrollHeight = element.scrollHeight;
            void api<{ messages: ChatMessage[] }>(
              `/api/v1/messages?${loadingSearchNewer ? "after" : "before"}=${edge!.id}`,
            )
              .then((result) => {
                if (result.messages.length) {
                  if (loadingSearchNewer)
                    setMessages((current) => [...current, ...result.messages]);
                  else {
                    atBottomRef.current = false;
                    pendingScrollRestore.current = {
                      top: previousScrollTop,
                      height: previousScrollHeight,
                    };
                    setMessages((current) => [...result.messages, ...current]);
                  }
                }
              })
              .finally(() => setLoadingOlder(false));
          }
        }}
      >
        {!search && scrollDate && (
          <div className="scroll-date-pill">{dateLabel(scrollDate)}</div>
        )}
        {search && searchMatches[searchIndex] && (
          <div className="search-date-pill">
            {dateLabel(searchMatches[searchIndex]!.createdAt)}
          </div>
        )}
        {loadingOlder && (
          <div className="loading-older">Caricamento messaggi precedenti…</div>
        )}
        {messages.length === 0 ? (
          <p className="empty">Nessun messaggio. Inizia la conversazione.</p>
        ) : (
          messages.map((message, index) => (
            <Fragment key={message.id}>
            {(index === 0 || dateKey(message.createdAt) !== dateKey(messages[index - 1]!.createdAt)) && (
              <div className="date-separator"><span>{dateLabel(message.createdAt)}</span></div>
            )}
            <article
              className={
                message.memberId === conversation.member.id
                  ? `message mine${highlightMessage === message.id ? " highlight" : ""}`
                  : `message${highlightMessage === message.id ? " highlight" : ""}`
              }
              ref={(element) => {
                messageRefs.current[message.id] = element;
              }}
              onDoubleClick={() =>
                socketRef.current?.emit(
                  "chat.message.react",
                  { messageId: message.id, emoji: "❤️" },
                  () => undefined,
                )
              }
              onContextMenu={(event) => {
                event.preventDefault();
                setMenuMessage(message);
                setMenuPosition({
                  x: Math.min(event.clientX, window.innerWidth - 230),
                  y: Math.min(event.clientY, window.innerHeight - 80),
                });
              }}
              onTouchStart={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                window.clearTimeout(longPressTimer.current);
                longPressTimer.current = window.setTimeout(() => {
                  setMenuMessage(message);
                  setMenuPosition({
                    x: Math.min(rect.right - 20, window.innerWidth - 230),
                    y: Math.max(12, rect.top - 52),
                  });
                }, 500);
              }}
              onTouchMove={() => window.clearTimeout(longPressTimer.current)}
              onTouchEnd={() => window.clearTimeout(longPressTimer.current)}
              onTouchCancel={() => window.clearTimeout(longPressTimer.current)}
            >
              {message.replyTo && (
                <div
                  className="reply-preview"
                  onClick={() => {
                    messageRefs.current[message.replyTo!.id]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    setHighlightMessage(message.replyTo!.id);
                    window.setTimeout(
                      () => setHighlightMessage(undefined),
                      900,
                    );
                  }}
                >
                  <strong>{message.replyTo.authorName}</strong>
                  <br />
                  {message.replyTo.body}
                </div>
              )}
              <small>{message.authorName}</small>
              <div>
                {message.attachment?.viewOnce && message.memberId !== conversation.member.id && !message.attachment.consumedAt && !consumedMedia.has(message.attachment.id) && (
                  <button
                    type="button"
                    className="view-once-button"
                    onClick={() => {
                      setConsumedMedia((current) => new Set(current).add(message.attachment!.id));
                      if (message.attachment!.mimeType.startsWith("video/"))
                        setFullscreenVideo(`/media/${message.attachment!.id}`);
                      else setFullscreenImage(`/media/${message.attachment!.id}`);
                    }}
                  >
                    Apri {message.attachment.mimeType.startsWith("video/") ? "video" : "foto"}
                  </button>
                )}
                {message.attachment?.viewOnce && message.memberId !== conversation.member.id && (message.attachment.consumedAt || consumedMedia.has(message.attachment.id)) && (
                  <span className="view-once-consumed">Media aperto</span>
                )}
                {message.attachment?.viewOnce && message.memberId === conversation.member.id && (
                  <span className="view-once-consumed">Media inviato</span>
                )}
                {!message.attachment?.viewOnce && message.attachment?.mimeType.startsWith("image/") && (
                  <img
                    onLoad={() => {
                      if (atBottomRef.current && messagesRef.current)
                        messagesRef.current.scrollTop =
                          messagesRef.current.scrollHeight;
                    }}
                    onClick={() =>
                      setFullscreenImage(`/media/${message.attachment!.id}`)
                    }
                    className="message-image"
                    src={`/media/${message.attachment.id}`}
                    alt={message.attachment.filename}
                  />
                )}
                {message.attachment?.mimeType.startsWith("audio/") && (
                  <audio
                    className="message-audio"
                    controls
                    preload="metadata"
                    src={`/media/${message.attachment.id}`}
                    aria-label={`Riproduci audio ${message.attachment.filename}`}
                  />
                )}
                {message.attachment &&
                  !message.attachment.mimeType.startsWith("image/") &&
                  !message.attachment.mimeType.startsWith("audio/") && (
                    <a
                      href={`/media/${message.attachment.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      📎 {message.attachment.filename}
                    </a>
                  )}
                {/^(immagine|video) omess[ao]$/i.test(message.body.trim()) ? (
                  <span className="media-opened">
                    <span className="media-opened-icon" aria-hidden="true" />
                    <span>Messaggio aperto</span>
                  </span>
                ) : message.body && (
                  <div className="message-caption">
                    {highlightSearch(message.body, search)}
                  </div>
                )}
              </div>
              <time>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {message.memberId === conversation.member.id && (
                  <span className="checks">✓✓</span>
                )}
                {message.editedAt && (
                  <span className="edited-label">modificato</span>
                )}
              </time>
              {reactions[message.id] && (
                <span className="reaction-pill">
                  <small>{reactions[message.id]?.names.join(", ")}</small>
                  {reactions[message.id]?.emoji}
                  {(reactions[message.id]?.count ?? 0) > 1 &&
                    ` ${reactions[message.id]?.count}`}
                </span>
              )}
            </article>
            </Fragment>
          ))
        )}
        {typingUser && (
          <article
            className="message typing-bubble"
            aria-label={`${typingUser} sta scrivendo`}
          >
            <span className="typing-dots">
              <i></i>
              <i></i>
              <i></i>
            </span>
          </article>
        )}
        {sendingBody && (
          <article className="message mine sending-preview">
            <div>{sendingBody}</div>
            <time>✓</time>
          </article>
        )}
      </section>
      {editingMessage && (
        <div className="reply-compose edit-compose">
          <strong>Modifica messaggio</strong>
          <span>{editingMessage.body}</span>
          <button
            onClick={() => {
              setEditingMessage(undefined);
              setBody("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {replyTo && !editingMessage && (
        <div className="reply-compose">
          <strong>Rispondi a {replyTo.authorName}</strong>
          <span>{replyTo.body}</span>
          <button onClick={() => setReplyTo(undefined)}>×</button>
        </div>
      )}
      {menuMessage && (
        <div
          className="message-menu"
          style={{ left: menuPosition.x, top: menuPosition.y }}
        >
          <button
            onClick={() => {
              setReplyTo(menuMessage);
              setMenuMessage(undefined);
            }}
          >
            <span aria-hidden="true">↩︎</span> Rispondi
          </button>
          <button
            onClick={() => {
              setReactionTarget(menuMessage.id);
              setShowEmoji(true);
              setMenuMessage(undefined);
            }}
          >
            <span aria-hidden="true">☺︎</span> Reagisci
          </button>
          {menuMessage.memberId === conversation.member.id && (
            <>
              <button
                onClick={() => {
                  setEditingMessage(menuMessage);
                  setReplyTo(undefined);
                  setBody(menuMessage.body);
                  setMenuMessage(undefined);
                }}
              >
                <span aria-hidden="true">✎︎</span> Modifica
              </button>
              <button
                onClick={() => {
                  socketRef.current?.emit(
                    "chat.message.delete",
                    { id: menuMessage.id },
                    () => undefined,
                  );
                  setMenuMessage(undefined);
                }}
              >
                <span aria-hidden="true">⌫︎</span> Elimina
              </button>
            </>
          )}
        </div>
      )}
      {showJumpToLatest && (
        <button
          className="unread-pill"
          aria-label={unreadCount > 0 ? `${unreadCount} nuovi messaggi, vai in fondo` : "Vai agli ultimi messaggi"}
          onClick={async () => {
            setShowSearch(false);
            setSearch("");
            setSearchMatches([]);
            setSearchTotal(0);
            setUnreadCount(0);
            atBottomRef.current = true;
            const result = await api<{ messages: ChatMessage[] }>("/api/v1/messages");
            setMessages(result.messages);
            setScrollDate(result.messages.at(-1)?.createdAt);
            setShowJumpToLatest(false);
          }}
        >
          <span>↓</span>{unreadCount > 0 && ` ${unreadCount}`}
        </button>
      )}
      <form className="composer" onSubmit={send}>
        <input
          className="file-input"
          type="file"
          id="attachment"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setPendingFile(file);
            setAttachmentPreview(
              file.type.startsWith("image/")
                ? URL.createObjectURL(file)
                : file.name,
            );
            event.currentTarget.value = "";
          }}
        />
        <div className="input-wrap">
          <textarea
            ref={textareaRef}
            value={body}
            onFocus={() => {
              setInputFocused(true);
              setMenuMessage(undefined);
            }}
            onBlur={() => setInputFocused(false)}
            onChange={(event) => {
              const value = event.target.value;
              setBody(value);
              socketRef.current?.emit("chat.typing", {
                isTyping: value.length > 0,
              });
              window.clearTimeout(typingTimer.current);
              if (value.length > 0)
                typingTimer.current = window.setTimeout(() => {
                  socketRef.current?.emit("chat.typing", { isTyping: false });
                }, 1800);
            }}
            placeholder="Scrivi un messaggio"
            maxLength={4000}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="button"
            className="emoji-button"
            onClick={() => setShowEmoji((open) => !open)}
            aria-label="Scegli emoji"
          >
            ☺︎
          </button>
        </div>
        {attachmentPreview && (
          <div className="attachment-preview">
            <button
              type="button"
              className="attachment-cancel"
              aria-label="Rimuovi allegato"
              onClick={() => {
                setPendingFile(undefined);
                setAttachmentPreview(undefined);
                setViewOnce(false);
              }}
            >×</button>
            {attachmentPreview.startsWith("blob:") ? (
              <img src={attachmentPreview} alt="Anteprima allegato" />
            ) : (
              attachmentPreview
            )}
            {pendingFile && (
              <label className="view-once-toggle">
                <input type="checkbox" checked={viewOnce} onChange={(event) => setViewOnce(event.target.checked)} />
                Visualizza una volta
              </label>
            )}
          </div>
        )}
        {!body.trim() && !inputFocused && (
          <label
            className={`attach-button${body.trim() ? " hidden" : ""}`}
            htmlFor="attachment"
            aria-label="Invia foto"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h2l1.2-1.5h4.6L15.5 4h2A2.5 2.5 0 0 1 20 6.5v10A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
              <circle cx="12" cy="11.5" r="3.2" />
            </svg>
          </label>
        )}
        {!body.trim() && !pendingFile && !inputFocused && (
          <button
            type="button"
            className={`recording-button${recording ? " recording" : ""}`}
            aria-label={recording ? "Ferma e invia messaggio vocale" : "Registra messaggio vocale"}
            onClick={() => void toggleRecording()}
          >
            {recording ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="7" y="7" width="10" height="10" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
              </svg>
            )}
          </button>
        )}
        <button className="submit" aria-label="Invia messaggio">
          ➤
        </button>
      </form>
      {showEmoji && (
        <div className="emoji-picker">
          {[
            "😀",
            "😂",
            "🤣",
            "😍",
            "🥰",
            "😎",
            "😭",
            "😡",
            "👍",
            "👎",
            "❤️",
            "🔥",
            "🎉",
            "🙏",
            "🤔",
            "👏",
            "😘",
            "🤗",
            "🧶",
            "✨",
            "💛",
            "💚",
            "💙",
            "🙌",
            "💪",
            "😅",
            "😮",
            "🥳",
            "🤍",
          ].map((emoji) => (
            <button
              type="button"
              key={emoji}
              onClick={() => {
                if (reactionTarget) {
                  socketRef.current?.emit(
                    "chat.message.react",
                    { messageId: reactionTarget, emoji },
                    () => undefined,
                  );
                  setReactionTarget(undefined);
                  setShowEmoji(false);
                  return;
                }
                const area = textareaRef.current;
                const start = area?.selectionStart ?? body.length;
                const next =
                  body.slice(0, start) +
                  emoji +
                  body.slice(area?.selectionEnd ?? start);
                setBody(next);
                window.setTimeout(() => {
                  area?.focus();
                  area?.setSelectionRange(
                    start + emoji.length,
                    start + emoji.length,
                  );
                }, 0);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {(fullscreenImage || fullscreenVideo) && (
        <div
          className="image-lightbox"
          onClick={() => {
            setFullscreenImage(undefined);
            setFullscreenVideo(undefined);
          }}
        >
          <button className="lightbox-close" aria-label="Chiudi">
            ×
          </button>
          {fullscreenImage && <img
              src={fullscreenImage}
              alt="Immagine a schermo intero"
              onClick={(event) => event.stopPropagation()}
            />}
          {fullscreenVideo && <video
              src={fullscreenVideo}
              controls
              autoPlay
              playsInline
              onClick={(event) => event.stopPropagation()}
            />}
        </div>
      )}
      {reloadRequired && (
        <p className="form-error reload-notice">
          C&apos;è stato un aggiornamento, aggiorna la pagina :)
          <button type="button" onClick={() => window.location.reload()}>
            Aggiorna pagina
          </button>
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}
function App() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const inviteLocator = useMemo(
    () => window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]{16,64})$/)?.[1],
    [],
  );
  const [recoveryCode, setRecoveryCode] = useState<string | undefined>(
    () => localStorage.getItem("chat_recovery_code") ?? undefined,
  );
  const [inviteLink, setInviteLink] = useState<string | undefined>(
    () => localStorage.getItem("chat_invite_link") ?? undefined,
  );
  useEffect(() => {
    void api<{ conversation: Conversation }>("/api/v1/me")
      .then((result) => {
        // A room invite must take precedence over an existing session for a
        // different room (common when opening a link on a shared phone).
        if (inviteLocator && result.conversation.locator !== inviteLocator) {
          setConversation(null);
          setRecoveryCode(undefined);
          setInviteLink(undefined);
          return;
        }
        setConversation(result.conversation);
      })
      .catch(() => undefined);
  }, [inviteLocator]);
  if (conversation)
    return (
      <Chat
        conversation={conversation}
        inviteLink={inviteLink}
        recoveryCode={recoveryCode}
        onLogout={() => {
          localStorage.removeItem("chat_recovery_code");
          localStorage.removeItem("chat_invite_link");
          setConversation(null);
          setRecoveryCode(undefined);
          setInviteLink(undefined);
        }}
      />
    );
  return (
    <Welcome
      onReady={(next, code, inviteLink) => {
        setConversation(next);
        setRecoveryCode(code);
        setInviteLink(inviteLink);
        if (code) localStorage.setItem("chat_recovery_code", code);
        if (inviteLink) localStorage.setItem("chat_invite_link", inviteLink);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
