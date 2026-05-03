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
  // am/pm = index stavby, null/undefined = volno
  assignments: {}
};

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Chyba při čtení dat:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Veřejně: čtení dat
app.get('/api/data', (req, res) => {
  res.json(loadData());
});

// Chráněně: uložení dat
app.post('/api/save', (req, res) => {
  const { password, data } = req.body || {};
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Špatné heslo' });
  }
  if (!data || !Array.isArray(data.workers) || !Array.isArray(data.stavby) || typeof data.assignments !== 'object') {
    return res.status(400).json({ error: 'Neplatná data' });
  }
  try {
    saveData(data);
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

app.listen(PORT, () => {
  console.log(`Plán party běží na portu ${PORT}, data v ${DATA_FILE}`);
});
