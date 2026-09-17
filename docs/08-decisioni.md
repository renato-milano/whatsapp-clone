# Decisioni e questioni aperte

Questo registro separa i requisiti confermati dall'utente dalle scelte
tecniche proposte. Aggiornalo quando una scelta viene accettata o cambiata,
indicando la conseguenza sui documenti collegati. La baseline è del
16 settembre 2026 e non rappresenta un'implementazione già approvata in ogni
dettaglio.

## Requisiti confermati

Le risposte dell'utente hanno risolto il perimetro principale.

| ID  | Decisione                                                                       | Conseguenza                                                                                                           |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D01 | Chat privata fra due persone.                                                   | Due membri attivi per stanza; gruppi esclusi.                                                                         |
| D02 | Web su mobile e computer.                                                       | Layout responsive; nessuna app nativa richiesta.                                                                      |
| D03 | Nome al primo ingresso e ritorno dallo stesso link.                             | Identità persistente nel browser e recupero per dispositivi nuovi.                                                    |
| D04 | Utilizzo personale, senza pubblicazione al pubblico.                            | Nessun onboarding pubblico, dimensionamento ridotto e creazione riservata.                                            |
| D05 | Nessuna necessità di E2EE.                                                      | Server fidato; HTTPS e autorizzazione restano necessari.                                                              |
| D06 | Funzioni principali e aspetto simile a WhatsApp.                                | Testo, media, vocali e UX familiare; dettaglio funzioni P0 proposto nei requisiti.                                    |
| D07 | Documentazione prima dello sviluppo.                                            | Specifiche completate; sviluppo locale avviato senza pubblicazione.                                                   |
| D08 | Importazione una tantum desiderata, export fornito.                             | Inclusa nel piano P0; supporto iniziale del formato osservato.                                                        |

## Decisioni tecniche confermate

| ID  | Decisione                                                                       | Conseguenza                                                                                                           |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| A02 | Railway, con preferenza per minore manutenzione e budget obiettivo 5–10 €/mese. | Account esistente e CLI autenticata; nessun progetto collegato alla cartella. Configurazione e consumi da verificare. |
| A01 | React/Vite/TypeScript, Node/Fastify, Socket.IO, SQLite e disco privato.         | Stack confermato con l'avvio dello sviluppo locale; un unico servizio Railway previsto.                               |

## Scelte proposte

Queste decisioni hanno una baseline operativa per rendere il progetto
sviluppabile, ma non vanno presentate come richieste esplicite dell'utente.

| ID  | Proposta                                                   | Alternativa e criterio                                                                  |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A03 | Invito che chiude i nuovi ingressi dopo il secondo nome distinto; stesso nome = nuovo dispositivo. | Approvazione manuale se il rischio di link condiviso è inaccettabile. |
| A04 | Cookie persistente e codice personale di recupero.         | Passkey o account classico aumentano setup e cambiano il flusso richiesto.              |
| A05 | PWA opzionale e push dove supportato.                      | Solo browser e avvisi mentre aperto se le notifiche non sono necessarie.                |
| A06 | Import ZIP con wizard riservato al proprietario.           | Script locale assistito, se l'utente preferisce una migrazione unica senza UI dedicata. |
| A07 | Più stanze private per installazione, due membri ciascuna. | Un'unica stanza configurata riduce l'area di gestione.                                  |
| A08 | Modifica 15 minuti, elimina per entrambi 24 ore.           | Finestre diverse, da cambiare prima dei test di accettazione.                           |
| A09 | RPO 24 ore, RTO 2 ore, backup esterno cifrato.             | Frequenza maggiore se perdere una giornata è inaccettabile.                             |
| A10 | Fedeltà visiva da screenshot con icona e nome propri.      | Ricostruzione dai pattern descritti se gli screenshot non arrivano.                     |

## Questioni da chiudere prima dell'implementazione pertinente

Questi punti non impediscono di completare il dossier. Servono a scegliere
prove, infrastruttura e dettagli di prodotto senza introdurre supposizioni
non verificate.

| Questione                                                              | Default documentato                                                                                             | Quando risolverla                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Quali sistemi e browser useranno le due persone?                       | Mobile e computer; OS non specificati.                                                                          | Prima della prova codec e push in fase 0.                                     |
| Quale progetto Railway e quale dominio usare?                          | Provider Railway scelto; dominio fornito dalla piattaforma proposto per iniziare. Piano account non verificato. | Prima del deployment e delle prove HTTPS reali.                               |
| Il servizio sarà raggiungibile da Internet o solo da VPN/rete privata? | HTTPS con accessi riservati; topologia ancora aperta.                                                           | Prima della configurazione rete; "personale" non implica automaticamente LAN. |
| Chi gestirà backup, dominio e aggiornamenti?                           | Gestore coincidente con il proprietario iniziale.                                                               | Prima del rilascio personale.                                                 |
| Il recupero tramite codice è accettabile?                              | Codice personale e recupero amministrativo di emergenza.                                                        | Prima della fase 1.                                                           |
| Quale versione/aspetto WhatsApp usare come riferimento?                | Specifiche visive iniziali del dossier.                                                                         | Prima del collaudo della fase 3.                                              |
| Le notifiche a browser chiuso sono necessarie?                         | Incluse dove supportate, PWA facoltativa per chattare.                                                          | Prima della fase 6; chiarire eventuale installazione su iPhone.               |
| Qual è il fuso originale dell'export?                                  | Proposta Europe/Rome da confermare in anteprima.                                                                | Prima del commit dell'importazione.                                           |
| Quale autore storico corrisponde a ciascun membro?                     | Nessuna associazione automatica dal nome.                                                                       | Nel wizard, prima del commit.                                                 |

## Rischi e contromisure

I rischi principali riguardano continuità d'uso e conservazione dello storico,
più che la scalabilità. Le contromisure devono essere dimostrate nel collaudo.

| Rischio                            | Effetto                                           | Contromisura                                                           |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Cookie cancellato o nuovo browser  | Identità non riconosciuta.                        | Codice personale e procedura gestore documentati.                      |
| Link ricevuto da persona sbagliata | Occupazione del secondo posto o riconoscimento per nome. | Condivisione privata, nomi coerenti, revoca e rotazione. |
| Server o disco guasto              | Chat indisponibile o perdita dati.                | Backup esterno, allarmi e prova di ripristino.                         |
| Audio incompatibile                | Vocali inutilizzabili su un dispositivo.          | Prova iniziale e derivati, con originale conservato.                   |
| Browser sospeso in background      | Realtime interrotto e notifiche variabili.        | Sincronizzazione al ritorno e push opzionale.                          |
| Parser troppo permissivo           | Autori, date o confini messaggio errati.          | Profilo esplicito, anteprima e nessuno scarto silenzioso.              |
| Dati personali nel repository      | Diffusione dello storico.                         | Esclusioni prima del primo commit e fixture sintetiche.                |
| Aspetto "uguale" senza riferimento | Revisione estetica soggettiva.                    | Screenshot e confronto a viewport uguale.                              |
| Cancellazione solo nell'UI         | Testo ancora presente in cache, ricerca o eventi. | Tombstone, invalidazione e pulizia coordinata.                         |

## Prossimi passi

Per il prossimo incremento, rivedi A03 e A04, identifica i browser reali e
inizia le prove della fase 0. L'assenza di screenshot non blocca accessi,
persistenza o parser; ne limita soltanto la verifica di fedeltà visiva.
