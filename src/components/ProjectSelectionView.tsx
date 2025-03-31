import React, { useState, useEffect } from 'react';
import { Project } from '../types/electron'; // Assuming Project type is exported from electron.d.ts

interface ProjectSelectionViewProps {
  onProjectSelect: (folderPath: string) => void; // Callback when a recent project is selected
  onOpenNewProject: () => void; // Callback to trigger opening a new directory
  isLoading: boolean; // To disable buttons while loading/analyzing
}

const ProjectSelectionView: React.FC<ProjectSelectionViewProps> = ({
  onProjectSelect,
  onOpenNewProject,
  isLoading
}) => {
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        console.log('Fetching recent projects...');
        const projects = await window.electronAPI.getAllProjects();
        setRecentProjects(projects);
        console.log('Recent projects fetched:', projects);
      } catch (err) {
        console.error('Error fetching recent projects:', err);
        setError('Failed to load recent projects.');
      }
    };
    fetchProjects();
  }, []); // Fetch only on mount

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="project-selection-view">
      <h2>Spaces</h2> {/* Changed title */}
      {error && <p className="error-display">Error: {error}</p>}

      {/* Grid Container */}
      <div className="projects-grid">

        {/* Card for Opening New Project */}
        <div className="project-card new-project-card" onClick={isLoading ? undefined : onOpenNewProject} role="button" tabIndex={0}>
          <div className="new-project-icon">+</div>
          <strong>Create a Space</strong>
          <small>Open a new folder</small>
        </div>

        {/* Cards for Recent Projects */}
        {recentProjects.map((project) => (
          <div key={project.id} className="project-card" onClick={isLoading ? undefined : () => onProjectSelect(project.folderPath)} role="button" tabIndex={0}>
            {/* Placeholder for potential icon later */}
            <strong>{project.name || project.folderPath.split('/').pop() || project.folderPath}</strong>
            <small className="project-path">{project.folderPath}</small>
            <small className="project-last-accessed">Accessed: {formatDate(project.lastAccessed)}</small>
          </div>
        ))}

      </div>
      {recentProjects.length === 0 && !error && <p>No recent projects found.</p>}
      {/* Styles moved to App.css */}
    </div>
  );
};

export default ProjectSelectionView;