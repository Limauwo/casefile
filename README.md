# CASEFILE

**CASEFILE** is an investigation-themed personal to-do list and productivity dashboard. Inspired by detective investigations, intelligence agency terminals, and classified documents, it transforms your daily tasks into an immersive case management system.

## Features

*   **Command Center**: A sleek, intelligence-terminal-styled dashboard providing a high-level overview of active cases, metrics, and recent system activity.
*   **Core Task Management**: Create, edit, and organize cases with priorities (Low, Medium, High, Critical) and statuses (Open, In Progress, Closed). Cases automatically receive a unique identifier (e.g., `CASE-042`).
*   **Case Dossiers**: Dedicated detail pages for each case, showing metadata, an isolated activity log, and case-specific evidence notes.
*   **Evidence Board**: A dedicated visual matrix for each case, with case-specific notes, draggable evidence routes, and support for multiple parent evidence items.
*   **System Activity Log**: Automatically tracks and audits all creations, modifications, and deletions within the system securely.
*   **Persistent Storage**: Operates entirely locally in your browser. All cases, notes, and activity logs are persisted via `localStorage` so data remains even after refreshes.
*   **Investigation Search**: Contextual search functionality capable of securely scanning through case files and notes simultaneously.

## Tech Stack

*   **Framework**: [SvelteKit](https://kit.svelte.dev/)
*   **Language**: Svelte 4 / TypeScript
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Icons**: [Lucide Svelte](https://lucide.dev/icons/)
*   **Data Persistence**: Browser `localStorage` (No backend database required)

---

## Setup Instructions (From 0 to Final)

Follow these steps to initialize and run the CASEFILE terminal on your local machine.

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher recommended)
*   npm (comes with Node.js)

### 1. Installation

Navigate into the project directory and install the necessary dependencies:

```bash
npm install
```
*(Note: This step is critical as it generates the `.svelte-kit` directory, which resolves all internal framework aliases like `$lib` and `$app` for TypeScript).*

### 2. Running the Development Server

Start the local SvelteKit Vite development server:

```bash
npm run dev
```

*   Open your browser and navigate to the local host address provided (typically `http://localhost:5173`).
*   The application operates strictly as a Single Page Application (SPA) with Server-Side Rendering (SSR) disabled to perfectly handle local browser storage without hydration errors.

### 3. Type Checking & Quality Assurance

To manually run the TypeScript compiler checks and verify that the codebase is structurally sound:

```bash
npm run check
```

### 4. Building for Production

To create an optimized, minified production build of the terminal:

```bash
npm run build
```

You can preview the built production app by running:
```bash
npm run preview
```

---

## Project Architecture

Here is an overview of the key systems powering CASEFILE:

*   **`src/lib/store.ts`**: The central nervous system. Uses Svelte's reactive `writable` stores to manage the state of `cases`, `activities`, and `notes`. It automatically logs activities and triggers storage saves.
*   **`src/lib/storage.ts`**: A robust abstraction over the browser's `localStorage` API. Safely handles reading, writing, and parsing the JSON data while preventing malformed legacy data from crashing the terminal.
*   **`src/routes/+layout.svelte`**: The persistent shell. Contains the sidebar navigation, global search, and handles the `isInitialized` bootstrap sequence.
*   **`src/routes/+layout.ts`**: Contains `export const ssr = false;` to guarantee safe browser-only API usage.
*   **`src/routes/+page.svelte`**: The root dashboard (Command Center).
*   **`src/routes/investigations/open/+page.svelte`**: Dedicated list of open investigations.
*   **`src/routes/case/[id]/+page.svelte`**: The dynamic routing endpoint for individual Case Dossiers.
*   **`src/routes/evidence-board/+page.svelte`**: The case selector for dedicated evidence boards.
*   **`src/routes/evidence-board/[id]/+page.svelte`**: The case-specific matrix interface for pinned investigation notes.

## System Purge

To permanently delete all local cases, notes, and activity history and leave the system empty, click on **System Settings** in the bottom left of the navigation sidebar and execute a System Purge. **This cannot be undone.**
