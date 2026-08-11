/* ============================================================
   QUIZHUB — Document upload parser
   Lets a teacher upload an Excel/CSV sheet or a Word/text document
   of questions instead of hand-typing JSON. Converts either format
   into the same question object shape the rest of the app expects.
   ============================================================ */

const DocUpload = (() => {

  function cleanQuestion(q, idx) {
    const text = String(q.text || "").trim();
    const options = [0, 1, 2, 3].map(i => String(q.options?.[i] ?? "").trim());
    if (!text) throw new Error(`Question ${idx + 1} is missing its question text.`);
    if (options.some(o => !o)) throw new Error(`Question ${idx + 1} needs all 4 options filled in.`);
    let correctIndex = Number(q.correctIndex);
    if (!(correctIndex >= 0 && correctIndex <= 3)) {
      throw new Error(`Question ${idx + 1}'s answer letter/column didn't match A–D. Check it and try again.`);
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
    const n = Number(s);
    if (Number.isInteger(n) && n >= 0 && n <= 3) return n;      // already 0-based
    if (Number.isInteger(n) && n >= 1 && n <= 4) return n - 1;  // 1-based
    return NaN;
  }

  /* ---------------- Excel / CSV ---------------- */
  // Expected columns (header row, any casing/order):
  // Question | Option A | Option B | Option C | Option D | Answer | Type | DOK

  function parseWorkbookFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (rows.length === 0) throw new Error("The sheet has no data rows.");

          const findCol = (row, ...names) => {
            const keys = Object.keys(row);
            for (const name of names) {
              const hit = keys.find(k => k.trim().toLowerCase() === name);
              if (hit) return hit;
            }
            return null;
          };

          const questions = rows.map((row, i) => {
            const qCol = findCol(row, "question", "question text");
            const aCol = findCol(row, "option a", "a");
            const bCol = findCol(row, "option b", "b");
            const cCol = findCol(row, "option c", "c");
            const dCol = findCol(row, "option d", "d");
            const ansCol = findCol(row, "answer", "correct answer", "correct");
            const typeCol = findCol(row, "type");
            const dokCol = findCol(row, "dok", "dok level");

            return cleanQuestion({
              text: qCol ? row[qCol] : "",
              options: [aCol, bCol, cCol, dCol].map(c => c ? row[c] : ""),
              correctIndex: letterToIndex(ansCol ? row[ansCol] : ""),
              type: typeCol ? row[typeCol] : "noncalc",
              dok: dokCol ? row[dokCol] : 1
            }, i);
          });

          resolve(questions);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsArrayBuffer(file);
    });
  }

  function downloadExcelTemplate() {
    const sample = [
      {
        Question: "Normal profit is best described as:",
        "Option A": "The minimum reward needed to keep a firm's resources in their present use",
        "Option B": "Any profit earned above total cost",
        "Option C": "A loss incurred in the short run",
        "Option D": "Profit that only exists in monopoly markets",
        Answer: "A",
        Type: "noncalc",
        DOK: 1
      }
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws["!cols"] = [{ wch: 40 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 8 }, { wch: 10 }, { wch: 6 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "quizhub_question_template.xlsx");
  }

  /* ---------------- Word (.docx) / plain text ---------------- */
  // Expected pattern, one question per block, blank line between blocks:
  //
  // 1. Question text goes here?
  // A. First option
  // B. Second option
  // C. Third option
  // D. Fourth option
  // Answer: B
  // Type: calc
  // DOK: 3

  function parseTextContent(rawText) {
    const blocks = rawText
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n/)
      .map(b => b.trim())
      .filter(Boolean);

    if (blocks.length === 0) throw new Error("No questions found in that document.");

    return blocks.map((block, i) => {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      const optionLines = { A: "", B: "", C: "", D: "" };
      let answer = "", type = "noncalc", dok = "1";
      const textLines = [];

      lines.forEach(line => {
        const optMatch = line.match(/^([A-D])[\.\)]\s*(.+)$/i);
        const ansMatch = line.match(/^answer\s*[:\-]\s*(.+)$/i);
        const typeMatch = line.match(/^type\s*[:\-]\s*(.+)$/i);
        const dokMatch = line.match(/^dok\s*[:\-]\s*(.+)$/i);

        if (optMatch) {
          optionLines[optMatch[1].toUpperCase()] = optMatch[2].trim();
        } else if (ansMatch) {
          answer = ansMatch[1].trim();
        } else if (typeMatch) {
          type = typeMatch[1].trim();
        } else if (dokMatch) {
          dok = dokMatch[1].trim();
        } else {
          // strip a leading "1." / "Q1." style question number
          textLines.push(line.replace(/^(?:Q\.?\s*)?\d+[\.\)]\s*/i, ""));
        }
      });

      return cleanQuestion({
        text: textLines.join(" ").trim(),
        options: [optionLines.A, optionLines.B, optionLines.C, optionLines.D],
        correctIndex: letterToIndex(answer),
        type, dok
      }, i);
    });
  }

  function parseDocxFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (typeof mammoth === "undefined") {
            throw new Error("The document reader library didn't load — check your internet connection and try again.");
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

  function parseTxtFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(parseTextContent(e.target.result));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.readAsText(file);
    });
  }

  async function parsePdfFile(file) {
    if (typeof pdfjsLib === "undefined") {
      throw new Error("The PDF reader library didn't load — check your internet connection and try again.");
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // pdf.js strips line breaks; item.hasEOL marks the end of a visual line,
      // which we need to tell questions/options apart.
      let pageText = "";
      content.items.forEach((item) => {
        pageText += item.str + (item.hasEOL ? "\n" : " ");
      });
      text += pageText + "\n";
    }
    return parseTextContent(text);
  }

  async function parseAnyFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
      return parseWorkbookFile(file);
    }
    if (name.endsWith(".docx")) {
      return parseDocxFile(file);
    }
    if (name.endsWith(".pdf")) {
      return parsePdfFile(file);
    }
    if (name.endsWith(".txt")) {
      return parseTxtFile(file);
    }
    throw new Error("Please upload a .xlsx, .csv, .docx, .pdf, or .txt file.");
  }

  return { parseAnyFile, parseTextContent, downloadExcelTemplate };
})();
