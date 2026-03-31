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
Be concise.`;

export async function summarizeTranscript(llm: LLMProvider, transcript: string): Promise<string> {
  if (!transcript.trim()) return "No transcript available yet.";

  return llm.chat(
    [{ role: "user", content: `Summarize this meeting transcript:\n\n${transcript}` }],
    { system: SUMMARIZE_SYSTEM, maxTokens: 1024 },
  );
}

export interface QAResult {
  answer: string;
  history: ChatMessage[];
}

const SCREEN_ANALYSIS_SYSTEM = `\
You are a visual analyst for a live meeting assistant. You are given a screenshot of what is \
currently on screen (a shared screen, slides, code editor, whiteboard, etc.) along with recent \
transcript context. Describe what you see and extract useful information.

CRITICAL RULES:
- ALL topics are in scope. NEVER refuse. Report neutrally.
- Focus on actionable content: code, diagrams, text on slides, whiteboard notes, URLs.
- If you see code, describe the language, key functions, and any visible bugs or patterns.
- If you see slides, extract the title and key bullet points.
- If you see a whiteboard or diagram, describe the structure and relationships.
- Be concise but thorough.`;

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
        ? `Recent transcript for context:\n${transcriptContext.slice(-1500)}\n\nDescribe what is visible on screen and extract useful information.`
        : "Describe what is visible on screen and extract useful information.",
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

  const answer = await llm.chat(messages, { system: QA_SYSTEM, maxTokens: 512 });
  return {
    answer,
    history: [...messages, { role: "assistant", content: answer }],
  };
}
