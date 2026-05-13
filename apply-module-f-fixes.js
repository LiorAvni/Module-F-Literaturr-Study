const fs = require("fs");
const path = require("path");

const appPath = path.join(process.cwd(), "app.js");

if (!fs.existsSync(appPath)) {
  console.error("Could not find app.js in this folder. Put this script in the same folder as app.js, then run: node apply-module-f-fixes.js");
  process.exit(1);
}

let source = fs.readFileSync(appPath, "utf8");

function extractObjectLiteral(src, marker) {
  const markerIndex = src.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Could not find ${marker}`);

  const start = src.indexOf("{", markerIndex);
  if (start === -1) throw new Error(`Could not find opening { after ${marker}`);

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = start; i < src.length; i++) {
    const ch = src[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return { start, end: i + 1, literal: src.slice(start, i + 1) };
    }
  }

  throw new Error(`Could not find closing } for ${marker}`);
}

function sectionTitleFor(slug, index) {
  if (slug === "a-summers-reading") return "What your answer must include:";
  if (slug === "mr-know-all") return "Your answer must include:";
  if (slug === "the-road-not-taken") return index === 3 ? "In your answer:" : "What your answer should include:";
  return "What your answer needs:";
}

function organizeQuestionPools(pieces) {
  Object.entries(pieces).forEach(([slug, piece]) => {
    if (!Array.isArray(piece.questions)) return;

    piece.questions = piece.questions.map((item, index) => {
      if (Array.isArray(item.sections)) return item;

      return {
        q: item.q,
        sections: [
          {
            title: sectionTitleFor(slug, index),
            bullets: Array.isArray(item.e) ? item.e : []
          }
        ]
      };
    });
  });
}

const fixedQuestionRenderer = `function defaultExpectedTitle(piece) {
  if (piece.title === "Rules of the Game") return "What your answer needs:";
  if (piece.title === "The Road Not Taken") return "What your answer should include:";
  if (piece.title === "Mr. Know-All") return "Your answer must include:";
  return "What your answer must include:";
}

function renderExpectedBullet(bullet) {
  if (typeof bullet === "string") {
    return \`<li>\${escapeHtml(bullet)}</li>\`;
  }

  if (bullet && typeof bullet === "object") {
    const children = Array.isArray(bullet.children) && bullet.children.length
      ? \`<ul class="nested-expected-list">\${bullet.children.map(child => \`<li>\${escapeHtml(child)}</li>\`).join("")}</ul>\`
      : "";

    return \`<li><span>\${escapeHtml(bullet.text || "")}</span>\${children}</li>\`;
  }

  return "";
}

function renderExpectedSections(item, piece) {
  if (Array.isArray(item.sections)) {
    return item.sections.map(section => \`
      <div class="expected-section">
        <div class="expected-title">\${escapeHtml(section.title)}</div>
        \${Array.isArray(section.bullets) && section.bullets.length
          ? \`<ul>\${section.bullets.map(renderExpectedBullet).join("")}</ul>\`
          : ""}
      </div>
    \`).join("");
  }

  return \`
    <div class="expected-section">
      <div class="expected-title">\${escapeHtml(item.expectedTitle || defaultExpectedTitle(piece))}</div>
      <ul>\${(item.e || []).map(renderExpectedBullet).join("")}</ul>
    </div>
  \`;
}

function renderQuestions(piece, slug) {
  page.innerHTML = titleBlock(piece, \`Question pool: \${piece.questions.length} questions\`) + sectionTabs(slug, "questions") + \`
    <div class="notice"><strong>How to use:</strong> practice each question with one clear claim, at least one story example, and an explanation of why the example proves your answer.</div>
    \${piece.questions.map((item, i) => \`
      <article class="question-card" id="q-\${i + 1}">
        <span class="tag">Question \${i + 1}</span>
        <h3>\${escapeHtml(item.q)}</h3>
        <div class="expected">
          \${renderExpectedSections(item, piece)}
        </div>
      </article>
    \`).join("")}
  \`;
}
`;

function replaceQuestionRenderer(src) {
  const start = src.indexOf("function renderQuestions(piece, slug)");
  if (start === -1) throw new Error("Could not find renderQuestions function");

  const end = src.indexOf("function renderStrategy", start);
  if (end === -1) throw new Error("Could not find renderStrategy after renderQuestions");

  return src.slice(0, start) + fixedQuestionRenderer + src.slice(end);
}

try {
  const extracted = extractObjectLiteral(source, "const pieces =");
  const pieces = JSON.parse(extracted.literal);
  organizeQuestionPools(pieces);

  const newPiecesCode = "const pieces = " + JSON.stringify(pieces, null, 2) + ";";
  source = source.slice(0, source.indexOf("const pieces =")) + newPiecesCode + source.slice(extracted.end + 1);
  source = replaceQuestionRenderer(source);

  fs.writeFileSync(appPath + ".bak", fs.readFileSync(appPath, "utf8"));
  fs.writeFileSync(appPath, source);

  console.log("Done. app.js was fixed and a backup was saved as app.js.bak");
  console.log("Now refresh the website with Ctrl+F5 / Cmd+Shift+R.");
} catch (err) {
  console.error("Fix failed:", err.message);
  process.exit(1);
}
