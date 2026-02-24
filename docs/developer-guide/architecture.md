# Architecture Overview

Mwingi School ERP follows a modular architecture using **Electron**, **React**, and **SQLite**.

## High-Level Diagram

```mermaid
graph TD
    Renderer[React Frontend] <-->|IPC / ContextBridge| Main[Electron Main Process]
    Main <-->|Better-SQLite3| DB[(SQLite Database)]
    Main -->|Services| Logic[Business Logic Layer]
    Logic -->|Repositories| Data[Data Access Layer]
```

## Key Technology Stack

- **Runtime**: Electron (Chromium + Node.js)
- **Frontend**: React, TypeScript, Tailwind CSS
- **State Management**: Zustand
- **Database**: SQLite (via `better-sqlite3-multiple-ciphers`, with `better-sqlite3` fallback in development)
- **Build Tool**: Vite

## Project Structure

```
root/
├── electron/
│   ├── main/           # Main process code
│   │   ├── services/   # Business logic (PaymentService, etc.)
│   │   ├── ipc/        # IPC Handlers definition
│   │   └── database/   # Schema migrations & helpers
│   └── preload/        # Context Bridge exposure
├── src/                # React Frontend
│   ├── components/     # Reusable UI components
│   ├── pages/          # Application views
│   └── stores/         # Zustand state stores
├── docs/               # Project documentation
└── tests/              # E2E & Unit tests
```

## Service Layer Pattern

We use a Service-Repository pattern to decouple business logic from the database and UI.

1. **Services**: Handle validation, complex calculations, and multiple repository calls (transactional boundaries).
2. **Repositories** (Optional): Direct database queries. In simple cases, Services facilitate direct DB access.
3. **IPC Handlers**: Controllers that map IPC events to Service methods.

## Security

- **Context Isolation**: Enabled (`contextIsolation: true`)
- **Node Integration**: Disabled in Renderer (`nodeIntegration: false`)
- **Renderer Plugins**: Disabled (`plugins: false`)
- **Content Security Policy**: Applied at runtime in main process via `session.defaultSession.webRequest.onHeadersReceived` (`electron/main/index.ts`).
