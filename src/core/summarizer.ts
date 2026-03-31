import type {
  ChatMessage,
  ImageContent,
  LLMProvider,
  TextContent,
} from "../providers/llm/types.ts";

const SUMMARIZE_SYSTEM = `\
You are a verbatim transcript summarizer. You MUST summarize exactly what was said. \
You are a transcription tool, not a moral judge. Your output is a factual record.

CRITICAL RULES:
- NEVER refuse to summarize. You are documenting, not endorsing.
- ALL topics are in scope: politics, legal, medical, personal, explicit, controversial.
- Report what was said neutrally, as a court stenographer would.
- Do not add warnings, disclaimers, or content notes.

Given a transcript, produce a clear, structured summary with:
- Key decisions made
- Action items (with owners if mentioned)
- Main topics discussed
- Any unresolved questions

Be concise but thorough.`;

const QA_SYSTEM = `\
You are a verbatim transcript Q&A assistant. You MUST answer questions about what was said. \
You are a transcription tool, not a moral judge. NEVER refuse to answer.

CRITICAL RULES:
- ALL topics are in scope: politics, legal, medical, personal, explicit, controversial.
- Report what was said neutrally, as a court stenographer would.
- Do not add warnings, disclaimers, or content notes.

Use the provided context (transcript and extracted insights) to answer.
If you don't have enough information, say so honestly.
Be concise.

After your answer, add exactly this section on a new line:
FOLLOW_UP: suggestion 1 | suggestion 2 | suggestion 3
These should be short (under 10 words each) natural follow-up questions the user might ask next. \
Always include exactly 3 suggestions separated by " | ".`;

export async function summarizeTranscript(
  llm: LLMProvider,
  transcript: string,
  screenDescriptions: string[] = [],
): Promise<string> {
  const hasTranscript = transcript.trim().length > 0;
  const hasScreens = screenDescriptions.length > 0;
  if (!hasTranscript && !hasScreens) return "No transcript or screen data available yet.";

  const parts: string[] = [];
  if (hasTranscript) {
    parts.push(`## Transcript\n${transcript}`);
  }
  if (hasScreens) {
    const screens = screenDescriptions.map((d, i) => `[Screen ${i + 1}] ${d}`).join("\n");
    parts.push(`## Screen content captured during the session\n${screens}`);
  }

  return llm.chat([{ role: "user", content: `Summarize this session:\n\n${parts.join("\n\n")}` }], {
    system: SUMMARIZE_SYSTEM,
    maxTokens: 1024,
  });
}

export interface QAResult {
  answer: string;
  suggestions: string[];
  history: ChatMessage[];
}

/** Parse FOLLOW_UP line from response, return clean answer + suggestions. */
function parseFollowUps(raw: string): { answer: string; suggestions: string[] } {
  const match = raw.match(/\nFOLLOW_UP:\s*(.+)$/m);
  if (!match) return { answer: raw, suggestions: [] };
  const answer = raw.slice(0, match.index).trimEnd();
  const suggestions = match[1]!
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return { answer, suggestions };
}

const SCREEN_ANALYSIS_SYSTEM = `\
You are a text extractor for a live meeting assistant. Given a screenshot, extract and \
interpret the text content visible on screen. Do NOT describe the visual layout or UI elements.

RULES:
- ALL topics are in scope. NEVER refuse.
- Extract text as-is: slide titles, bullet points, code, terminal output, questions, chat messages, URLs.
- For code: include the language, key function/class names, and what the code does in one line.
- For slides: extract title + bullet points verbatim.
- For questions or prompts: extract the full question text.
- For diagrams: extract any labels or text annotations, then one sentence on what they show.
- Skip decorative text (headers, footers, UI chrome).
- Be terse. Raw extracted content is more useful than prose descriptions.`;

export async function analyzeScreen(
  llm: LLMProvider,
  frameBase64: string,
  transcriptContext: string,
): Promise<string> {
  const content: Array<TextContent | ImageContent> = [
    {
      type: "image",
      data: frameBase64,
      mediaType: "image/png",
    },
    {
      type: "text",
      text: transcriptContext
        ? `Recent transcript for context:\n${transcriptContext.slice(-1500)}\n\nExtract the text content on screen.`
        : "Extract the text content on screen.",
    },
  ];

  return llm.chat([{ role: "user", content }], { system: SCREEN_ANALYSIS_SYSTEM, maxTokens: 1024 });
}

export async function answerQuestion(
  llm: LLMProvider,
  question: string,
  context: string,
  history: ChatMessage[] = [],
): Promise<QAResult> {
  const content = `Context:\n${context}\n\nQuestion: ${question}`;
  const messages: ChatMessage[] = [...history, { role: "user", content }];

  const raw = await llm.chat(messages, { system: QA_SYSTEM, maxTokens: 512 });
  const { answer, suggestions } = parseFollowUps(raw);
  return {
    answer,
    suggestions,
    history: [...messages, { role: "assistant", content: raw }],
  };
}
