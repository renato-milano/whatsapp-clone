# Importazione dello storico WhatsApp

La migrazione P0 usa l'export testuale con i suoi allegati, come quello
presente nella cartella locale `WhatsApp Chat Export/`. Non è un lettore dei
backup cifrati di WhatsApp, di database `.crypt*`, di iCloud o di Google Drive.
Non può recuperare contenuti che non si trovano nell'export.

## Evidenze sul campione

L'analisi locale del 16 settembre 2026 ha contato intestazioni, righe e
riferimenti ai file senza modificare i sorgenti. Gli autori sono riportati
con etichette anonime. Il conteggio dei record include eventi di sistema e
segnaposto: non equivale al numero dei soli messaggi testuali.

| Elemento | Risultato osservato |
| --- | --- |
| File totali | 356: `_chat.txt` e 355 allegati. |
| Dimensione totale | 39.721.351 byte, circa 37,88 MiB. |
| Testo | 84.543 byte; 1.221 segmenti ottenuti separando i fine riga, incluso l'eventuale segmento finale vuoto. |
| Record riconosciuti | 1.212 intestazioni nel formato osservato. |
| Autori | Due; 703 record attribuiti al primo e 509 al secondo, compresi eventi attribuiti nell'export. |
| Estremi nel file | Dal 19 giugno 2024 al 15 settembre 2026. |
| Vocali | 144 file `.opus`. |
| Foto | 45 file `.jpg`. |
| Sticker | 165 file `.webp`. |
| Video | 1 file `.mp4`. |
| Riferimenti allegati | 355 distinti; nessuno mancante e nessun media non referenziato. |
| Media omessi | 21 record contengono `immagine omessa`; 1 contiene `video omesso`. Alcuni includono una didascalia. |
| Multilinea | 6 record con più righe non vuote nel corpo. |
| Unicode | 379 righe iniziano con un marcatore di direzione invisibile. |
| Ordine temporale | 4 passaggi con timestamp precedente al record prima; 6 coppie adiacenti con lo stesso timestamp. |
| Eventi riconoscibili | 2 avvisi di cifratura e 1 cambio numero. |
| Modifiche | 5 corpi contengono la parola `modificato`: candidati da classificare con il marcatore esatto, non prova sufficiente da soli. |

I numeri nei nomi dei file non definiscono la cardinalità della conversazione:
non generare record mancanti per colmare salti di numerazione. Il censimento
non verifica la decodifica di ogni media: playback e integrità dei formati
sono controlli da svolgere nella fase tecnica di importazione.

## Formato supportato

La prima implementazione supporta il formato effettivamente osservato:
intestazione tra parentesi quadre, giorno/mese/anno a due cifre, ora con
secondi, autore e corpo. Gli esempi seguenti sono sintetici.

```text
[15/09/26, 10:20:00] Persona A: Ciao!
[15/09/26, 10:21:00] Persona B: Prima riga
Seconda riga dello stesso messaggio
‎[15/09/26, 10:22:00] Persona A: ‎<allegato: 00000004-AUDIO-2026-09-15-10-22-01.opus>
```

La firma iniziale di riconoscimento, dopo la sola rimozione del BOM e dei
marcatori direzionali iniziali per l'analisi, è:

```regex
^\[(\d{2})/(\d{2})/(\d{2}), (\d{2}):(\d{2}):(\d{2})\] (.*)$
```

La firma non basta a validare una data: verificare giorno, mese, anno, ora e
conversione nel fuso scelto. Interpretare gli anni `00`–`99` come 2000–2099
in questo profilo, esplicitandolo nell'anteprima. Formati Android, altre
lingue, anno a quattro cifre o orari AM/PM sono profili futuri; rilevarli e
segnalare formato non supportato, senza importazione silenziosamente errata.

## Pipeline proposta

L'utente carica uno ZIP che contiene `_chat.txt` e i file allegati, anche
raccolti sotto una sola directory radice. Per il campione locale potrà creare
lo ZIP in seguito; questa attività non modifica o ricomprime ora l'export.
Non rendere obbligatoria la selezione di cartelle dal browser mobile.

1. **Caricamento**: autenticare il proprietario, verificare i limiti e creare
   staging privato con ID del job e hash del pacchetto.
2. **Inventario**: verificare percorsi e contenuti, trovare un solo testo
   sorgente e costruire il manifest dei file con hash SHA-256.
3. **Parsing**: decodificare UTF-8, riconoscere record multilinea, autori,
   eventi e riferimenti agli allegati. Conservare ordine e numero record.
4. **Configurazione**: richiedere fuso IANA e mapping esplicito dei due autori
   ai due membri già entrati nella nuova chat.
5. **Anteprima**: mostrare conteggi, prime/ultime righe, esempi media, eventi,
   contenuti omessi e anomalie. Permettere consultazione paginata dell'intero
   risultato e correzione di segmentazione nei casi ambigui.
6. **Preparazione**: validare e copiare i media con nomi interni immutabili;
   produrre derivati o dichiarare gli errori di conversione.
7. **Conferma**: il proprietario conferma l'anteprima identificata da hash di
   manifest e configurazione; una modifica precedente la rende obsoleta.
8. **Commit**: inserire in un'unica transazione messaggi, mapping, riferimenti,
   stato completato ed evento `import.completed`.
9. **Verifica**: confrontare conteggi e checksum, rendere disponibile il
   report e pulire staging secondo retention.

Stati del job: `uploaded → analyzing → needs_review → preparing → ready →
committing → completed`, con `failed` e `cancelled` espliciti. Solo `ready`
può entrare in commit. Le configurazioni modificate tornano a `needs_review`.
I job persistono e recuperano la lease scaduta dopo un riavvio.

## Parsing senza perdita di contenuto

Separare riconoscimento della struttura e normalizzazione del testo. Non
cancellare indiscriminatamente Unicode o marcatori presenti nel corpo.

- Supportare CRLF, LF e CR e un BOM iniziale. Conservare il testo originale
  in staging privato finché dura la verifica.
- Una riga che non è un'intestazione prosegue il record precedente, comprese
  righe vuote. Un contenuto prima della prima intestazione è un'anomalia,
  non testo da scartare.
- Il separatore autore/corpo può essere ambiguo se il nome contiene `:`.
  Usare l'elenco autori confermato e la corrispondenza più lunga; se non è
  univoca richiedere revisione. Non dividere ogni riga su tutti i due punti.
- Una riga nel corpo può imitare un'intestazione valida: il testo esportato
  non risolve sempre l'ambiguità. Presentare i candidati sospetti e consentire
  la scelta unisci/dividi in anteprima, senza dichiarare parsing infallibile.
- Identificare gli allegati dal marcatore completo `<allegato: ...>`, senza
  inferirli da parole comuni nel messaggio. Il filename sorgente serve per
  il collegamento, non come percorso di destinazione.
- Classificare gli eventi di sistema con pattern precisi del profilo. Un
  avviso storico sulla E2EE descrive WhatsApp: non deve sembrare una promessa
  di cifratura della nuova applicazione.
- I marcatori esatti di modifica aggiungono `sourceEdited=true`; la versione
  precedente non è recuperabile. Se il pattern non è riconosciuto, conservare
  il testo senza inventare metadata.
- Le stringhe di media omesso generano `missing_media`, conservando la parte
  di didascalia. Se il testo potrebbe essere una frase scritta dall'utente,
  segnalarlo nell'anteprima e consentire classificazione come semplice testo.

## Date, autori e storico preesistente

L'export non specifica un offset UTC. Proporre `Europe/Rome` soltanto come
default modificabile; la posizione attuale dell'utente non prova il fuso
originale della conversazione. Conservare stringa sorgente, fuso scelto e
stato di conversione.

Gli orari inesistenti o doppi nei cambi di ora legale richiedono una
risoluzione esplicita o la conservazione come ora locale non risolta,
segnalata nell'UI; non inventare un istante UTC. In quel caso `sent_at` è
nullable e l'UI usa `raw_timestamp` con indicazione del fuso non risolto.

Il mapping autore→membro è obbligatorio, anche quando i nomi coincidono.
Mostrare l'anteprima dal punto di vista del proprietario, così da verificare
che le bolle in uscita siano attribuite correttamente. I due membri devono
esistere prima del commit. Nessun membro storico viene creato automaticamente
con un nome letto dal file.

Lo storico viene anteposto alla chat nativa usando la sequenza negativa
descritta nel [modello dati](05-dati-api.md). Si può importare anche dopo i
primi messaggi nativi senza sovrascriverli. Avvisare se l'intervallo importato
si sovrappone temporalmente a quello nativo; non deduplicare automaticamente
testi identici appartenenti a origini diverse.

## Idempotenza, atomicità e ripristino

Un'importazione una tantum deve essere ripetibile dopo un errore senza
duplicazioni. Hash del solo ZIP non basta perché lo stesso contenuto può
essere ricompresso in modo diverso.

- `source_hash`: SHA-256 dei byte del testo originale; `manifest_hash`:
  hash del manifest ordinato di percorsi normalizzati e hash dei file.
- Fingerprint record: hash del testo sorgente, ordinale e record originale.
  Due messaggi legittimamente identici in posizioni diverse rimangono distinti.
- Un job completato blocca qualunque secondo commit nella stanza, anche con
  un archivio differente. Il riutilizzo dello stesso pacchetto restituisce
  il report esistente. Un job fallito può ripartire dagli step verificati.
- Prima del commit, i file sono già presenti in area definitiva privata ma
  non sono accessibili senza riferimenti nel database. La transazione li
  rende visibili insieme ai messaggi; nessuno vede mezzo storico.
- Un crash prima del commit lascia solo file orfani, da recuperare o pulire.
  Un crash dopo il commit riprende dal job completato e non reinserisce righe.
- La pulizia degli orfani non cancella file di job con lease attiva o di
  batch in fase di commit.

Prima del commit eseguire un backup coerente dello stato preesistente. Un
rollback post-import è una procedura del gestore che elimina solo il batch,
aggiorna FTS ed eventi e preserva i messaggi nativi. Se messaggi successivi
citano lo storico, mantenere tombstone per i riferimenti. Non usare come
rollback ordinario il ripristino dell'intero backup, che perderebbe i nuovi
messaggi arrivati dopo la migrazione.

## Sicurezza e report finale

Un archivio è input non fidato anche nell'utilizzo personale. Rifiutare
percorsi assoluti, `..`, symlink, file duplicati dopo normalizzazione,
archivi annidati e superamento dei limiti di espansione. File di sistema
come `__MACOSX` possono essere ignorati con conteggio nel report. Non eseguire
mai file caricati e non estrarre direttamente nella directory dei media.

Il report deve includere record letti, importati e non importati, autori
associati, conteggi per tipo, allegati presenti/assenti/orfani, conversioni
fallite, timestamp ambigui, hash del manifest e versione parser. Ogni record
deve risultare importato o esplicitamente elencato come anomalia: niente
scarti silenziosi. Nel campione il risultato atteso è 1.212 record conservati,
355 collegamenti a file risolti e 22 segnaposto di media omesso.

Cancella ZIP, testo grezzo e staging dopo 7 giorni dal completamento o
annullamento, conservando soltanto metadata minimi e report privo di corpi
dei messaggi. L'export originale dell'utente resta intatto e separato.
