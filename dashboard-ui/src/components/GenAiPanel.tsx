import { Box, Button, Chip, Stack, TextField } from "@mui/material";
import { useState } from "react";
import { useAppSelector } from "../app/hooks";
import { useAskGenaiMutation } from "../features/dashboard/dashboardApi";
import { computeTimeWindow } from "../utils/time";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: Record<string, unknown>;
};

const promptPresets = [
  "Summarize the critical violations and likely drivers.",
  "Which sensors are drifting and how fast?",
  "Give a mitigation plan for the last 2 hours.",
];

export function GenAiPanel() {
  const filters = useAppSelector((state) => state.filters);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [askGenai, { isLoading }] = useAskGenaiMutation();

  const sendMessage = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !filters.tenantKey) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await askGenai({
        question: trimmed,
        tenant_key: filters.tenantKey,
        sensor_code: filters.sensorCode || null,
        metric: filters.metric || null,
        scenario: filters.scenario || null,
        data_profile: filters.dataProfile || null,
        time_window: computeTimeWindow(filters) || null,
      }).unwrap();

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: response.answer || "No answer returned.",
          context: response.context,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: "GenAI request failed. Try again once the service is up.",
        },
      ]);
    }
  };

  return (
    <Box>
      <div className="panel-header">
        <div>
          <div className="panel-title">GenAI Copilot</div>
          <div className="panel-subtitle">Ask questions about this window</div>
        </div>
      </div>

      <Stack spacing={1.5} className="fade-in">
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {promptPresets.map((prompt) => (
            <Chip
              key={prompt}
              label={prompt}
              size="small"
              onClick={() => sendMessage(prompt)}
            />
          ))}
        </Stack>

        <div className="genai-thread">
          {messages.length === 0 && (
            <div className="panel-subtitle">
              Drop a question and the assistant will inspect ES for evidence.
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.role}`}>
              <div>{message.content}</div>
              {message.context && (
                <details>
                  <summary>Context</summary>
                  <pre>{JSON.stringify(message.context, null, 2)}</pre>
                </details>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="chat-bubble assistant">Thinking...</div>
          )}
        </div>

        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            label="Ask about this run"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button
            variant="contained"
            onClick={() => sendMessage(input)}
            disabled={!filters.tenantKey || isLoading || !input.trim()}
          >
            Send
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
