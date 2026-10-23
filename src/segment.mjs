// 纯文字 → 章节分节
// 支持两种输入：
//   1) 带 "## 小标题" 标记的结构化文本（优先）
//   2) 一整篇纯段落：按空行分段，每 sectionSize 段合并为一节，
//      小标题取该节首句（截断到 ≤10 字），去标点

function cleanTitle(s) {
  const t = s
    .replace(/[，。！？；：、""''《》（）()【】\s]/g, "")
    .slice(0, 10);
  return t || "手记";
}

export function segmentText(text, { sectionSize = 2, maxTitle = 4 } = {}) {
  const marked = [...text.matchAll(/^##\s*(.+)\s*$/gm)];
  if (marked.length) {
    const sections = [];
    for (let i = 0; i < marked.length; i++) {
      const start = marked[i].index + marked[i][0].length;
      const end = i + 1 < marked.length ? marked[i + 1].index : text.length;
      const body = text.slice(start, end).trim();
      if (body) sections.push({ title: marked[i][1].trim(), text: body });
    }
    if (sections.length) return sections;
  }

  const paras = text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const sections = [];
  for (let i = 0; i < paras.length; i += sectionSize) {
    const chunk = paras.slice(i, i + sectionSize);
    const isFirst = sections.length === 0;
    const title = isFirst && paras.length > sectionSize
      ? cleanTitle(paras[0])
      : `小记${sections.length + 1}`;
    sections.push({ title, text: chunk.join("\n") });
  }

  // 标题不重复且总数不超上限
  const seen = new Set();
  sections.forEach((s, i) => {
    let t = s.title;
    if (seen.has(t)) t = `${t}${i + 1}`.slice(0, maxTitle + 2);
    seen.add(t);
    s.title = t;
  });
  return sections;
}
