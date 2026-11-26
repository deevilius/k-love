# K-Love 💗 – Meine K-Dramen

Windows-App zum Sammeln, Bewerten und Verfolgen von K-Dramen – mit OST-Player (YouTube/Spotify), Excel-Import/-Export, Postern und Statistiken.

## Installieren

1. Auf der Seite **Releases** dieses Repos die neueste `K-Love-Setup-x.y.z.exe` herunterladen und starten.
2. Windows zeigt beim ersten Mal evtl. „Der Computer wurde durch Windows geschützt“ (die App ist nicht kostenpflichtig signiert): **Weitere Informationen → Trotzdem ausführen**.
3. K-Love installiert sich ohne Admin-Rechte und legt eine Desktop-Verknüpfung an.

## Updates

Die App prüft beim Start und alle 4 Stunden, ob es eine neue Version gibt. Wenn ja, zeigt sie den **Changelog** und du entscheidest:

- **Jetzt aktualisieren** – lädt das Update, speichert dein Profil und startet neu
- **Morgen erinnern** / **In einer Woche**
- **Diese Version überspringen**

Ohne Zustimmung wird nichts geladen oder installiert. Unter Einstellungen → App findest du ein verfügbares Update jederzeit wieder.

## Deine Daten

Alle Dramen, Songs und Einstellungen stehen in **einer Profildatei**, die K-Love bei Änderungen automatisch aktualisiert:

| Datei | Inhalt |
|---|---|
| `Dokumente\K-Love\k-love-profil.json` | aktuelles Profil |
| `k-love-profil.vorher.json` | Stand davor |
| `k-love-profil.vor-wiederherstellung.json` | Stand vor der letzten Wiederherstellung |

Den Ordner kannst du in den Einstellungen ändern, z. B. auf OneDrive. Zum Sichern oder Umziehen einfach den Ordner kopieren – startet K-Love auf einem neuen Rechner ohne Daten, bietet es an, das Profil zu laden.

## Neue Version veröffentlichen

Releases entstehen **nur auf Knopfdruck**, nicht durch Pushes oder Tags.

1. In `CHANGELOG.md` unter **„Unveröffentlicht“** eintragen, was sich geändert hat (dieser Text erscheint in der App vor dem Update), committen und pushen.
2. Auf GitHub: **Actions → „Release (Windows)“ → „Run workflow“**, Versionssprung wählen (`patch`, `minor` oder `major`).

Die Action erhöht die Version, macht aus „Unveröffentlicht“ den Abschnitt der neuen Version, baut den Installer, committet und taggt `vX.Y.Z` und veröffentlicht das Release. Ist „Unveröffentlicht“ leer, bricht sie ab. Danach lokal `git pull`.

## Entwickeln

```powershell
npm install
```

```powershell
npm run dev
```

| Befehl | Was passiert |
|---|---|
| `npm run dev` | Vite-Dev-Server + Electron mit Hot-Reload |
| `npm start` | App bauen und starten wie installiert |
| `npm run dist` | Installer lokal bauen (`release/`), ohne Veröffentlichung |

Update-Dialog testen (ohne echtes Release):

```powershell
$env:KLOVE_FAKE_UPDATE = '1'; npm run dev
```

## Technik

Vite · React · TypeScript · Tailwind CSS 4 · Dexie (IndexedDB) · SheetJS · Recharts · Electron + electron-builder + electron-updater · GitHub Actions
