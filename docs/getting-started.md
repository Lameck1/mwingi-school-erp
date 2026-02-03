# Getting Started

## Prerequisites

- Node.js 18+
- NPM 9+
- Windows, macOS, or Linux

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Lameck1/mwingi-school-erp.git
   cd mwingi-school-erp
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Database Setup**
   The application uses SQLite. The database will be automatically created and seeded on the first run in the `userData` directory.

## Running Development Server

```bash
npm run dev
```

This will start:

- Vite Dev Server (Frontend)
- Electron Main Process
- TypeScript Compilation

## Building for Production

To build the executable installer:

```bash
npm run electron:build
```

The output files (Installer.exe, etc.) will be in the `dist` folder.

## Initial Login

- **Username**: `admin`
- **Password**: `admin123`

> **Security Warning**: Please change the default admin password immediately after logging in from the Settings > User Management menu.
