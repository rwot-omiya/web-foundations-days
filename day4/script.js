const noteText = document.querySelector("#note-text");
const charCount = document.querySelector("#char-count");
const wordCount = document.querySelector("#word-count");
const clearButton = document.querySelector("#clear-btn");
const themeToggle = document.querySelector("#theme-toggle");
const body = document.body;

const DRAFT_KEY = "day4-note-draft";
const THEME_KEY = "day4-theme";
const MAX_CHARACTERS = 200;

function updateCounts() {
  const text = noteText.value;
  const characters = text.length;
  const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

  charCount.textContent = `${characters} / ${MAX_CHARACTERS} characters`;
  wordCount.textContent = `${words} words`;
  charCount.classList.toggle("warning", characters > 180 && characters <= MAX_CHARACTERS);
  charCount.classList.toggle("over", characters > MAX_CHARACTERS);
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, noteText.value);
}

function clearNote() {
  noteText.value = "";
  updateCounts();
  localStorage.removeItem(DRAFT_KEY);
}

function updateThemeLabel() {
  themeToggle.textContent = body.classList.contains("dark") ? "Light mode" : "Dark mode";
}

noteText.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

clearButton.addEventListener("click", clearNote);

themeToggle.addEventListener("click", () => {
  body.classList.toggle("dark");
  const theme = body.classList.contains("dark") ? "dark" : "light";
  localStorage.setItem(THEME_KEY, theme);
  updateThemeLabel();
});

noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});

const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft !== null) {
  noteText.value = savedDraft;
}

if (localStorage.getItem(THEME_KEY) === "dark") {
  body.classList.add("dark");
}

updateThemeLabel();
updateCounts();
