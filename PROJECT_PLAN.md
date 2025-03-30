# ContextCraft Project Plan

This document outlines the plan for building ContextCraft, an open-source, cross-platform desktop application using Electron and React for analyzing local code repositories and interacting with Large Language Models (LLMs).

## 1. Architecture Overview

The application will follow Electron's standard multi-process architecture:

*   **Main Process (`electron/main.ts`):** Runs Node.js. Handles application lifecycle, window creation, native OS interactions (file dialogs, secure key storage), background tasks (directory analysis, LLM API calls), and manages communication with the Renderer process.
*   **Preload Script (`electron/preload.ts`):** A bridge script running in a privileged context attached to the Renderer process. It selectively exposes specific Main process functionalities (via IPC channels) to the Renderer process using `contextBridge` for security.
*   **Renderer Process (`src/`):** Runs the React application (UI). It's essentially a Chromium browser window environment. It handles user interactions, displays data, and communicates with the Main process via the APIs exposed by the Preload script.

### Interaction Flow Diagram

```mermaid
graph LR
    A[React UI (Renderer)] -- IPC Invoke (e.g., openDialog) --> B(Preload Script);
    B -- contextBridge exposes 'api' --> A;
    B -- ipcRenderer.invoke --> C{Main Process};
    C -- ipcMain.handle --> B;
    C -- Secure Storage (node-keytar) --> D[(OS Keychain)];
    C -- File System (fs.promises) --> E[(Local Files)];
    C -- Network (axios/fetch) --> F([LLM API]);
    C -- webContents.send (e.g., updateContext) --> B;
    B -- ipcRenderer.on --> A;

    subgraph Electron App
        C
        B
        A
    end

    subgraph System/External
        D
        E
        F
    end
```

## 2. Recommended Project Structure

```
/ContextCraft
├── electron/                  # Electron Main process & related files
│   ├── main.ts                # Main process entry point
│   └── preload.ts             # Preload script
├── public/                    # Static assets served by the dev server/packaged
│   └── index.html             # HTML template
├── src/                       # React Renderer process source code
│   ├── App.tsx                # Root React component
│   ├── main.tsx               # React entry point (renders App)
│   ├── components/            # Reusable React UI components
│   │   ├── SettingsView.tsx
│   │   ├── ContextDisplay.tsx
│   │   ├── PromptInput.tsx
│   │   ├── ResponseDisplay.tsx
│   │   └── ...
│   ├── contexts/              # React Contexts (e.g., ThemeContext)
│   ├── hooks/                 # Custom React Hooks
│   ├── services/              # API interaction logic (if complex)
│   ├── styles/                # Global styles, themes
│   ├── types/                 # TypeScript type definitions
│   │   └── electron.d.ts      # Type definitions for preload API
│   └── utils/                 # Utility functions
├── .env.example               # Example environment variables
├── .gitignore
├── LICENSE                    # Your open-source license (e.g., MIT)
├── package.json               # Project dependencies and scripts
├── PROJECT_PLAN.md            # This file
├── README.md                  # Project documentation
└── tsconfig.json              # TypeScript config for Renderer
└── tsconfig.node.json         # TypeScript config for Main/Preload
└── vite.config.ts             # Or webpack.config.js - Build tool config
```

## 3. Core Implementation Steps & Snippets

*(Note: These are conceptual snippets and will need refinement during implementation.)*

### A. Setting up Electron + React
*   Use Vite with `vite-plugin-electron` and `vite-plugin-electron-renderer` or a boilerplate like `electron-react-boilerplate`.
*   Install core dependencies: `electron`, `react`, `react-dom`, `typescript`, `@types/react`, `@types/react-dom`.

### B. IPC Setup (`electron/preload.ts`)
Expose safe APIs to React using `contextBridge`.

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer -> Main (Invoke/Handle)
  openDirectoryDialog: (): Promise<string | undefined> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  getApiKey: (service: string): Promise<string | null> =>
    ipcRenderer.invoke('secure:getApiKey', service),
  setApiKey: (service: string, apiKey: string): Promise<void> =>
    ipcRenderer.invoke('secure:setApiKey', service, apiKey),
  sendPrompt: (payload: { context: string; query: string; llm: string }): Promise<string> =>
    ipcRenderer.invoke('llm:sendPrompt', payload),
  analyzeDirectory: (path: string): Promise<string> => // Simplified return
    ipcRenderer.invoke('analysis:analyzeDirectory', path),

  // Main -> Renderer (Send/On)
  onUpdateContext: (callback: (context: string) => void) =>
    ipcRenderer.on('update-context', (_event, context) => callback(context)),
  onAnalysisProgress: (callback: (progress: number) => void) =>
    ipcRenderer.on('analysis-progress', (_event, progress) => callback(progress)),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});

// Define types in src/types/electron.d.ts
export interface IElectronAPI {
    openDirectoryDialog: () => Promise<string | undefined>;
    getApiKey: (service: string) => Promise<string | null>;
    setApiKey: (service: string, apiKey: string) => Promise<void>;
    sendPrompt: (payload: { context: string; query: string; llm: string }) => Promise<string>;
    analyzeDirectory: (path: string) => Promise<string>;
    onUpdateContext: (callback: (context: string) => void) => void;
    onAnalysisProgress: (callback: (progress: number) => void) => void;
    removeAllListeners: (channel: string) => void;
}

declare global {
    interface Window {
        electronAPI: IElectronAPI;
    }
}
```

### C. File/Directory Selection (React -> IPC -> Main)
*   **React Component:** Use `window.electronAPI.openDirectoryDialog()`.
*   **Main Process Handler (`electron/main.ts`):** Use `ipcMain.handle` and `dialog.showOpenDialog`.

```typescript
// Main Process Handler Snippet (electron/main.ts)
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (!canceled && filePaths.length > 0) {
    return filePaths[0];
  }
  return undefined;
});
```

### D. Directory Analysis (Main Process)
*   Use `fs.promises` for async file operations.
*   Implement recursive scanning with filtering (e.g., ignore `.git`, `node_modules`).
*   Consider using worker threads for heavy parsing.
*   Send progress updates via `webContents.send`.
*   Return final context via promise resolution or `webContents.send`.

```typescript
// Conceptual Main Process Handler (electron/main.ts)
import fs from 'fs/promises';
import path from 'path';
import { BrowserWindow } from 'electron'; // Import BrowserWindow

async function analyzeDirectoryRecursive(dirPath: string, mainWindow: BrowserWindow, level = 0): Promise<string[]> {
    // ... (Implementation with filtering, progress updates)
    // Example structure generation
    let structure: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        // Add filtering logic
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
             structure.push(`${'  '.repeat(level)}📁 ${entry.name}`);
             structure = structure.concat(await analyzeDirectoryRecursive(path.join(dirPath, entry.name), mainWindow, level + 1));
        } else if (entry.isFile()) {
             // Add file filtering logic
             structure.push(`${'  '.repeat(level)}📄 ${entry.name}`);
        }
    }
    return structure;
}

ipcMain.handle('analysis:analyzeDirectory', async (event, dirPath: string) => {
    const mainWindow = BrowserWindow.fromWebContents(event.sender);
    if (!mainWindow) return "Error: Could not find window.";
    const analysisResult = await analyzeDirectoryRecursive(dirPath, mainWindow);
    const context = `Directory Structure for: ${dirPath}\n\n${analysisResult.join('\n')}`;
    return context; // Simplified return
});
```

### E. API Key Management (React UI -> IPC -> Main/`node-keytar`)
*   **Main Process:** Use `keytar.getPassword` and `keytar.setPassword` within `ipcMain.handle`. Define a unique `SERVICE_NAME`.
*   **React Component:** Provide input fields and call `window.electronAPI.setApiKey` and `window.electronAPI.getApiKey`. Inform users about secure storage.

```typescript
// Main Process Handlers Snippet (electron/main.ts)
import keytar from 'keytar';
const SERVICE_NAME = 'ContextCraft';

ipcMain.handle('secure:getApiKey', (_, llmService: string) => keytar.getPassword(SERVICE_NAME, llmService));
ipcMain.handle('secure:setApiKey', (_, llmService: string, apiKey: string) => keytar.setPassword(SERVICE_NAME, llmService, apiKey));
```

### F. LLM Interaction & Response Display
*   **React Component:** Gather context, query, selected LLM. Call `window.electronAPI.sendPrompt`. Display response using `react-markdown` and `react-syntax-highlighter`. Handle loading/error states.
*   **Main Process Handler:** Retrieve API key using `keytar`. Use `axios` or `node-fetch` to call the LLM API asynchronously. Handle API errors. Return the response content.

```typescript
// Main Process Handler Snippet (electron/main.ts)
import axios from 'axios';

ipcMain.handle('llm:sendPrompt', async (_, payload: { context: string; query: string; llm: string }) => {
  const { context, query, llm } = payload;
  const apiKey = await keytar.getPassword(SERVICE_NAME, llm);
  if (!apiKey) throw new Error(`API Key for ${llm} not found.`);

  // Example: OpenAI API call using axios
  try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', { model: "gpt-3.5-turbo", messages: [{ role: "system", content: `Context:\n${context}` }, { role: "user", content: query }] }, {
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      });
      return response.data.choices[0]?.message?.content || "No response.";
  } catch (error: any) {
      console.error("API Error:", error.response?.data || error.message);
      throw new Error(`API request failed: ${error.response?.data?.error?.message || error.message}`);
  }
});
```

## 4. Essential Dependencies (`package.json`)

```json
{
  "dependencies": {
    "axios": "^1.x.x",
    "electron-store": "^8.x.x", // Optional
    "keytar": "^7.x.x"
  },
  "devDependencies": {
    "@types/node": "^18.x.x",
    "@types/react": "^18.x.x",
    "@types/react-dom": "^18.x.x",
    "@vitejs/plugin-react": "^4.x.x", // If using Vite
    "electron": "^29.x.x",
    "electron-builder": "^24.x.x", // Or electron-forge
    "react": "^18.x.x",
    "react-dom": "^18.x.x",
    "react-markdown": "^9.x.x",
    "react-syntax-highlighter": "^15.x.x",
    "@types/react-syntax-highlighter": "^15.x.x",
    "typescript": "^5.x.x",
    "vite": "^5.x.x", // If using Vite
    "vite-plugin-electron": "^0.x.x", // If using Vite
    "vite-plugin-electron-renderer": "^0.x.x" // If using Vite
    // Add UI libs, state management, styling libs as needed
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:electron": "tsc -p electron/tsconfig.json", // Adjust path if needed
    "package": "electron-builder",
    "postinstall": "electron-builder install-app-deps"
  }
}
```
*(Remember to adjust versions and add specific UI/state/styling libraries)*

## 5. Open Source Documentation

*   **`LICENSE`:** Recommend MIT License.
*   **`README.md`:** Include project overview, features, tech stack, installation, development, usage, packaging, contributing guidelines, and license information (as outlined in the previous discussion).

## 6. Next Steps

*   Set up the initial project structure.
*   Install dependencies.
*   Configure the build tool (Vite/Webpack).
*   Implement the core Electron setup (Main, Preload, Window).
*   Develop React components and IPC communication layer by layer.
*   Implement features: Directory Selection -> Analysis -> Context Display -> Settings/Key Storage -> LLM Interaction -> Response Display.
*   Refine UI/UX.
*   Write tests (optional but recommended).
*   Package and test builds.