// Chat – ChatGPT-like Experience
// - Streaming assistant responses
// - Typing indicator
// - Code blocks with copy button
// - Theme toggle persisted to localStorage

const dom = {
  html: document.documentElement,
  messages: document.getElementById("messages"),
  form: document.getElementById("composerForm"),
  input: document.getElementById("messageInput"),
  send: document.getElementById("sendButton"),
  typing: document.getElementById("typing"),
  themeToggle: document.getElementById("themeToggle"),
};

// --- Theme ---
const THEME_KEY = "chat_theme"; // "light" | "dark"
function applyStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    dom.html.setAttribute("data-theme", stored);
    return;
  }
  // fallback to system preference
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  dom.html.setAttribute("data-theme", prefersLight ? "light" : "dark");
}

applyStoredTheme();
dom.themeToggle.addEventListener("click", () => {
  const current = dom.html.getAttribute("data-theme") === "light" ? "dark" : "light";
  dom.html.setAttribute("data-theme", current);
  localStorage.setItem(THEME_KEY, current);
});

// --- Helpers ---
function escapeHTML(input) {
  return input
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
    .replaceAll(/"/g, "&quot;")
    .replaceAll(/'/g, "&#039;");
}

function toParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map(p => `<p>${p.replaceAll("\n", "<br>")}</p>`) // keep single newlines
    .join("");
}

function renderWithBackticksMarkdown(raw) {
  // Minimal parsing for code fences ```lang\n...```, then inline `code`
  // Strategy: convert fences first, then inline
  let html = "";
  let remaining = raw;
  const fenceRe = /```(\w+)?\n([\s\S]*?)```/gm;
  let lastIndex = 0;
  for (const match of raw.matchAll(fenceRe)) {
    const idx = match.index ?? 0;
    const before = raw.slice(lastIndex, idx);
    html += toParagraphs(escapeHTML(before).replace(/`([^`]+)`/g, '<code>$1</code>'));
    const lang = match[1] ? `language-${escapeHTML(match[1])}` : "";
    const code = escapeHTML(match[2]);
    html += `<pre><button class="copy-btn" data-copy>Copy</button><code class="${lang}">${code}</code></pre>`;
    lastIndex = idx + match[0].length;
  }
  const tail = raw.slice(lastIndex);
  html += toParagraphs(escapeHTML(tail).replace(/`([^`]+)`/g, '<code>$1</code>'));
  return html;
}

function createMessageElement(role, content) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "assistant" ? "AI" : "You";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = renderWithBackticksMarkdown(content);

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  return wrapper;
}

function appendMessage(role, content, { scroll = true } = {}) {
  const el = createMessageElement(role, content);
  dom.messages.appendChild(el);
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "end" });
  return el;
}

function showTyping(show) {
  dom.typing.classList.toggle("hidden", !show);
}

// Auto-resize textarea
function autoresize() {
  dom.input.style.height = "auto";
  dom.input.style.height = Math.min(dom.input.scrollHeight, 200) + "px";
}
dom.input.addEventListener("input", autoresize);
setTimeout(autoresize, 0);

// Submit on Enter, newline on Shift+Enter
dom.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    dom.form.requestSubmit();
  }
});

// Copy to clipboard (event delegation)
dom.messages.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const pre = btn.closest('pre');
  const code = pre?.querySelector('code');
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code.textContent || "");
    const prev = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = prev; }, 1200);
  } catch (err) {
    console.error("Copy failed", err);
  }
});

// Simple mock assistant to simulate streaming
function buildAssistantReply(userText) {
  const trimmed = userText.trim();
  if (!trimmed) return "";
  const lines = [
    "Thanks for your message! Here's a simulated response.",
  ];
  if (/code|snippet|example/i.test(trimmed)) {
    lines.push("\nHere's a quick code example:");
    lines.push("\n```javascript\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\nconsole.log(greet('World'));\n```\n");
  } else {
    lines.push(`\nYou said: \n\n${trimmed}`);
    lines.push("\nWhat would you like to try next?");
  }
  return lines.join("\n");
}

async function streamAssistantResponse(fullText, containerBubble) {
  // Stream raw text first; when done, render markdown for code blocks
  const chars = Array.from(fullText);
  const chunkSize = 2; // characters per tick
  const delayMs = 12; // typing speed
  let buffer = "";
  for (let i = 0; i < chars.length; i += chunkSize) {
    buffer += chars.slice(i, i + chunkSize).join("");
    containerBubble.textContent = buffer;
    containerBubble.scrollIntoView({ block: "end" });
    await new Promise(r => setTimeout(r, delayMs));
  }
  // Replace with parsed HTML once streaming is complete
  containerBubble.innerHTML = renderWithBackticksMarkdown(fullText);
}

dom.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = dom.input.value;
  if (!text.trim()) return;

  appendMessage("user", text);
  dom.input.value = "";
  autoresize();

  showTyping(true);

  // Prepare assistant message container with empty bubble to stream into
  const wrapper = document.createElement("div");
  wrapper.className = "message assistant";
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "AI";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = "";
  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  dom.messages.appendChild(wrapper);
  wrapper.scrollIntoView({ behavior: "smooth", block: "end" });

  const reply = buildAssistantReply(text);
  try {
    await streamAssistantResponse(reply, bubble);
  } finally {
    showTyping(false);
  }
});

// Greet on load
appendMessage(
  "assistant",
  "Hi! I’m your demo AI. Ask me anything, or request a code example."
);


