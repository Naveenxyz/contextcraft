import React, { useState, useEffect, useCallback } from 'react';
import { LLMConfig } from '../types/llmConfig'; // Import the type

const LLMConfigManager: React.FC = () => {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for adding new config
  const [newName, setNewName] = useState('');
  const [newEndpoint, setNewEndpoint] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newModels, setNewModels] = useState(''); // Comma-separated string for simplicity

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedConfigs = await window.electronAPI.getLLMConfigs();
      setConfigs(fetchedConfigs);
    } catch (err) {
      console.error("Error fetching LLM configs:", err);
      setError(err instanceof Error ? err.message : 'Failed to fetch configs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleAddConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newName || !newEndpoint || !newApiKey || !newModels) {
        setError("All fields (Name, Endpoint, API Key, Models) are required.");
        return;
    }

    const modelsArray = newModels.split(',').map(m => m.trim()).filter(m => m);
    if (modelsArray.length === 0) {
        setError("Please provide at least one valid model name.");
        return;
    }

    setIsLoading(true);
    try {
        const newConfigData = {
            name: newName,
            apiEndpoint: newEndpoint,
            models: modelsArray,
            // defaultModel could be added here if needed
        };
        const addedConfig = await window.electronAPI.addLLMConfig(newConfigData, newApiKey);
        if (addedConfig) {
            setConfigs(prev => [...prev, addedConfig]);
            // Clear form
            setNewName('');
            setNewEndpoint('');
            setNewApiKey('');
            setNewModels('');
        } else {
            setError("Failed to add configuration.");
        }
    } catch (err) {
        console.error("Error adding LLM config:", err);
        setError(err instanceof Error ? err.message : 'Failed to add config');
    } finally {
        setIsLoading(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    setError(null);
    // Optional: Add confirmation dialog here
    if (!window.confirm(`Are you sure you want to delete this configuration? This cannot be undone.`)) {
        return;
    }

    setIsLoading(true);
    try {
        const success = await window.electronAPI.deleteLLMConfig(configId);
        if (success) {
            setConfigs(prev => prev.filter(c => c.id !== configId));
        } else {
            setError("Failed to delete configuration.");
        }
    } catch (err) {
        console.error("Error deleting LLM config:", err);
        setError(err instanceof Error ? err.message : 'Failed to delete config');
    } finally {
        setIsLoading(false);
    }
  };

  // TODO: Add Edit functionality later

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
      <h4>LLM Configurations</h4>
      {isLoading && <p>Loading...</p>}
      {error && <p className="error-display">{error}</p>}

      {/* List existing configs */}
      <div style={{ marginBottom: '1rem', maxHeight: '150px', overflowY: 'auto' }}>
        {configs.length === 0 && !isLoading && <p><small>No configurations added yet.</small></p>}
        <ul style={{ paddingLeft: '1rem', margin: 0 }}>
          {configs.map(config => (
            <li key={config.id} style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>{config.name}</strong><br />
                <small>Models: {config.models.join(', ')}</small><br/>
                <small>Endpoint: {config.apiEndpoint}</small>
              </span>
              {/* Add Edit button later */}
              <button onClick={() => handleDeleteConfig(config.id)} style={{ marginLeft: '1rem', padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} disabled={isLoading}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Form to add new config */}
      <form onSubmit={handleAddConfig}>
        <h5>Add New Configuration</h5>
        <input
          type="text"
          placeholder="Configuration Name (e.g., Groq Llama3)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
          style={{ marginBottom: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="API Endpoint URL (e.g., https://api.groq.com/openai/v1)"
          value={newEndpoint}
          onChange={(e) => setNewEndpoint(e.target.value)}
          required
           style={{ marginBottom: '0.5rem' }}
        />
         <input
          type="password"
          placeholder="API Key"
          value={newApiKey}
          onChange={(e) => setNewApiKey(e.target.value)}
          required
           style={{ marginBottom: '0.5rem' }}
        />
         <input
          type="text"
          placeholder="Models (comma-separated, e.g., llama3-70b-8192)"
          value={newModels}
          onChange={(e) => setNewModels(e.target.value)}
          required
           style={{ marginBottom: '0.5rem' }}
        />
        <button type="submit" disabled={isLoading}>Add Configuration</button>
      </form>
    </div>
  );
};

export default LLMConfigManager;