# Media Downloader

Lokale Web-App zum Herunterladen von Audio und Video:

| Quelle     | Formate                                  | Tool im Hintergrund |
|------------|------------------------------------------|---------------------|
| YouTube    | MP3 (Audio) oder MP4 (Best/2160p…360p)   | `yt-dlp` + `ffmpeg` |
| SoundCloud | MP3                                      | `yt-dlp` + `ffmpeg` |
| Spotify    | MP3 (Tracks, Alben, Playlists)           | `spotdl` + `ffmpeg` |

Bei Spotify wird nichts direkt von Spotify geladen, weil die Streams dort DRM-geschützt sind. `spotdl` liest stattdessen nur die Metadaten (Titel, Interpret, Cover). Damit sucht es die passende Audiospur auf YouTube Music und speichert sie als getaggte MP3.

Alle Dateien landen in `Downloader/downloads/`.

> **Hinweis:** Lade nur Inhalte herunter, an denen du die Rechte hast oder die ausdrücklich zum Download freigegeben sind (z. B. eigene Uploads, Creative-Commons-Material). Die Nutzungsbedingungen von YouTube, SoundCloud und Spotify verbieten das Herunterladen in vielen Fällen.

---

## 1. Voraussetzungen installieren

Du brauchst **Node.js ≥ 18**, **Python ≥ 3.9** (für spotdl) sowie `yt-dlp`, `ffmpeg` und `spotdl`.

### Windows (PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
pip install spotdl
```

Danach das Terminal **neu öffnen**, damit der PATH aktualisiert wird.

### macOS (Homebrew)

```bash
brew install node python yt-dlp ffmpeg pipx
pipx ensurepath
pipx install spotdl
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg python3 pipx
pipx ensurepath
pipx install yt-dlp     # die apt-Version von yt-dlp ist oft veraltet
pipx install spotdl
```

### Installation prüfen

```bash
node -v
yt-dlp --version
ffmpeg -version
spotdl --version
```

Falls `ffmpeg` fehlt, kann spotdl es auch selbst herunterladen: `spotdl --download-ffmpeg`.

---

## 2. Server starten

```bash
cd Downloader
npm install
node server.js        # oder: npm start
```

Dann im Browser öffnen: **http://localhost:4000**

Beenden mit `Strg + C`.

---

## 3. Bedienung

1. URL einfügen. Die Plattform wird automatisch erkannt.
2. Format wählen: **MP3** oder **MP4**. MP4 gibt es nur bei YouTube.
3. Bei MP4 die Qualität wählen. Ist sie nicht verfügbar, nimmt die App die nächstbeste Stufe darunter.
4. Wenn du eine YouTube- oder SoundCloud-Playlist ganz laden willst, „Ganze Playlist laden“ anhaken. Bei Spotify werden Playlists und Alben immer komplett geladen.
5. Auf **Download** klicken. Fortschrittsbalken und Log werden live per Server-Sent Events aktualisiert.
6. Fertige Dateien erscheinen unten in der Liste. Dort kannst du sie herunterladen oder löschen.

---

## 4. Konfiguration (optional)

Einstellungen werden über Umgebungsvariablen gesetzt, z. B. `PORT=5000 node server.js`. Unter Windows geht das mit `set PORT=5000 && node server.js`.

| Variable                | Standard               | Bedeutung                                              |
|-------------------------|------------------------|--------------------------------------------------------|
| `PORT`                  | `4000`                 | Port des Webservers                                    |
| `HOST`                  | `127.0.0.1`            | `0.0.0.0` macht die App im ganzen Heimnetz erreichbar  |
| `DOWNLOAD_DIR`          | `./downloads`          | Zielordner                                             |
| `MAX_CONCURRENT`        | `2`                    | Wie viele Downloads gleichzeitig laufen                |
| `YTDLP_PATH`            | `yt-dlp`               | Pfad zu yt-dlp, falls nicht im PATH                    |
| `SPOTDL_PATH`           | `spotdl`               | Pfad zu spotdl, falls nicht im PATH                    |
| `FFMPEG_PATH`           | –                      | Pfad zur ffmpeg-Binary, falls nicht im PATH            |
| `SPOTIFY_CLIENT_ID`     | –                      | Eigene Spotify-API-Zugangsdaten für spotdl (siehe unten) |
| `SPOTIFY_CLIENT_SECRET` | –                      |                                                        |

---

## 5. Fehlerbehebung

- **„… wurde nicht gefunden“:** Das Tool ist nicht im PATH. Terminal neu öffnen oder den Pfad über `YTDLP_PATH`, `SPOTDL_PATH` oder `FFMPEG_PATH` setzen.
- **YouTube meldet `HTTP Error 403` oder „Sign in to confirm you're not a bot“:** yt-dlp aktualisieren, das behebt die meisten YouTube-Fehler.
  - winget: `winget upgrade yt-dlp.yt-dlp`
  - Homebrew: `brew upgrade yt-dlp`
  - pipx: `pipx upgrade yt-dlp`
- **Spotify meldet `rate limit` oder einen Fehler mit dem Client:** Lege unter https://developer.spotify.com/dashboard eine eigene App an. Trage dann deren Client-ID und Client-Secret in `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` ein. Außerdem `pipx upgrade spotdl` ausführen.
- **MP4 mit 1440p/4K lässt sich nicht abspielen:** YouTube liefert diese Auflösungen nur als VP9/AV1. Ältere Player (z. B. QuickTime) unterstützen das nicht. Dann 1080p wählen oder VLC verwenden.
