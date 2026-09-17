# Modello dati e contratti applicativi

Questo documento definisce il contratto da implementare fra browser, API e
realtime. Non descrive endpoint già disponibili. Gli identificatori sono
opachi, i timestamp nativi sono UTC in formato ISO 8601 e l'identità del
mittente deriva sempre dalla sessione autenticata.

## Entità e vincoli

Usa migrazioni versionate, foreign key attive e transazioni. `id` indica un
UUID casuale salvo diversa specifica; `created_at` è un timestamp server.
I campi elencati costituiscono il modello logico minimo, non DDL eseguibile.

| Entità | Campi principali e vincoli |
| --- | --- |
| `conversations` | `id`, `locator UNIQUE`, `title`, `owner_member_id`, `invite_hash`, `invite_version`, `invite_open`, `next_live_seq`, `next_event_seq`, `import_status`, `created_at`. |
| `members` | `id`, `conversation_id`, `slot` in 1–2, `display_name`, `role`, `recovery_hash`, `recovery_version`, `revoked_at`; un solo membro attivo per slot. |
| `devices` | `id`, `label`, `created_at`, `last_seen_at`; non utilizzare fingerprint del browser come autenticazione. |
| `device_memberships` | `device_id`, `member_id`, `created_at`, `revoked_at`; coppia univoca. |
| `sessions` | `id`, `device_id`, `token_hash UNIQUE`, `expires_at`, `last_used_at`, `revoked_at`. |
| `messages` | `id`, `conversation_id`, `sender_member_id` nullable per eventi sistema, `kind`, `body`, `attachment_id`, `reply_to_id`, `timeline_seq`, `client_message_id`, `payload_hash`, `source`, `sent_at`, `source_metadata_json`, `created_at`, `updated_at`, `version`, `deleted_at`, `import_id`, `source_ordinal`. |
| `attachments` | `id`, `conversation_id`, `uploader_member_id`, `client_upload_id`, `state`, `original_name`, `storage_key`, `sha256`, `mime`, `size_bytes`, `width`, `height`, `duration_ms`, `import_id`, `created_at`; upload client univoco per membro. |
| `attachment_variants` | `id`, `attachment_id`, `purpose`, `storage_key`, `mime`, `size_bytes`, `sha256`; finali immutabili. |
| `member_cursors` | `member_id UNIQUE`, `delivered_live_seq`, `read_live_seq`, `updated_at`; solo avanzamento. |
| `reactions` | `message_id`, `member_id`, `emoji`, `updated_at`; coppia univoca. |
| `conversation_events` | `conversation_id`, `event_seq`, `event_id UNIQUE`, `type`, `entity_id`, `entity_version`, `created_at`, `published_at`; chiave composta stanza/sequenza. |
| `import_jobs` | `id`, `conversation_id`, `source_hash`, `manifest_hash`, `configuration_hash`, `parser_version`, `timezone`, `mapping_json`, `state`, `counts_json`, `warnings_json`, `created_at`, `completed_at`. |
| `import_records` | `import_id`, `source_ordinal`, `raw_timestamp`, `timestamp_status`, `record_hash`, `parsed_json`; coppia univoca, staging privato. |
| `push_subscriptions` | `id`, `device_id`, `endpoint`, chiavi subscription, `created_at`, `revoked_at`; segreti non esposti nei log. |
| `push_subscription_conversations` | `subscription_id`, `conversation_id`, `enabled`; coppia univoca, membro autorizzato verificato anche al dispatch. |
| `jobs` | `id`, `kind`, `dedupe_key UNIQUE`, `payload_ref`, `state`, `attempts`, `next_attempt_at`, `lease_until`, `last_error_code`. |
| `admin_audit` | `id`, `action`, `actor_id`, `target_id`, `created_at`, `result`; nessun contenuto di chat. |
| `idempotency_keys` | `scope`, `key`, `request_hash`, `resource_id`, `created_at`; chiave composta scope/key per creazione stanza e altre mutazioni ritentabili. |

`members` conserva le vecchie identità revocate per non perdere l'autore dei
messaggi. Un indice univoco parziale su stanza/slot attivo impedisce un terzo
membro. Il controllo va effettuato nella stessa transazione di ingresso.

Le sessioni identificano il dispositivo; ogni accesso a una stanza risolve il
membro tramite `device_memberships`. Nella prima versione un dispositivo può
essere associato a un solo membro attivo della stessa chat. Per simulare due
persone sullo stesso computer, usare profili browser separati.

## Ordinamento, indici e ricevute

L'ordine della timeline non dipende dall'orologio del client. Questo evita
inversioni durante invii simultanei e conserva lo storico importato.

- I messaggi nativi ricevono `timeline_seq` positivo crescente, allocato
  nella transazione server; la coppia stanza/sequenza è univoca.
- Un import di N record assegna sequenze da `-N` a `-1` nell'ordine del file.
  Non è previsto un secondo import appenditivo P0; i messaggi nativi restano
  dopo lo storico anche se un timestamp sorgente è anomalo.
- `sent_at` conserva l'istante sorgente convertito, quando determinabile;
  `created_at` indica l'inserimento nel nuovo servizio. L'UI usa `sent_at`
  oppure l'ora locale sorgente quando la conversione non è risolta.
- `source_metadata_json` conserva `rawTimestamp`, fuso, stato di conversione,
  `sourceEdited` e label anonima dell'autore sorgente per eventi sistema.
  Questi dati minimi sopravvivono alla pulizia dello staging; non conservare
  qui copie grezze integrali del messaggio.
- `event_seq` ordina le mutazioni di sincronizzazione, comprese modifiche,
  eliminazioni e reazioni. Non è la sequenza della timeline.
- Indici: messaggi `(conversation_id, timeline_seq)`, eventi
  `(conversation_id, event_seq)`, media `(conversation_id, id)` e import
  `(conversation_id, source_hash)`.
- Indice univoco invii `(sender_member_id, client_message_id)` per sorgente
  nativa, con confronto di `payload_hash` al retry.
- Ricerca FTS5 su testo/didascalia, filtrata per stanza e messaggi non
  eliminati. Verificare FTS5 nel driver scelto; il fallback LIKE è ammesso
  solo se supera l'obiettivo prestazionale documentato.

Le ricevute avanzano soltanto sui messaggi nativi. `delivered_live_seq` è
l'ultimo punto contiguo acquisito dal dispositivo; `read_live_seq` è l'ultimo
punto contiguo effettivamente mostrato in una chat visibile. Un salto da
ricerca non marca automaticamente come letto tutto l'intervallo precedente.
Il server aggrega i dispositivi dello stesso membro usando il massimo e
mantiene `read <= delivered <= ultimo live_seq`.

La doppia spunta per un messaggio di A deriva dal cursore di B. I messaggi
inviati da B nell'intervallo non aumentano il contatore dei suoi non letti.
I messaggi importati e gli eventi sistema sono esclusi da entrambi i calcoli.

## Schema comune delle API

Il prefisso è `/api/v1`. Tutte le mutazioni autenticate richiedono CSRF e
verifica origine; ingresso e recupero richiedono comunque verifica origine,
validazione e rate limiting. Le risposte non includono token persistenti,
hash di segreti o percorsi fisici.

```json
{
  "error": {
    "code": "ROOM_FULL",
    "message": "I posti della conversazione sono già occupati.",
    "requestId": "req_opaque",
    "retryable": false
  }
}
```

Usa `400` per formato errato, `401` per sessione assente/scaduta, `403` per
operazione vietata, `404` per risorsa inesistente o non visibile, `409` per
conflitto, `413` per dimensione eccessiva, `415` per tipo non supportato,
`422` per contenuto non valido, `429` per frequenza eccessiva e `503` per
indisponibilità temporanea. Gli errori frontend si basano sui codici stabili,
non sul testo italiano della risposta.

## Endpoint di accesso e gestione

Le operazioni amministrative sono separate dalle azioni quotidiane della
chat. I segreti sono inviati nel body HTTPS, mai nella query string.

| Metodo e percorso | Input essenziale | Output e regola |
| --- | --- | --- |
| `POST /admin/session` | Credenziale installazione | Cookie gestione; rate limiting dedicato. |
| `POST /conversations` | Nome proprietario, titolo, `Idempotency-Key` | `201`, locator, link invito, membro proprietario, codice recupero e cookie dispositivo. Gestione autenticata. |
| `POST /invitations/inspect` | Locator e segreto | Validità e posto disponibile, senza nomi o storico. |
| `POST /conversations/:locator/join` | Segreto invito, nome | `201` per un nuovo membro, `200` con `recognized: true` per un dispositivo che ripete il nome di un membro esistente; secondo posto acquisito atomicamente. |
| `POST /conversations/:locator/recover` | Codice personale | Nuova associazione dispositivo e nuovo codice; nessun nuovo membro. |
| `GET /me` | Cookie | Dispositivo e conversazioni autorizzate con relativo membro. |
| `DELETE /session` | Cookie e CSRF | Revoca della sessione corrente e cancellazione cookie. |
| `PATCH /conversations/:id/me` | Nome | Aggiorna solo il proprio nome; non cambia l'autore storico assegnato. |
| `POST /conversations/:id/recovery-code` | Sessione membro | Ruota il proprio codice e restituisce il segreto una sola volta. |
| `GET /conversations/:id/devices` | Sessione membro | Dispositivi associati allo stesso membro, senza token. |
| `DELETE /conversations/:id/devices/:deviceId` | Sessione membro | Revoca associazione, socket e subscription chat del dispositivo scelto. |
| `POST /conversations/:id/invitation/rotate` | Sessione proprietario | Nuovo segreto; invito resta chiuso se entrambi i posti sono occupati. |
| `DELETE /conversations/:id/members/:memberId` | Proprietario, conferma esplicita | Revoca soltanto il secondo membro, mantiene messaggi e autore storico, riapre il posto con nuovo invito. |

Il codice di recupero nella risposta di creazione non va ripetuto su un retry
idempotente: la risorsa viene restituita senza segreto e il proprietario può
rigenerarlo dopo avere ristabilito la sessione di gestione. Un ingresso
riuscito ma con cookie non ricevuto viene recuperato dal gestore; non
riconsegnare una sessione al solo possessore del vecchio invito consumato.

## Endpoint di conversazione e media

Le risorse sono sempre risolte nella chat autorizzata. Le pagine usano cursori
opachi verificati dal server, non offset instabili.

| Metodo e percorso | Contratto |
| --- | --- |
| `GET /conversations/:id/messages?before=&limit=50` | Ultima pagina o pagina precedente; `items`, `nextCursor`, `hasMore`, `headEventSeq`; massimo 100 elementi. |
| `GET /conversations/:id/messages/:messageId/context` | Fino a 25 precedenti e 25 successivi, più cursori per continuare. |
| `POST /conversations/:id/messages` | `clientMessageId`, `body`, eventuali `attachmentId` e `replyToId`; `201` nuovo, `200` retry identico, `409` payload diverso. |
| `PATCH /conversations/:id/messages/:messageId` | Nuovo body e `expectedVersion`; autore e finestra validati, incremento versione. |
| `DELETE /conversations/:id/messages/:messageId` | `expectedVersion`; elimina il contenuto e produce tombstone; ripetizione già eliminata è idempotente. |
| `PUT /conversations/:id/messages/:messageId/reaction` | Emoji valida, una per membro; stessa emoji produce stato invariato. |
| `DELETE /conversations/:id/messages/:messageId/reaction` | Rimuove la propria reazione, idempotente. |
| `GET /conversations/:id/search?q=&cursor=` | Query 2–200 caratteri, massimo 50 risultati, ordine dal più recente, cursore e conteggio pagina. |
| `POST /conversations/:id/receipts` | `deliveredLiveSeq`, `readLiveSeq`; avanzamento validato e idempotente. |
| `GET /conversations/:id/events?after=&limit=100` | Delta eventi, `nextCursor`, `headEventSeq`, `hasMore`; cursore vecchio restituisce `SYNC_RESET_REQUIRED`. |
| `POST /conversations/:id/attachments` | Multipart con file e ID client upload; `202`, ID e stato; controlli streaming. |
| `GET /conversations/:id/attachments/:attachmentId` | Metadati e stato conversione; nessun percorso privato. |
| `GET /conversations/:id/attachments/:attachmentId/content?variant=` | Stream autorizzato, supporto richieste Range per audio/video. |
| `DELETE /conversations/:id/attachments/:attachmentId` | Solo upload proprio non ancora collegato; annulla job e pianifica pulizia. |
| `PUT /push-subscriptions` | Subscription del dispositivo autenticato e lista chat autorizzate selezionate. |
| `DELETE /push-subscriptions/:id` | Solo dispositivo proprietario; revoca e annulla job pendenti. |

Le modifiche usano concorrenza ottimistica: se `expectedVersion` è superato,
ritorna `VERSION_CONFLICT` e il client ricarica il messaggio. Il riferimento
`replyToId` deve appartenere alla stessa conversazione; niente cicli e niente
risposte a ID provvisori non ancora persistiti.

```json
{
  "id": "msg_opaque",
  "conversationId": "chat_opaque",
  "senderMemberId": "member_opaque",
  "clientMessageId": "client_uuid",
  "kind": "text",
  "body": "Ci sentiamo più tardi?",
  "timelineSeq": 42,
  "sentAt": "2026-09-16T12:00:00.000Z",
  "version": 1,
  "source": "native",
  "replyToId": null,
  "attachment": null,
  "deletedAt": null
}
```

L'esempio è inventato. I valori di `kind` previsti sono `text`, `image`,
`video`, `audio`, `document`, `sticker`, `system` e `missing_media`.

## Contratto realtime

Il socket autentica con lo stesso cookie HTTP. Il server sceglie le room
autorizzate: il client non può iscriversi a un locator arbitrario. I messaggi
vengono creati via API HTTP; il socket diffonde aggiornamenti e presenza.

| Evento | Direzione e contenuto |
| --- | --- |
| `message.created` | Server → client: messaggio canonico e sequenza evento. |
| `message.updated` | Server → client: ID, versione e stato canonico aggiornato. |
| `message.deleted` | Server → client: ID, versione e tombstone. |
| `reaction.changed` | Server → client: ID messaggio e insieme corrente delle reazioni. |
| `receipt.updated` | Server → client: membro e cursori aggregati. |
| `import.completed` | Server → client: batch e conteggi; invalida cache timeline e ricerca. |
| `member.updated` | Server → client: ID membro, nome e stato. |
| `typing.set` | Client → server: conversazione e booleano; autenticato, throttling 1/secondo. |
| `typing.changed` | Server → altro membro: ID e scadenza; effimero. |
| `presence.changed` | Server → client: membro e stato online; effimero. |
| `session.revoked` | Server → client: cancella stato locale e disconnetti. |

Gli eventi durevoli hanno envelope `eventId`, `conversationId`, `eventSeq`,
`type`, `entityId`, `entityVersion`. Il recupero costruisce payload dalla
versione corrente delle entità; non conserva vecchi testi eliminati
nell'outbox. Eventi ripetuti o superati non devono far tornare indietro
lo stato.

Conserva gli eventi di sincronizzazione per 30 giorni. Un cursore precedente
richiede reset dello stato locale e nuova lettura paginata; il server non
cancella i messaggi quando scadono gli eventi. Lo stato canonico vince sempre
su una bolla ottimistica o una cache precedente.

## Endpoint di importazione

L'importazione è asincrona e riservata al proprietario. Stato e report sono
consultabili dopo reload della pagina e dopo riavvio del server.

| Metodo e percorso | Contratto |
| --- | --- |
| `POST /conversations/:id/imports` | ZIP multipart, `Idempotency-Key`; `202`, job di analisi. |
| `GET /conversations/:id/imports/:importId` | Stato, conteggi, autori rilevati, anomalie e avanzamento. |
| `PUT /conversations/:id/imports/:importId/configuration` | Mapping autori→membri, fuso e risoluzioni anomalie; ricalcola anteprima. |
| `GET /conversations/:id/imports/:importId/preview?cursor=` | Record normalizzati e classificati, solo al proprietario. |
| `POST /conversations/:id/imports/:importId/commit` | `expectedManifestHash`, `expectedConfigurationHash`; conferma solo l'anteprima corrente. |
| `DELETE /conversations/:id/imports/:importId` | Annulla staging prima del commit; dopo completamento restituisce `409`. |

Codici specifici: `IMPORT_ALREADY_COMPLETED`, `IMPORT_IN_PROGRESS`,
`UNSUPPORTED_EXPORT_FORMAT`, `UNRESOLVED_IMPORT_WARNING`, `STALE_PREVIEW`,
`ATTACHMENT_NOT_READY`, `INVALID_RECOVERY_CODE`, `INVITE_INVALID`,
`SYNC_RESET_REQUIRED` e `VERSION_CONFLICT`.
