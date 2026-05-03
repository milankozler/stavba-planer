// Plán party - server pro Render.com
// Render persistent disk je namontovaný na /data (nastavíme v dashboardu)

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || '777666123';

// Render: persistent disk se montuje na /data
// Lokálně: použijeme ./data složku
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}
const DATA_FILE = path.join(DATA_DIR, 'plan.json');

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_DATA = {
  workers: ['Novák', 'Svoboda', 'Procházka', 'Dvořák', 'Kovář', 'Horáček', 'Blažek'],
  stavby: [
    { name: 'Stavba A', color: '#d4a800' },
    { name: 'Stavba B', color: '#2d6a4f' },
    { name: 'Stavba C', color: '#c0392b' }
  ],
  // assignments: { "0_2026-05-04": { am: 0, pm: 1 } }
  assignments: {},
  // todos: [{ id, text, done, createdAt, doneAt, assignees: [string] }]
  todos: [],
  // Oddělený seznam řešitelů úkolů (nezávislý na workers v plánu)
  // assignees: ['Honza', 'Pavel', ...]
  assignees: []
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!Array.isArray(data.todos)) data.todos = [];
      if (!Array.isArray(data.assignees)) data.assignees = [];
      // Migrace: doplň assignees:[] do existujících todos
      data.todos.forEach(t => {
        if (!Array.isArray(t.assignees)) t.assignees = [];
      });
      return data;
    }
  } catch (e) {
    console.error('Chyba při čtení dat:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── PLÁN ENDPOINTY ────────────────────────────────────────

// Veřejně: čtení dat (plán + todos)
app.get('/api/data', (req, res) => {
  res.json(loadData());
});

// Chráněně: uložení plánu (workers, stavby, assignments)
// POZOR: NEPŘEPISUJE todos - ty mají vlastní endpointy a běží paralelně
app.post('/api/save', (req, res) => {
  const { password, data } = req.body || {};
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Špatné heslo' });
  }
  if (!data || !Array.isArray(data.workers) || !Array.isArray(data.stavby) || typeof data.assignments !== 'object') {
    return res.status(400).json({ error: 'Neplatná data' });
  }
  try {
    const current = loadData();
    const merged = {
      workers: data.workers,
      stavby: data.stavby,
      assignments: data.assignments,
      todos: current.todos || [],
      assignees: current.assignees || []
    };
    saveData(merged);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Chyba při ukládání: ' + e.message });
  }
});

// Ověření hesla bez zápisu
app.post('/api/verify', (req, res) => {
  const { password } = req.body || {};
  if (password === PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Špatné heslo' });
  }
});

// ─── TODO ENDPOINTY ────────────────────────────────────────

// Veřejně: přidat úkol (s volitelnými řešiteli)
app.post('/api/todos/add', (req, res) => {
  const { text, assignees } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Prázdný text úkolu' });
  }
  try {
    const data = loadData();
    if (!Array.isArray(data.todos)) data.todos = [];
    if (data.todos.length >= 100) {
      return res.status(400).json({ error: 'Příliš mnoho úkolů (max 100)' });
    }
    // Sanitize assignees: pole stringů, max 10
    let cleanAssignees = [];
    if (Array.isArray(assignees)) {
      cleanAssignees = assignees
        .filter(a => typeof a === 'string' && a.trim())
        .map(a => a.trim().slice(0, 60))
        .slice(0, 10);
      // Dedupe
      cleanAssignees = [...new Set(cleanAssignees)];
    }
    const todo = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text.trim().slice(0, 300),
      done: false,
      createdAt: new Date().toISOString(),
      assignees: cleanAssignees
    };
    data.todos.push(todo);
    saveData(data);
    res.json({ ok: true, todo });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// Veřejně: přepnout done
app.post('/api/todos/toggle', (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Chybí ID' });
  try {
    const data = loadData();
    const todo = (data.todos || []).find(t => t.id === id);
    if (!todo) return res.status(404).json({ error: 'Úkol nenalezen' });
    todo.done = !todo.done;
    todo.doneAt = todo.done ? new Date().toISOString() : null;
    saveData(data);
    res.json({ ok: true, todo });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// Chráněně: smazat úkol
app.post('/api/todos/delete', (req, res) => {
  const { password, id } = req.body || {};
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Špatné heslo' });
  }
  if (!id) return res.status(400).json({ error: 'Chybí ID' });
  try {
    const data = loadData();
    data.todos = (data.todos || []).filter(t => t.id !== id);
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// Chráněně: editovat text úkolu
app.post('/api/todos/edit', (req, res) => {
  const { password, id, text } = req.body || {};
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Špatné heslo' });
  }
  if (!id || !text || !text.trim()) {
    return res.status(400).json({ error: 'Chybí ID nebo text' });
  }
  try {
    const data = loadData();
    const todo = (data.todos || []).find(t => t.id === id);
    if (!todo) return res.status(404).json({ error: 'Úkol nenalezen' });
    todo.text = text.trim().slice(0, 300);
    saveData(data);
    res.json({ ok: true, todo });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// Chráněně: smazat všechny dokončené
app.post('/api/todos/clearDone', (req, res) => {
  const { password } = req.body || {};
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Špatné heslo' });
  }
  try {
    const data = loadData();
    data.todos = (data.todos || []).filter(t => !t.done);
    saveData(data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// Veřejně: aktualizovat řešitele konkrétního úkolu
app.post('/api/todos/setAssignees', (req, res) => {
  const { id, assignees } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Chybí ID' });
  if (!Array.isArray(assignees)) return res.status(400).json({ error: 'assignees musí být pole' });
  try {
    const data = loadData();
    const todo = (data.todos || []).find(t => t.id === id);
    if (!todo) return res.status(404).json({ error: 'Úkol nenalezen' });
    let clean = assignees
      .filter(a => typeof a === 'string' && a.trim())
      .map(a => a.trim().slice(0, 60))
      .slice(0, 10);
    clean = [...new Set(clean)];
    todo.assignees = clean;
    saveData(data);
    res.json({ ok: true, todo });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// ─── ASSIGNEES (seznam řešitelů) ENDPOINTY ────────────────

// Chráněně: přidat řešitele do seznamu
app.post('/api/assignees/add', (req, res) => {
  const { password, name } = req.body || {};
  if (password !== PASSWORD) return res.status(401).json({ error: 'Špatné heslo' });
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Prázdné jméno' });
  }
  const clean = name.trim().slice(0, 60);
  try {
    const data = loadData();
    if (!Array.isArray(data.assignees)) data.assignees = [];
    if (data.assignees.length >= 50) {
      return res.status(400).json({ error: 'Maximálně 50 řešitelů' });
    }
    if (data.assignees.some(a => a.toLowerCase() === clean.toLowerCase())) {
      return res.status(400).json({ error: 'Toto jméno už v seznamu je' });
    }
    data.assignees.push(clean);
    saveData(data);
    res.json({ ok: true, name: clean, assignees: data.assignees });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

// Chráněně: odebrat řešitele ze seznamu
// POZOR: stávající úkoly s tímto řešitelem si jméno zachovají (historie)
app.post('/api/assignees/remove', (req, res) => {
  const { password, name } = req.body || {};
  if (password !== PASSWORD) return res.status(401).json({ error: 'Špatné heslo' });
  if (!name) return res.status(400).json({ error: 'Chybí jméno' });
  try {
    const data = loadData();
    data.assignees = (data.assignees || []).filter(a => a !== name);
    saveData(data);
    res.json({ ok: true, assignees: data.assignees });
  } catch (e) {
    res.status(500).json({ error: 'Chyba: ' + e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Plán party běží na portu ${PORT}, data v ${DATA_FILE}`);
});
