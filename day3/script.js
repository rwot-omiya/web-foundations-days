let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  const searchWord = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(searchWord));
}

function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  return notes.reduce((longest, note) =>
    note.text.length > longest.text.length ? note : longest,
  );
}

function countByCategory() {
  const counts = {};

  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }

  return counts;
}

function getSummary() {
  const counts = countByCategory();
  const noteWord = notes.length === 1 ? "note" : "notes";

  return `${notes.length} ${noteWord}: ${counts.personal || 0} personal, ${counts.work || 0} work, ${counts.study || 0} study.`;
}

function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();

  return notes.some((note) => note.text.trim().toLowerCase() === normalizedText);
}

function addNote(text, category) {
  const trimmedText = text.trim();
  const validCategories = ["personal", "work", "study"];

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log("Note not added: text must be 1–200 characters.");
    return false;
  }

  if (isDuplicate(trimmedText)) {
    console.log("Note not added: duplicate text.");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log("Note not added: invalid category.");
    return false;
  }

  const nextId = notes.length === 0 ? 1 : Math.max(...notes.map((note) => note.id)) + 1;
  notes.push({ id: nextId, text: trimmedText, category });
  return true;
}

// searchNotes normal case: [ { id: 2, text: "Finish the Day 3 assignment", category: "study" } ]
console.log("searchNotes('day 3'):", searchNotes("day 3"));
// searchNotes edge case: []
console.log("searchNotes('holiday'):", searchNotes("holiday"));

// longestNote normal case: { id: 3, text: "Email the project report to Grace", category: "work" }
console.log("longestNote():", longestNote());
// longestNote edge case: null
const notesBeforeLongestEdgeCase = notes;
notes = [];
console.log("longestNote() with no notes:", longestNote());
notes = notesBeforeLongestEdgeCase;

// countByCategory normal case: { personal: 2, study: 2, work: 1 }
console.log("countByCategory():", countByCategory());
// countByCategory edge case: {}
const notesBeforeCountEdgeCase = notes;
notes = [];
console.log("countByCategory() with no notes:", countByCategory());
notes = notesBeforeCountEdgeCase;

// getSummary normal case: "5 notes: 2 personal, 1 work, 2 study."
console.log("getSummary():", getSummary());
// getSummary edge case: "0 notes: 0 personal, 0 work, 0 study."
const notesBeforeSummaryEdgeCase = notes;
notes = [];
console.log("getSummary() with no notes:", getSummary());
notes = notesBeforeSummaryEdgeCase;

// isDuplicate normal case: true
console.log("isDuplicate('  BUY MILK AND BREAD  '):", isDuplicate("  BUY MILK AND BREAD  "));
// isDuplicate edge case: false
console.log("isDuplicate('Plan a holiday'):", isDuplicate("Plan a holiday"));

// addNote normal case: true, followed by a new note
console.log("addNote('Plan weekend hike', 'personal'):", addNote("Plan weekend hike", "personal"));
// addNote edge case: false because the text is a duplicate
console.log("addNote(' plan weekend hike ', 'personal'):", addNote(" plan weekend hike ", "personal"));
// Additional addNote validation: false because the category is invalid
console.log("addNote('Read a book', 'health'):", addNote("Read a book", "health"));
