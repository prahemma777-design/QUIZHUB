/* ============================================================
   QUIZHUB — AI Question Generator
   Calls Claude to generate a mixed-DOK multiple-choice question
   set from a subject/topic brief. Returns a clean array of
   question objects the rest of the app can use directly.
   ============================================================ */

const QuizAI = (() => {

  function buildSystemPrompt() {
    return `You are an item writer for a West African Senior High School (SHS) Economics
department. You write multiple-choice questions (MCQs) for classroom quizzes,
class tests and mock exams.

Return ONLY a JSON array. No preamble, no markdown fences, no commentary —
just the raw JSON array, because your output is parsed programmatically.

Each element of the array must be an object with EXACTLY these fields:
{
  "text": "the question, self-contained, no 'see above' references",
  "options": ["option A text", "option B text", "option C text", "option D text"],
  "correctIndex": 0,
  "type": "calc" or "noncalc",
  "dok": 1, 2, 3, or 4
}

Rules:
- "type" is "calc" only if a student must actually perform a numeric/graphical
  calculation to answer (e.g. computing elasticity, opportunity cost, GDP,
  index numbers). Otherwise "noncalc".
- "dok" is Webb's Depth of Knowledge: 1 = recall a fact/definition,
  2 = apply a concept/skill in a routine way, 3 = reason/analyse/interpret
  (e.g. read a scenario or data and draw a conclusion), 4 = extend/evaluate/
  synthesise across concepts (e.g. judge a policy trade-off, design a
  solution). Spread questions across all four levels as evenly as the topic
  allows — do not make everything DOK 1-2.
- Exactly 4 options per question, plausible distractors (no "all of the
  above" / "none of the above" filler), correctIndex is 0-based.
- Match the stated class level: SHS1 = foundational vocabulary and simple
  applications; SHS2 = full syllabus depth with routine analysis; SHS3 =
  exam-style questions including WASSCE-calibre analysis and evaluation.
- Stay strictly within the given subject and topic list. Do not invent
  unrelated topics.
- Vary question stems — avoid starting every question with "What is".`;
  }

  function buildUserPrompt({ subject, topics, level, typeOfWork, week, count }) {
    return `Generate ${count} multiple-choice questions.

Subject: ${subject}
Topics to cover: ${topics}
Class level: ${level}
Type of work: ${typeOfWork}
Week: ${week}

Spread the ${count} questions across DOK levels 1-4, and include a
reasonable mix of calculation and non-calculation items where the topic
allows it (skip calculation items only if the topic genuinely has no
quantitative angle). Return ONLY the JSON array described in your
instructions.`;
  }

  function extractJsonArray(rawText) {
    let cleaned = rawText.trim();
    cleaned = cleaned.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) {
      throw new Error("AI response did not contain a JSON array.");
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function validateQuestion(q, idx) {
    if (!q || typeof q.text !== "string" || !q.text.trim()) {
      throw new Error(`Question ${idx + 1} is missing text.`);
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`Question ${idx + 1} must have exactly 4 options.`);
    }
    if (
      typeof q.correctIndex !== "number" ||
      q.correctIndex < 0 ||
      q.correctIndex > 3
    ) {
      throw new Error(`Question ${idx + 1} has an invalid correctIndex.`);
    }
    if (q.type !== "calc" && q.type !== "noncalc") q.type = "noncalc";
    const dok = Number(q.dok);
    q.dok = dok >= 1 && dok <= 4 ? dok : 1;
    return q;
  }

  async function generate({ subject, topics, level, typeOfWork, week, count = 15 }) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: buildSystemPrompt(),
        messages: [
          { role: "user", content: buildUserPrompt({ subject, topics, level, typeOfWork, week, count }) }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed (${response.status}). Please try again.`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === "text");
    if (!textBlock) throw new Error("AI did not return any text content.");

    let parsed;
    try {
      parsed = extractJsonArray(textBlock.text);
    } catch (e) {
      throw new Error("Couldn't read the AI's response as valid questions. Please try again.");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("AI returned no questions. Please try again.");
    }

    parsed.forEach(validateQuestion);

    // Assign stable local ids
    return parsed.map((q, i) => ({
      id: `Q${String(i + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7)}`,
      text: q.text.trim(),
      options: q.options.map(o => String(o).trim()),
      correctIndex: q.correctIndex,
      type: q.type,
      dok: q.dok
    }));
  }

  return { generate };
})();
