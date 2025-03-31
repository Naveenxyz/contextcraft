import React, { useState, useMemo, useEffect, useRef } from 'react'; // Added useEffect, useRef
import { DirectoryItem } from '../types/electron'; // Import the type

interface FileTreeProps {
  treeData: DirectoryItem[] | null;
  selectedFiles: string[];
  totalFileCount: number;
  onFileSelectionChange: (filePath: string, isSelected: boolean) => void;
  // New props for folder selection/deselection
  onFolderSelect: (folderPath: string, filePaths: string[]) => void;
  onFolderDeselect: (folderPath: string, filePaths: string[]) => void;
}

// --- Helper Functions ---

// Recursively get all file paths within a directory node
const getAllDescendantFilePaths = (node: DirectoryItem): string[] => {
  let paths: string[] = [];
  if (node.type === 'file') {
    paths.push(node.path);
  } else if (node.type === 'directory' && node.children) {
    node.children.forEach(child => {
      paths = paths.concat(getAllDescendantFilePaths(child));
    });
  }
  return paths;
};

// Determine the selection state of a folder based on its descendants
const getFolderSelectionState = (node: DirectoryItem, selectedFilesSet: Set<string>): 'checked' | 'indeterminate' | 'unchecked' => {
  if (node.type !== 'directory' || !node.children || node.children.length === 0) {
    return 'unchecked'; // Not a folder or empty folder
  }

  const descendantFiles = getAllDescendantFilePaths(node);
  if (descendantFiles.length === 0) {
      return 'unchecked'; // Folder contains no files (only empty subdirs)
  }

  let selectedCount = 0;
  for (const filePath of descendantFiles) {
    if (selectedFilesSet.has(filePath)) {
      selectedCount++;
    }
  }

  if (selectedCount === 0) {
    return 'unchecked';
  } else if (selectedCount === descendantFiles.length) {
    return 'checked';
  } else {
    return 'indeterminate';
  }
};


// Filter nodes recursively (same as before)
const filterNodes = (nodes: DirectoryItem[], filterText: string): DirectoryItem[] => {
    if (!filterText) {
      return nodes; // No filter, return original nodes
    }

    const lowerCaseFilter = filterText.toLowerCase();

    return nodes.reduce((filtered, node) => {
      if (node.type === 'directory') {
        const filteredChildren = node.children ? filterNodes(node.children, filterText) : [];
        if (node.name.toLowerCase().includes(lowerCaseFilter) || filteredChildren.length > 0) {
          filtered.push({ ...node, children: filteredChildren });
        }
      } else if (node.type === 'file') {
        if (node.name.toLowerCase().includes(lowerCaseFilter)) {
          filtered.push(node);
        }
      }
      return filtered;
    }, [] as DirectoryItem[]);
};


const FileTree: React.FC<FileTreeProps> = ({
  treeData,
  selectedFiles,
  totalFileCount,
  onFileSelectionChange,
  onFolderSelect, // <<< Destructure new prop
  onFolderDeselect, // <<< Destructure new prop
}) => {
  const [filterText, setFilterText] = useState('');

  // Use a Set for faster lookups when determining folder state
  const selectedFilesSet = useMemo(() => new Set(selectedFiles), [selectedFiles]);

  const filteredTreeData = useMemo(() => {
    return treeData ? filterNodes(treeData, filterText) : null;
  }, [treeData, filterText]);

  // --- Render Function ---
  const renderTree = (nodes: DirectoryItem[]) => {
    return (
      <ul style={{ listStyleType: 'none', paddingLeft: '15px', marginTop: '0.5rem' }}>
        {nodes.map((node) => {
          // Use refs for indeterminate state as it's not directly controllable via 'checked' prop
          const folderCheckboxRef = useRef<HTMLInputElement>(null);
          let folderState: 'checked' | 'indeterminate' | 'unchecked' = 'unchecked';

          if (node.type === 'directory') {
              folderState = getFolderSelectionState(node, selectedFilesSet);
          }

          // Set indeterminate state via effect after render
          useEffect(() => {
            if (node.type === 'directory' && folderCheckboxRef.current) {
              folderCheckboxRef.current.indeterminate = (folderState === 'indeterminate');
            }
          }, [folderState, node.type]); // Re-run if folderState changes

          const handleFolderCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              const isChecked = e.target.checked;
              const descendantFiles = getAllDescendantFilePaths(node);
              if (isChecked) {
                  console.log(`Folder selected: ${node.path}`, descendantFiles);
                  onFolderSelect(node.path, descendantFiles);
              } else {
                  console.log(`Folder deselected: ${node.path}`, descendantFiles);
                  onFolderDeselect(node.path, descendantFiles);
              }
          };

          return (
            <li key={node.path} style={{ marginBottom: '0.2rem' }}>
              {node.type === 'directory' ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                     <input
                        type="checkbox"
                        ref={folderCheckboxRef} // Use ref for indeterminate state
                        checked={folderState === 'checked'} // Only truly checked if all descendants are selected
                        onChange={handleFolderCheckboxChange}
                        style={{ marginRight: '8px', cursor: 'pointer', flexShrink: 0 }}
                        title={`Select/Deselect all files in ${node.name}`}
                      />
                    <strong style={{ color: 'var(--text-color-secondary)', cursor: 'default' }}>
                      📁 {node.name}
                    </strong>
                  </div>
                  {/* Recursively render children */}
                  {node.children && node.children.length > 0 && renderTree(node.children)}
                </div>
              ) : ( // File node
                <div style={{ display: 'flex', alignItems: 'center', marginLeft: '24px' /* Indent files */ }}>
                  <input
                    type="checkbox"
                    id={node.path}
                    checked={selectedFilesSet.has(node.path)} // Use Set for check
                    onChange={(e) => onFileSelectionChange(node.path, e.target.checked)}
                    style={{ marginRight: '8px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <label htmlFor={node.path} style={{ cursor: 'pointer', flexGrow: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={node.path}>
                    📄 {node.name}
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  // --- Component Return ---

  if (!treeData) {
    return null;
  }

  if (treeData.length === 0 && !filterText) { // Only show if not filtering
    return (
        <div className="file-tree-container" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            <h4>Project Files</h4>
            <p><small>Directory appears empty or contains only ignored files.</small></p>
            {/* Buttons removed */}
        </div>
    );
  }

  return (
    <div className="file-tree-container" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', flexGrow: 1 /* Removed overflow: hidden */ }}>
      {/* Filter and Count */}
      <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Filter files and folders..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          style={{ width: '100%', padding: '0.3rem 0.5rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
        />
        <small style={{ color: 'var(--text-color-secondary)' }}>
          {selectedFiles.length} / {totalFileCount} files selected
        </small>
      </div>

      {/* File Tree */}
      <div style={{ overflowY: 'auto', flexGrow: 1 }}>
        {filteredTreeData && filteredTreeData.length > 0 ? (
          renderTree(filteredTreeData)
        ) : (
          <p style={{ paddingLeft: '15px' }}><small>{filterText ? 'No matching files or folders found.' : 'Directory appears empty or contains only ignored files.'}</small></p>
        )}
      </div>
      {/* Buttons removed */}
    </div>
  );
};

export default FileTree;