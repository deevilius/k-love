# K-Love 💗 – Meine K-Dramen

Kleine App zum Sammeln, Bewerten und Verfolgen von K-Dramen – mit OST-Player (YouTube/Spotify), Excel-Import/-Export, Postern und Statistiken. Läuft als **Windows-App mit Auto-Update** oder im Browser.

## Installieren (Windows)

1. Auf der Seite **Releases** dieses Repos die neueste `K-Love-Setup-x.y.z.exe` herunterladen und starten.
2. Windows zeigt beim ersten Mal evtl. „Der Computer wurde durch Windows geschützt“ (die App ist nicht kostenpflichtig signiert): **Weitere Informationen → Trotzdem ausführen**.
3. K-Love installiert sich ohne Admin-Rechte und legt eine Desktop-Verknüpfung an.

**Updates kommen automatisch:** Die App prüft beim Start (und alle 4 Stunden) auf eine neue Version, lädt sie im Hintergrund und fragt, ob sie neu starten soll. Manuell: Einstellungen → „Nach Updates suchen“.

Die Daten liegen nur lokal unter `%APPDATA%\K-Love` und bleiben bei Updates erhalten. Trotzdem ab und zu **Einstellungen → Sicherung herunterladen**.

### Daten aus der Browser-Version übernehmen

Im Browser: Einstellungen → Sicherung herunterladen. In der App: Einstellungen → Sicherung wiederherstellen.

## Neue Version veröffentlichen

```powershell
npm version patch
```

```powershell
git push --follow-tags
```

GitHub Actions baut daraufhin die `.exe` und veröffentlicht sie als Release – die installierten Apps aktualisieren sich von selbst. (`minor` statt `patch` für größere Änderungen.)

## Entwickeln

```powershell
npm install
```

```powershell
npm run dev
```

Web-Version unter <http://localhost:5173>. Weitere Befehle:

| Befehl | Was passiert |
|---|---|
| `npm run electron` | Desktop-App lokal bauen und starten |
| `npm run dist` | Installer lokal bauen (`release/`), ohne Veröffentlichung |
| `npm run build` | Web-Version (PWA) nach `dist/` |

## Technik

Vite · React · TypeScript · Tailwind CSS 4 · Dexie (IndexedDB) · SheetJS · Recharts · Electron + electron-builder + electron-updater · GitHub Actions
