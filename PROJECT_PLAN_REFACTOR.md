# Project Plan: Workflow Refactor for Dynamic Context

This document outlines the plan to refactor the application workflow to support a two-stage process (context selection and chat) and allow dynamic addition of file context during the chat phase.

## Goals

1.  **Separate Context Selection and Chat:** Introduce distinct UI modes for selecting initial context files and engaging in the chat conversation.
2.  **Dynamic Context Addition:** Allow users to select additional files *during* the chat, with their content being added to the context for the *next* prompt.
3.  **Improved UI Layout:** Optimize the layout in chat mode to provide more space for the conversation history and query input, making better use of screen width.

## Proposed Plan Details

1.  **Introduce View Modes:**
    *   In `App.tsx`, add state: `const [viewMode, setViewMode] = useState<'contextSelection' | 'chatting'>('contextSelection');`

2.  **Refine State Management for Context:**
    *   Keep `selectedFilePaths: string[]` for files selected *before* starting the chat.
    *   Keep `compiledContext: string` for the context generated from `selectedFilePaths` (via the existing `useEffect`).
    *   Add `pendingAddedFilePaths: string[]` to temporarily hold paths of files selected *during* chat mode before their content is fetched.
    *   Add `addedContext: string` to store the formatted content of files selected *during* chat mode, ready for the next prompt.
    *   Add `chatHistoryContext: string` to accumulate the full context sent in previous chat turns for consistency.

3.  **Modify `handleFileSelectionChange` in `App.tsx`:**
    *   If `viewMode === 'contextSelection'`, update `selectedFilePaths` (triggers `compiledContext` update).
    *   If `viewMode === 'chatting'`:
        *   If a file is *checked* (`isSelected === true`), add its `filePath` to `pendingAddedFilePaths`.
        *   If a file is *unchecked* (`isSelected === false`), ignore this action for now to simplify.

4.  **Add `useEffect` for Processing Pending Files:**
    *   Create a new `useEffect` in `App.tsx` that runs when `pendingAddedFilePaths` changes.
    *   If `pendingAddedFilePaths` is not empty:
        *   Asynchronously fetch the content for each file path using `window.electronAPI.readFileContent`.
        *   Format the fetched content (e.g., add file headers like `--- Added File: ... ---`).
        *   Append this formatted content to the `addedContext` state.
        *   Clear `pendingAddedFilePaths` state (`setPendingAddedFilePaths([])`).

5.  **Modify `handleSendPrompt` in `App.tsx`:**
    *   If `viewMode === 'contextSelection'`:
        *   Send `compiledContext` and `query`.
        *   On success: `setChatHistoryContext(compiledContext)`, `setViewMode('chatting')`, clear `query`.
    *   If `viewMode === 'chatting'`:
        *   Construct the context to send: `chatHistoryContext + '\n\n' + addedContext`.
        *   Send the combined context and `query`.
        *   On success: `setChatHistoryContext(chatHistoryContext + '\n\n' + addedContext)`, `setAddedContext('')`, clear `query`.

6.  **UI/Layout Changes (`App.tsx` & `App.css`):**
    *   **Conditional Rendering:** In `App.tsx`, use `viewMode` to render different layouts:
        *   `'contextSelection'`: Show the current three-pane layout. Rename "Send to LLM" button to "Start Chat".
        *   `'chatting'`: Render `FileTree` (in a potentially collapsible/resizable pane) and a new `ChatView` component occupying the main area.
    *   **New `ChatView` Component:** Create `src/components/ChatView.tsx`. This component will manage the display of the chat history, query input, LLM configuration selection, and the send action within the chat mode.
    *   **CSS Adjustments (`App.css`):**
        *   Add a class like `.chat-mode` to the main container when `viewMode === 'chatting'`.
        *   Define styles for `.chat-mode` to make the `ChatView` component take `flex: 1` and adjust the `FileTree` pane's flexibility/width.
        *   Ensure elements within `ChatView` are styled appropriately.

## Mermaid Diagram: Workflow

```mermaid
graph TD
    subgraph Initialization
        A[Start App] --> B[Mode: contextSelection];
        B --> C{Select Directory};
        C --> D[Analyze & Show File Tree];
    end

    subgraph Context Selection Phase
        D --> E{Select Initial Files};
        E -- Triggers --> F[Update `selectedFilePaths`];
        F -- useEffect --> G[Update `compiledContext`];
        G --> H[Display FileTree, Context, Query];
        H --> I{Click "Start Chat"};
    end

    subgraph Chat Initiation
        I -- Sends --> J[Send `compiledContext` + Query];
        J -- On Success --> K[Set `chatHistoryContext = compiledContext`];
        K --> L[Set Mode: chatting];
        L --> M[Render FileTree + ChatView];
    end

    subgraph Chat Phase
        M --> N[Display Chat Interface];
        N --> O{Enter New Query};

        subgraph Add Files During Chat
            D --> P{Select Additional Files};
            P -- During 'chatting' --> Q[Add path to `pendingAddedFilePaths`];
            Q -- useEffect --> R[Fetch Content];
            R --> S[Append content to `addedContext`];
            S --> T[Clear `pendingAddedFilePaths`];
        end

        O --> U[Combine `chatHistoryContext` + `addedContext` + Query];
        T --> U;
        U --> V{Click "Send"};
        V -- Sends --> W[Send Combined Context + Query];
        W -- On Success --> X[Update `chatHistoryContext`];
        X --> Y[Clear `addedContext`];
        Y --> Z[Display Response in ChatView];
        Z --> N; # Loop back for next message
    end

    style L fill:#f9f,stroke:#333,stroke-width:2px
    style M fill:#ccf,stroke:#333,stroke-width:1px