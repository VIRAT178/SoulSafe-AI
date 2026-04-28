import { useState } from "react";

function resolveApiBaseUrl(): string {
  const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

  if (configuredApiBase) {
    return configuredApiBase;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:4000";
  }

  throw new Error(
    "Missing VITE_API_BASE_URL. Set it in your production environment to your deployed API URL before building the web app."
  );
}

const apiBase = resolveApiBaseUrl();

export interface Suggestion {
  tone: "friendly" | "emotional" | "formal";
  subject: string;
  body: string;
}

interface MessageSuggestionsProps {
  recipientName: string;
  occasionType: string;
  originalMessage: string;
  token: string | null;
  onSelectSuggestion: (body: string) => void;
}

export function MessageSuggestions({
  recipientName,
  occasionType,
  originalMessage,
  token,
  onSelectSuggestion,
}: MessageSuggestionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const canRequest =
    recipientName.trim() &&
    occasionType &&
    originalMessage.trim();

  async function handleRequestSuggestions() {
    if (!token || !canRequest) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/ai/enhance-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientName,
          occasionType,
          message: originalMessage,
        }),
      });

      const rawText = await response.text();
      let payload: { message?: string; suggestions?: Suggestion[] } = {};

      if (rawText) {
        try {
          payload = JSON.parse(rawText) as { message?: string; suggestions?: Suggestion[] };
        } catch {
          payload = {};
        }
      }

      if (!response.ok) {
        throw new Error(
          payload.message ||
            `API error: ${response.status} ${response.statusText}`
        );
      }

      setSuggestions(payload.suggestions ?? []);
      setIsExpanded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectSuggestion(body: string) {
    onSelectSuggestion(body);
    setSuggestions(null);
    setIsExpanded(false);
  }

  const toneEmojis: Record<Suggestion["tone"], string> = {
    friendly: "✨",
    emotional: "💫",
    formal: "✅",
  };

  const toneLabels: Record<Suggestion["tone"], string> = {
    friendly: "Warm & Friendly",
    emotional: "Deep & Emotional",
    formal: "Polished & Formal",
  };

  return (
    <div className="message-suggestions-container">
      <button
        type="button"
        className="btn btn-secondary message-enhance-btn"
        onClick={handleRequestSuggestions}
        disabled={!canRequest || isLoading}
        aria-label="Generate AI message suggestions"
      >
        {isLoading ? "Generating..." : "✨ Generate AI suggestions"}
      </button>

      {error && <p className="message-error-text">{error}</p>}

      {suggestions && suggestions.length > 0 && (
        <div className={`message-suggestions-list ${isExpanded ? "expanded" : ""}`}>
          <div className="suggestions-header">
            <h5>Message suggestions</h5>
            <button
              type="button"
              className="close-btn"
              onClick={() => setIsExpanded(false)}
              aria-label="Close suggestions"
            >
              ✕
            </button>
          </div>

          <div className="suggestions-grid">
            {suggestions.map((suggestion) => (
              <div key={suggestion.tone} className="suggestion-card">
                <div className="suggestion-header">
                  <span className="tone-emoji">{toneEmojis[suggestion.tone]}</span>
                  <h6>{toneLabels[suggestion.tone]}</h6>
                </div>

                <div className="suggestion-content">
                  <p className="suggestion-subject">
                    <strong>Subject:</strong> {suggestion.subject}
                  </p>
                  <p className="suggestion-body">{suggestion.body}</p>
                </div>

                <button
                  type="button"
                  className="btn btn-primary use-suggestion-btn"
                  onClick={() => handleSelectSuggestion(suggestion.body)}
                >
                  Use this version
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
