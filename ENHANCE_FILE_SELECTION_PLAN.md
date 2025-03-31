# Plan: Enhance File/Context Selection Pane

**Goal:** Update the left pane (currently managed by `FileTree.tsx` within `App.tsx`) to include filtering, selection counts, and buttons for adding individual files or folders to the context, taking inspiration from the "16x Prompt" UI.

**Functional Steps:**

1.  **Calculate Total Files:**
    *   In `App.tsx`, create a helper function or use an effect to traverse the `directoryTree` and count the total number of files (items with `type === 'file'`). Store this count in a state variable (e.g., `totalFileCount`).
    *   Pass `totalFileCount` as a prop to `FileTree.tsx`.

2.  **Enhance `FileTree.tsx`:**
    *   **State for Filtering:** Add a state variable within `FileTree` to manage the current filter text (e.g., `filterText`).
    *   **Filter Input:** Add an `<input type="text">` element above the file list. Its `value` should be bound to `filterText`, and its `onChange` handler should update `filterText`.
    *   **Filtering Logic:**
        *   Create a new function (e.g., `filterNodes`) that takes the `treeData` and `filterText` as input.
        *   This function will recursively traverse the tree:
            *   If a node is a directory, filter its children recursively. Keep the directory if its name matches the filter OR if any of its descendants match the filter.
            *   If a node is a file, keep it if its name matches the filter (case-insensitive).
            *   Return the filtered tree structure.
        *   Modify the `renderTree` function to call `filterNodes` on the `treeData` before mapping and rendering.
    *   **Display Counts:** Add a text element near the filter input to display the selection count: `{selectedFiles.length} / {totalFileCount} files selected`. (Receive `totalFileCount` as a prop).
    *   **Add Buttons:**
        *   Add two buttons: "Add File" and "Add Folder".
        *   These buttons will need `onClick` handlers. Define corresponding props in `FileTreeProps` (e.g., `onAddFileClick`, `onAddFolderClick`).
        *   Call these prop functions when the buttons are clicked.

3.  **Update `App.tsx`:**
    *   **Implement Add Handlers:** Create two new functions: `handleAddFile` and `handleAddFolder`.
        *   Initially, these can just log a message (e.g., `"Add File clicked"`).
        *   *(Future Implementation Detail: These will eventually need to use `window.electronAPI` to show file/folder selection dialogs and then update the `pendingAddedFilePaths` state or `selectedFilePaths` depending on the mode).*
    *   **Pass Props:** Pass `totalFileCount`, `handleAddFile`, and `handleAddFolder` down as props to the `FileTree` component.

**Visual Styling Note:**

*   During implementation in Code mode, apply CSS styling to make the filter input, buttons, and overall file tree visually appealing ("look sick"), drawing inspiration from the reference image.

**Component Interaction Diagram:**

```mermaid
graph TD
    subgraph App.tsx
        A1(State: directoryTree) --> A2{Helper: countTotalFiles};
        A2 --> A3(State: totalFileCount);
        A4(Function: handleAddFile);
        A5(Function: handleAddFolder);
        A6(State: selectedFilePaths);
        A7(Function: handleFileSelectionChange);
    end

    subgraph FileTree.tsx
        B1(Props: treeData, totalFileCount, selectedFiles, onFileSelectionChange, onAddFileClick, onAddFolderClick);
        B2(State: filterText);
        B3(UI: Filter Input) -- onChange --> B2;
        B4(UI: Selection Count Display) -- Reads --> B1 & A3;
        B5{Function: filterNodes} -- Uses --> B1 & B2;
        B6{Function: renderTree} -- Calls --> B5;
        B7(UI: Filtered File List) -- Renders based on --> B6;
        B7 -- onCheckboxChange --> B1[onFileSelectionChange];
        B8(UI: Add File Button) -- onClick --> B1[onAddFileClick];
        B9(UI: Add Folder Button) -- onClick --> B1[onAddFolderClick];
    end

    App.tsx -- Props --> FileTree.tsx;
    FileTree.tsx -- Callbacks --> App.tsx;