import React from 'react';
import { DirectoryItem } from '../types/electron'; // Import the type

interface FileTreeProps {
  treeData: DirectoryItem[] | null;
  selectedFiles: string[];
  onFileSelectionChange: (filePath: string, isSelected: boolean) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ treeData, selectedFiles, onFileSelectionChange }) => {

  const renderTree = (nodes: DirectoryItem[]) => {
    return (
      <ul style={{ listStyleType: 'none', paddingLeft: '15px' }}>
        {nodes.map((node) => (
          <li key={node.path}>
            {node.type === 'directory' ? (
              <div>
                <strong>📁 {node.name}</strong>
                {/* Recursively render children if they exist */}
                {node.children && node.children.length > 0 && renderTree(node.children)}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  id={node.path}
                  checked={selectedFiles.includes(node.path)}
                  onChange={(e) => onFileSelectionChange(node.path, e.target.checked)}
                  style={{ marginRight: '5px' }}
                />
                <label htmlFor={node.path} style={{ cursor: 'pointer' }}>
                  📄 {node.name}
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  if (!treeData) {
    return <p><small>Select a directory first.</small></p>;
  }

  if (treeData.length === 0) {
    return <p><small>Directory appears empty or contains only ignored files.</small></p>;
  }

  return (
    <div className="file-tree-container" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', overflowY: 'auto', flexGrow: 1 }}>
      <h4>Project Files</h4>
      {renderTree(treeData)}
    </div>
  );
};

export default FileTree;