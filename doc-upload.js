/* ============================================================
   QUIZHUB — Question Upload / Text Parser
   Lets a teacher supply questions by typing/pasting plain text
   (from Word, notes, anywhere), or uploading a .docx / .pdf /
   .txt file.

   IMPORTANT — how Word numbering is handled:
   If a teacher used Word's own "Numbering"/"Bullets" buttons to
   number the questions and letter the options, Word does NOT
   store "1." or "A." as real characters — it draws them on
   screen from a separate list definition. A plain-text read of
   the file (which is how most tools work) sees no numbers at
   all. To handle this properly, .docx files are converted to
   HTML first (via mammoth.convertToHtml), which DOES turn
   Word's real numbered/bulleted lists into <ol>/<ul> structure
   we can read — so native Word numbering just works. Typed
   numbers ("1.", "A)") as plain text still work too, as a
   fallback, for .docx, .pdf, and .txt alike.

   Template teachers can follow if typing plain text (no need to
   use Word's list buttons at all):

     1. What is a normal profit?
     A) Some wrong answer
     B) Another wrong answer
     C) The correct answer
     D) A distractor
     Answer: C
     Type: noncalc
     DOK: 1

     2. Next question...

   - Mark the right option with an "Answer: <letter>" line, a
     "*" next to the correct option, OR just make the correct
     option's text **bold** in Word — all three work.
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
      throw new Error(`Question ${idx + 1} has no clearly marked correct answer. Add "Answer: <letter>", a "*", or bold the right option.`);
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

  const ANSWER_RE = /Answer\s*[:\-]\s*\(?([A-Da-d])\)?/i;
  const TYPE_RE = /Type\s*[:\-]\s*([A-Za-z-]+)/i;
  const DOK_RE = /DOK\s*[:\-]\s*([1-4])/i;
  const OPT_LINE_RE = /^\s*\(?([A-Da-d])[\.\)]\s*(.*)$/;

  /* ---------------- Plain-text fallback parser ---------------- */
  // Used when the document has no real Word lists at all — i.e. the
  // teacher typed "1.", "A)" etc. as literal characters. Handles
  // questions with or without blank lines between them.

  function parseTextContent(rawText) {
    const text = String(rawText || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u2018|\u2019/g, "'")
      .replace(/\u201c|\u201d/g, '"');

    const lines = text.split("\n");
    const qStartRegex = /^\s*(\d{1,3})[\.\)]\s+(\S.*)$/;

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

      const optMatch = line.match(OPT_LINE_RE);
      const ansMatch = line.match(ANSWER_RE);
      const typeMatch = line.match(TYPE_RE);
      const dokMatch = line.match(DOK_RE);

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
      throw new Error('No questions found. Number each question ("1.", "2.", ...) or use Word\'s own numbered list feature.');
    }

    return blocks.map((b, i) => cleanQuestion({
      text: b.textLines.join(" ").trim(),
      options: [b.optionLetters.A, b.optionLetters.B, b.optionLetters.C, b.optionLetters.D],
      correctIndex: letterToIndex(b.answer),
      type: b.type,
      dok: b.dok
    }, i));
  }

  /* ---------------- Word-list-aware HTML parser ---------------- */
  // Reads mammoth's HTML output, which turns REAL Word numbering/
  // bullets into <ol>/<ul>/<li>. Each top-level list item is one
  // question. A nested list inside it is read as the 4 options. If
  // a question <li> has no nested list, its own text is parsed the
  // old way (literal "A)" lines) as a fallback. Bold text can mark
  // the correct option when there's no "Answer:" line.

  function textOfNodeExcludingNestedLists(li) {
    let out = "";
    li.childNodes.forEach((node) => {
      if (node.nodeType === 1 && /^(OL|UL)$/i.test(node.tagName)) return; // skip nested lists
      out += node.textContent;
    });
    return out.replace(/\s+/g, " ").trim();
  }

  function findNestedList(li) {
    for (const node of li.childNodes) {
      if (node.nodeType === 1 && /^(OL|UL)$/i.test(node.tagName)) return node;
    }
    return null;
  }

  function isMostlyBold(li) {
    const text = li.textContent.replace(/\s+/g, " ").trim();
    if (!text) return false;
    const boldEls = li.querySelectorAll("strong, b");
    let boldChars = 0;
    boldEls.forEach((el) => { boldChars += el.textContent.length; });
    return boldChars >= text.length * 0.6;
  }

  function parseQuestionLi(li, idx) {
    const nestedList = findNestedList(li);
    const ownText = textOfNodeExcludingNestedLists(li);

    // Pull out Answer:/Type:/DOK: annotations from the question's own text
    let questionText = ownText;
    let answerLetter = "";
    let type = "";
    let dok = "";
    const ansMatch = ownText.match(ANSWER_RE);
    if (ansMatch) { answerLetter = ansMatch[1].toUpperCase(); questionText = questionText.replace(ansMatch[0], "").trim(); }
    const typeMatch = ownText.match(TYPE_RE);
    if (typeMatch) { type = typeMatch[1]; questionText = questionText.replace(typeMatch[0], "").trim(); }
    const dokMatch = ownText.match(DOK_RE);
    if (dokMatch) { dok = dokMatch[1]; questionText = questionText.replace(dokMatch[0], "").trim(); }

    let options = ["", "", "", ""];
    let correctIndex = letterToIndex(answerLetter); // NaN if no "Answer:" line found

    if (nestedList) {
      // Real Word sub-list (numbered or bulleted) = the 4 options.
      const optionLis = Array.from(nestedList.children).filter(c => c.tagName === "LI");
      optionLis.slice(0, 4).forEach((optLi, i) => {
        let optText = optLi.textContent.replace(/\s+/g, " ").trim();
        if (/\*/.test(optText)) {
          correctIndex = i;
          optText = optText.replace(/\*/g, "").trim();
        }
        // Also strip a stray "A)" a teacher might have typed on top of a real list
        const stray = optText.match(OPT_LINE_RE);
        if (stray) optText = stray[2];
        options[i] = optText;
        if (!(correctIndex >= 0) && isMostlyBold(optLi)) correctIndex = i;
      });
    } else {
      // No nested Word list — parse the question's own text the old way,
      // treating "A)"-style lines (typed as plain text) as options.
      // Split the already-annotation-stripped text, not the raw text,
      // so "Answer: C" etc. don't leak into an option's wording.
      const innerLines = questionText.split(/\n|(?=[A-Da-d][\.\)]\s)/);
      const textParts = [];
      innerLines.forEach((raw) => {
        const line = raw.trim();
        if (!line) return;
        const optMatch = line.match(OPT_LINE_RE);
        if (optMatch) {
          const letter = optMatch[1].toUpperCase();
          let optText = optMatch[2];
          if (/\*/.test(optText)) { correctIndex = letterToIndex(letter); optText = optText.replace(/\*/g, "").trim(); }
          const i = letterToIndex(letter);
          if (i >= 0) options[i] = optText;
        } else {
          textParts.push(line);
        }
      });
      questionText = textParts.join(" ").trim() || questionText;
    }

    return cleanQuestion({ text: questionText, options, correctIndex, type, dok }, idx);
  }

  function parseHtmlContent(html, fallbackPlainText) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const topLists = Array.from(doc.body.children).filter(el => /^(OL|UL)$/i.test(el.tagName));

    if (topLists.length === 0) {
      // Teacher didn't use Word's list feature at all — fall back to
      // treating the whole document as plain typed-number text.
      return parseTextContent(fallbackPlainText);
    }

    const questionLis = [];
    topLists.forEach((list) => {
      Array.from(list.children).forEach((li) => {
        if (li.tagName === "LI") questionLis.push(li);
      });
    });

    if (questionLis.length === 0) {
      return parseTextContent(fallbackPlainText);
    }

    return questionLis.map((li, idx) => parseQuestionLi(li, idx));
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
          const arrayBuffer = e.target.result;
          const htmlResult = await mammoth.convertToHtml(
            { arrayBuffer },
            { styleMap: ["b => strong", "i => em"] }
          );
          const rawResult = await mammoth.extractRawText({ arrayBuffer });
          resolve(parseHtmlContent(htmlResult.value, rawResult.value));
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
    // PDFs don't carry Word's list structure (numbering is typically
    // "printed" text or unrecoverable formatting), so this always uses
    // the plain-text parser — numbers/letters need to appear as real
    // characters in the PDF for this to work.
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
