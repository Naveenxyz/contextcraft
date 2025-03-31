import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { LLMConfig } from '../types/llmConfig'; // Assuming LLMConfig type path

interface ChatViewProps {
  // Props needed for chat functionality will be added here:
  query: string;
  setQuery: (query: string) => void;
  llmResponse: string;
  thinkingSteps: string;
  isSending: boolean;
  error: string | null;
  handleSendPrompt: () => void;
  llmConfigs: LLMConfig[];
  selectedConfigId: string | null;
  setSelectedConfigId: (id: string | null) => void;
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
  // Add chat history display later
  fullPromptForCopy: string; // <<< Add prop for the full prompt string
}

const ChatView: React.FC<ChatViewProps> = ({
  query,
  setQuery,
  llmResponse,
  thinkingSteps,
  isSending,
  error,
  handleSendPrompt,
  llmConfigs,
  selectedConfigId,
  setSelectedConfigId,
  selectedModel,
  setSelectedModel,
  fullPromptForCopy, // <<< Destructure the new prop
}) => {

  // TODO: Implement chat history display (e.g., array of messages)

  // Simplified LLM Config change handler (adjust as needed)
  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newConfigId = e.target.value;
    setSelectedConfigId(newConfigId);
    const newConfig = llmConfigs.find(c => c.id === newConfigId);
    if (newConfig) {
      setSelectedModel(newConfig.defaultModel ?? (newConfig.models.length > 0 ? newConfig.models[0] : null));
    } else {
      setSelectedModel(null);
    }
  };

  return (
    <section className="chat-view">
      {/* TODO: Add Chat History Display Area */}
      <div className="chat-history-area">
        {/* Placeholder for chat messages */}
        <p>Chat history will appear here...</p>
         {/* Display Thinking Steps */}
         {thinkingSteps && (
            <div className="thinking-steps-area" style={{ marginBottom: '1rem', borderBottom: '1px dashed var(--border-color)', paddingBottom: '1rem', opacity: 0.7 }}>
                <h4>Thinking...</h4>
                <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.8rem' }}>
                    <code>{thinkingSteps}</code>
                </pre>
            </div>
         )}
         {/* Display Current Response Stream */}
         {llmResponse && (
             <div className="response-display-area">
                <ReactMarkdown
                  children={llmResponse}
                  components={{
                    code({ node, className, children, ...props }: { node?: any; inline?: boolean; className?: string; children?: React.ReactNode }) {
                      const match = /language-(\w+)/.exec(className || '');
                      return match ? (
                        <SyntaxHighlighter
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                />
             </div>
         )}
         {llmResponse && !isSending && (
             <button onClick={() => navigator.clipboard.writeText(llmResponse)} className="copy-button">
               Copy Response
             </button>
         )}
         {isSending && !thinkingSteps && <p>Waiting for response...</p>}
      </div>

      {/* Error Display */}
      {error && <p className="error-display">Error: {error}</p>}

      {/* Input Area */}
      <div className="chat-input-area">
         {/* LLM Configuration Selection */}
         <div className="llm-config-selector">
             <div>
                <label htmlFor="chat-config-select">Config: </label>
                <select
                    id="chat-config-select"
                    value={selectedConfigId ?? ''}
                    onChange={handleConfigChange}
                    disabled={llmConfigs.length === 0 || isSending}
                >
                    <option value="" disabled>-- Select --</option>
                    {llmConfigs.map(config => (
                        <option key={config.id} value={config.id}>{config.name}</option>
                    ))}
                </select>
            </div>
            <div style={{ marginLeft: '0.5rem' }}>
                 <label htmlFor="chat-model-select">Model: </label>
                 <select
                    id="chat-model-select"
                    value={selectedModel ?? ''}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={!selectedConfigId || isSending}
                 >
                    <option value="" disabled>-- Select --</option>
                    {llmConfigs.find(c => c.id === selectedConfigId)?.models.map(modelName => (
                         <option key={modelName} value={modelName}>{modelName}</option>
                    ))}
                 </select>
            </div>
         </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your message..."
          rows={3}
          disabled={isSending || !selectedConfigId || !selectedModel}
        />
        {/* Wrapper for buttons */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>
            <button
              onClick={handleSendPrompt}
              disabled={isSending || !query || !selectedConfigId || !selectedModel}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
            {/* TODO: Enhance this to copy the full prompt including context */}
            <button
              onClick={() => navigator.clipboard.writeText(fullPromptForCopy)} // <<< Use the full prompt prop
              disabled={isSending || !fullPromptForCopy} // <<< Disable if no prompt string or sending
              className="copy-button" // Reuse existing style or create a new one
              style={{ marginLeft: '0.5rem' }} // Keep spacing
            >
              Copy Full Prompt {/* <<< Change button text */}
            </button>
        </div>
      </div>
    </section>
  );
};

export default ChatView;