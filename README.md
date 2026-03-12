# 🏫 [Eduard](https://gymolb.eduard.services/) - Modern School Management Platform 

**Eduard** ist eine ganzheitliche Open-Source-Plattform zur Digitalisierung von Schulprozessen. Diese Dokumentation führt Sie durch die Installation der Frontend-Applikation sowie die Anbindung an die Backend-Infrastruktur via Supabase.

---

## Systemvoraussetzungen

Bevor Sie mit der Installation beginnen, stellen Sie sicher, dass die folgenden Komponenten auf Ihrem System installiert sind:

### 1. Node.js & npm (Frontend-Runtime)
Das Frontend basiert auf Vite. Wir empfehlen die Nutzung der **LTS-Version** von Node.js.
* **Download:** [nodejs.org](https://nodejs.org/)
* **Verifizierung:**
    ```bash
    node -v  # Empfohlen: v18.x oder höher
    npm -v   # Empfohlen: v9.x oder höher
    ```

### 2. Docker (Container-Virtualisierung)
Docker wird benötigt, falls Sie das Backend (Supabase) inklusive Edge Functions sowie das Frontend lokal hosten möchten.
* **Windows/macOS:** Installieren Sie [Docker Desktop](https://www.docker.com/products/docker-desktop/).
* **Linux:** Folgen Sie der offiziellen [Docker Engine Installationsanleitung](https://docs.docker.com/engine/install/).

---

## Installation & Setup

### 1. Repository klonen
```bash
git clone [https://github.com/realrdbr/eduard.git](https://github.com/realrdbr/eduard.git)
cd eduard

```

### 2. Abhängigkeiten installieren

```bash
npm install --legacy-peer-deps

```

### 3. Umgebungsvariablen konfigurieren

Erstellen Sie im Hauptverzeichnis eine Datei namens `.env`. Diese Datei enthält die Zugangsdaten zu Ihrer Supabase-Instanz.

```env
# Supabase API URL - Die Basis-URL Ihrer Supabase-Instanz
VITE_SUPABASE_URL="[https://ihre-instanz.supabase.co](https://ihre-instanz.supabase.co)"

# Supabase Anon Key - Der öffentliche API-Key für den Client-Zugriff
VITE_SUPABASE_PUBLISHABLE_KEY="Ihr_Anon_Key_hier"

# KI Chat URL
VITE_AI_CHAT_URL="Ihre_Domain_hier"

```

### 4. Netzwerk- & Domainkonfiguration (`vite.config.js`)

Um die Plattform über eine spezifische Domain oder im Netzwerk erreichbar zu machen, passen Sie die `vite.config.js` an. Dies ist besonders wichtig für die TLS-Terminierung oder Proxies in Schulumgebungen.

```javascript
// vite.config.js
export default defineConfig({
  server: {
    host: 'eduard.ihre-schule.de', // Ihre gewünschte Domain
    port: 5173,
    strictPort: true
  }
})

```

---

## Backend-Infrastruktur (Self-Hosting)

Für maximale Datensouveränität kann der gesamte Backend-Stack lokal betrieben werden. Dies ist im schulischen Kontext aufgrund der DSGVO oft die bevorzugte Methode.

### Supabase Full Stack

Supabase bietet eine Docker-basierte Self-Hosting-Lösung an, die PostgreSQL, GoTrue (Auth), PostgREST und Realtime umfasst.

* [Anleitung: Supabase Self-Hosting via Docker](https://supabase.com/docs/guides/self-hosting/docker)

### Supabase Edge Functions

Edge Functions ermöglichen serverseitige Logik (z.B. VErtretungsplanerstellung, KI-Funktionen) in einer isolierten Runtime.

* [Anleitung: Edge Runtime lokal betreiben](https://www.google.com/search?q=https://supabase.com/docs/guides/functions/local-development)

---

## Entwicklung & Deployment

### Entwicklungsmodus starten

```bash
npm run dev

```

### Produktion-Build erstellen

Für den produktiven Einsatz in der Schule muss die Applikation optimiert werden:

```bash
cd eduard
docker compose up -d

```

Docker compeliert und startet das Projekt daraufhin automatisch.

---

## Sicherheitshinweis

Da es sich um eine Schul-Management-Plattform handelt, die sensible Schülerdaten verarbeitet:

* Stellen Sie sicher, dass die `.env` Datei **niemals** in das Git-Repository committet wird.
* Nutzen Sie für den produktiven Betrieb zwingend **HTTPS/TLS**.
* Halten Sie die Docker-Images Ihrer Supabase-Instanz regelmäßig auf dem neuesten Stand.
