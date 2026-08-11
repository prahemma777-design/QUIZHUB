/* ============================================================
   QUIZHUB — Question Upload / Text Parser
   Lets a teacher supply questions by typing/pasting plain text
   (from Word, notes, anywhere), or uploading a .docx / .pdf /
   .txt file. No spreadsheet format — writing MCQs in a
   spreadsheet grid isn't realistic, so this focuses entirely on
   natural question text.

   Template teachers should follow (numbers + lettered options):

     1. What is a normal profit?
     A) Some wrong answer
     B) Another wrong answer
     C) The correct answer
     D) A distractor
     Answer: C
     Type: noncalc
     DOK: 1

     2. Next question...

   - Number each question ("1.", "2.", ...) and letter each
     option ("A)", "B)", "C)", "D)").
   - Mark the right option with an "Answer: <letter>" line, OR
     put a "*" next to the correct option itself — either works.
   - "Type:" (calc/noncalc) and "DOK:" (1-4) are optional and
     default to noncalc / DOK 1 if left out.
   ============================================================ */

const DocUpload = (() => {

  function cleanQuestion(q, idx) {
    const text = String(q.text || "").trim();
    const options = [0, 1, 2, 3].map(i => String(q.options?.[i] ?? "").trim());
    if (!text) throw new Error(`Question ${idx + 1} is missing its question text.`);
    if (options.some(o => !o)) throw new Error(`Question ${idx + 1} needs all 4 options filled in.`);
    let correctIndex = Number(q.correctIndex);
    if (!(correctIndex >= 0 && correctIndex <= 3)) {
      throw new Error(`Question ${idx + 1} has no clearly marked correct answer. Add "Answer: <letter>" or a "*" next to the right option.`);
    }
    const type = String(q.type || "").toLowerCase().startsWith("calc") ? "calc" : "noncalc";
    const dokNum = Number(q.dok);
    const dok = dokNum >= 1 && dokNum <= 4 ? dokNum : 1;
    return {
      id: `Q${String(idx + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7)}`,
      text, options, correctIndex, type, dok
    };
  }

  function letterToIndex(val) {
    const s = String(val ?? "").trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(s)) return s.charCodeAt(0) - 65;
    return NaN;
  }

  /* ---------------- Numbered-question / lettered-option text parser ---------------- */
  // Handles both "blank line between questions" AND questions that run
  // straight into each other, as long as each starts with "N." or "N)".

  function parseTextContent(rawText) {
    const text = String(rawText || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u2018|\u2019/g, "'")
      .replace(/\u201c|\u201d/g, '"');

    const lines = text.split("\n");
    const qStartRegex = /^\s*(\d{1,3})[\.\)]\s+(\S.*)$/;
    const optRegex = /^\s*\(?([A-Da-d])[\.\)]\s*(.*)$/;
    const answerRegex = /^\s*Answer\s*[:\-]\s*\(?([A-Da-d])\)?/i;
    const typeRegex = /^\s*Type\s*[:\-]\s*([A-Za-z-]+)/i;
    const dokRegex = /^\s*DOK\s*[:\-]\s*([1-4])/i;

    const blocks = [];
    let current = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const qMatch = line.match(qStartRegex);
      if (qMatch) {
        if (current) blocks.push(current);
        current = { textLines: [qMatch[2]], optionLetters: { A: "", B: "", C: "", D: "" }, answer: "", type: "", dok: "" };
        continue;
      }
      if (!current) continue; // skip any preamble before question 1
      if (!line) continue;

      const optMatch = line.match(optRegex);
      const ansMatch = line.match(answerRegex);
      const typeMatch = line.match(typeRegex);
      const dokMatch = line.match(dokRegex);

      if (ansMatch) {
        current.answer = ansMatch[1].toUpperCase();
      } else if (typeMatch) {
        current.type = typeMatch[1];
      } else if (dokMatch) {
        current.dok = dokMatch[1];
      } else if (optMatch) {
        let optText = optMatch[2];
        const letter = optMatch[1].toUpperCase();
        if (/\*/.test(optText)) {
          current.answer = letter;
          optText = optText.replace(/\*/g, "").trim();
        }
        current.optionLetters[letter] = optText.trim();
      } else {
        current.textLines.push(line);
      }
    }
    if (current) blocks.push(current);

    if (blocks.length === 0) {
      throw new Error('No questions found. Make sure each question starts with a number, like "1. Your question text?".');
    }

    return blocks.map((b, i) => cleanQuestion({
      text: b.textLines.join(" ").trim(),
      options: [b.optionLetters.A, b.optionLetters.B, b.optionLetters.C, b.optionLetters.D],
      correctIndex: letterToIndex(b.answer),
      type: b.type,
      dok: b.dok
    }, i));
  }

  /* ---------------- File upload: .docx / .pdf / .txt ---------------- */

  function parseDocxFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (typeof mammoth === "undefined") {
            throw new Error('The Word-reading library didn\'t load (often an ad blocker or offline connection). Try "Paste text instead" below rather than uploading the file.');
          }
          const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
          resolve(parseTextContent(result.value));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsArrayBuffer(file);
    });
  }

  async function parsePdfFile(file) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error('The PDF-reading library didn\'t load (often an ad blocker or offline connection). Try "Paste text instead" below rather than uploading the file.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let pageText = "";
      content.items.forEach((item) => {
        pageText += item.str + (item.hasEOL ? "\n" : " ");
      });
      text += pageText + "\n";
    }
    return parseTextContent(text);
  }

  function parseTxtFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try { resolve(parseTextContent(e.target.result)); }
        catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsText(file);
    });
  }

  async function parseAnyFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) return parseDocxFile(file);
    if (name.endsWith(".pdf")) return parsePdfFile(file);
    if (name.endsWith(".txt")) return parseTxtFile(file);
    throw new Error("Please upload a .docx, .pdf, or .txt file — or use \"Paste text instead\" below.");
  }

  return { parseAnyFile, parseTextContent };
})();
