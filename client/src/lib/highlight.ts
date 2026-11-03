export type Token = { text: string; kind: "plain" | "string" | "keyword" | "function" | "number" };

const KEYWORDS = new Set([
  "if", "elif", "else", "for", "while", "in", "def", "return", "and", "or", "not", "class", "import", "from",
  "True", "False", "None", "let", "const", "var", "function", "true", "false", "null", "undefined",
]);
const FUNCTIONS = new Set(["print", "len", "int", "str", "float", "bool", "type", "range", "input", "console", "log"]);

// Textos entre comillas, números o palabras
const PATTERN = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

// Parte una línea de código en pedazos, cada uno con su tipo, para pintarlos de distinto color
export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of line.matchAll(PATTERN)) {
    const [text, str, num, word] = match;
    if (match.index > last) tokens.push({ text: line.slice(last, match.index), kind: "plain" });
    let kind: Token["kind"] = "plain";
    if (str) kind = "string";
    else if (num) kind = "number";
    else if (word && KEYWORDS.has(word)) kind = "keyword";
    else if (word && FUNCTIONS.has(word)) kind = "function";
    tokens.push({ text, kind });
    last = match.index + text.length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), kind: "plain" });
  return tokens;
}