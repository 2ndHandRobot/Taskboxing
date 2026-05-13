# Taskboxing

Smart task scheduling and completion tracking for Google Tasks & Calendar, delivered as a Chrome extension.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A Google account
- A Google Cloud project with the OAuth consent screen configured and the following APIs enabled:
  - Google Tasks API
  - Google Calendar API

## Setup

### 1. Create OAuth credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and open (or create) a project.
2. Navigate to **APIs & Services → Credentials**.
3. Click **Create Credentials → OAuth client ID**.
4. Choose **Chrome Extension** as the application type.
5. Copy the generated **Client ID**.

### 2. Configure environment

Create a `.env` file in the project root:

```
OAUTH_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

### 3. Install dependencies and build

```bash
npm install
npm run build
```

The built extension will be output to the `dist/` folder.

### 4. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist/` folder inside this project.

The Taskboxing icon will appear in your toolbar. Click it or open the side panel to get started.

## Development

```bash
npm run dev
```

This starts the Vite dev server with HMR. The crxjs plugin hot-reloads the extension in Chrome — load the `dist/` folder as an unpacked extension once, and changes will reflect automatically.

## Project structure

```
src/
  background/      # Service worker (alarms, auth token refresh)
  components/      # React UI components
  popup/           # Extension toolbar popup
  sidepanel/       # Main side panel UI
  services/        # Google Tasks & Calendar API clients
  stores/          # Zustand state
manifest.template.json  # Manifest source — OAuth client ID injected at build time
```
