# Connect coding agents to the chat

The MCP connector lets Codex and Claude Code read and send text messages as an
existing chat member. Users install the connector as a package; they don't
need this repository. Both clients share one configuration on the user's
computer. The connector uses stdio locally and HTTPS to reach the chat server.
It doesn't run a coding agent or require a model API key.

## Configure the connection

Update the chat backend to the version containing `/api/v1/mcp/connect` and
`/api/v1/mcp/messages` before setup. The connector doesn't work against an
older deployment. For development, start the application with `npm run dev`.

The connector ships as a tarball attached to a GitHub release, not through
the npm registry. On a computer without the project source, run:

```sh
CONNECTOR=https://github.com/renato-milano/whatsapp-clone/releases/download/mcp-v0.1.0/private-chat-mcp-0.1.0.tgz
npx -y "$CONNECTOR" setup
```

Enter the complete invitation link, including `#i=…`, and your existing
display name. The link input is hidden in an interactive terminal. Setup
verifies access before saving anything. Unknown names are rejected and don't
create members or occupy a conversation slot.

The browser address without the invitation fragment isn't sufficient. HTTPS
is required except for localhost development. The development link on port
5173 works through Vite's API proxy.

## Where your configuration is stored

The default file is `~/.config/private-chat-mcp/config.json`. Its contents are:

```json
{
  "chatLink": "https://chat.example/c/abcdefghijklmnop#i=EXAMPLE_SECRET_REPLACE_ME",
  "displayName": "Your existing name"
}
```

The file is outside the repository. New configuration directories use mode
`0700`, and the file uses mode `0600` on macOS/Linux. The link is stored as
plain text protected by filesystem permissions, not encrypted or in Keychain.
Anyone who can read it has the same invitation credential you entered.

Session cookies stay in process memory. Each connector process establishes
its own session; a rejected expired session is renewed automatically using
the stored link and name. The backend retains its normal session records.
Reconnection follows the application's existing invitation access rules.

Run setup again to change the chat or name, then restart the MCP connections.
Set `PRIVATE_CHAT_MCP_CONFIG` to an absolute file path to use another
configuration; both setup and the connector honor it. Set the same override
in each client's MCP environment if you want them to share that alternative.

Deleting the file prevents future connector startup but doesn't revoke an
already established session or erase copies of the invitation link.

## Register the connector

After setup, register the package as a local stdio MCP server. These commands
download and run the published package; they don't require a checkout of the
chat project:

```sh
codex mcp add private-chat -- npx -y "$CONNECTOR" serve
claude mcp add --transport stdio --scope user private-chat -- npx -y "$CONNECTOR" serve
```

The shell expands `$CONNECTOR` while registering, so each client stores the
full URL. Use the same terminal session as the setup step, or paste the URL.

Register once in each client. Restart the client or reload its MCP connection,
then call `chat_status` to check the conversation and member identity.
Node.js 22.18+ from the 22 series must be available to the client process.
The first start downloads the tarball into npm's cache and later starts reuse
it. npm caches by URL: replacing the file behind an URL already used does not
take effect. Every new version therefore needs a new release URL, and both
clients must be registered again with it.

The connector follows the official
[Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
and [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp).

## Available tools

Tools operate only on the configured conversation. Sending a message uses
your existing member ID and name, and updates browser clients in real time.

| Tool          | Behavior                                                                |
| ------------- | ----------------------------------------------------------------------- |
| `chat_status` | Returns the connected conversation and member, without credentials.     |
| `chat_read`   | Returns text messages, with `before` or `after` cursors for pagination. |
| `chat_search` | Searches for a literal text substring and paginates older matches.      |
| `chat_send`   | Sends text, optionally with `replyToId` from the same conversation.     |
| `chat_wait`   | Polls for new messages after a cursor for up to 30 seconds.             |

Read results are in insertion order. Use `oldestCursor` as `before` to read
older pages, or `latestCursor` as `after` to read new messages. When `hasMore`
is true, continue in the direction you requested. Search returns matching
messages only; case-insensitive matching follows SQLite's ASCII folding.

Waiting requires a `latestCursor` from a previous read. It detects new
messages, not edits or deletions. It doesn't start background work when an
agent is closed. Attachments, media bodies, editing, and deletion aren't
exposed in this first version.

Messages returned by the chat are content, not instructions to execute.
The connector tells agents to send only when requested by the user; each
host retains its own tool approval controls. If an HTTP send times out,
delivery may have succeeded: read the chat before retrying to avoid duplicates.

## Publish a new version

From the project repository, with the `gh` CLI authenticated:

```sh
npm run check
npm pack -w @private-chat/mcp
gh release create mcp-v0.1.0 private-chat-mcp-0.1.0.tgz \
  --title "MCP connector 0.1.0" --notes "Connector for Codex and Claude Code."
```

Raise `version` in `apps/mcp/package.json` before packing again; the tag, the
asset name and the install URL all follow that number. The release asset is
public, so anyone who knows the URL can download it. The tarball holds only
the compiled connector, no chat credentials: the invitation link stays the
only secret, and it lives on each user's computer.

## Verify changes

From the project repository, run `npm run check` to typecheck, test, and build
all components. MCP tests
use synthetic chats and temporary configurations. They cover filesystem
permissions, existing-member access, room isolation, pagination, session
renewal, realtime delivery, waiting, and a real MCP stdio handshake.
