require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { runChecker } = require('./cron-checker');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Gagal membuka database:', err.message);
  else console.log('Database SQLite terhubung.');
});

// Setup Tabel Default
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    name TEXT,
    category TEXT,
    description TEXT,
    pic TEXT,
    deadline_day INTEGER,
    status TEXT DEFAULT 'BELUM',
    portal_url TEXT,
    last_checked TEXT
  )`);

  // Seeding data awal jika masih kosong
  const initialReports = [
    {
      id: 'mpdn',
      name: 'MPDN Kemenkes',
      category: 'Kematian Maternal & Perinatal',
      description: 'Pelaporan notifikasi dan audit kematian ibu dan bayi.',
      pic: 'PONEK / Kebidanan',
      deadline_day: 25,
      status: 'BELUM',
      portal_url: 'https://mpdn.kemkes.go.id/masuk'
    },
    {
      id: 'sitb',
      name: 'SITB Online',
      category: 'Tuberkulosis',
      description: 'Sistem Informasi Tuberkulosis faskes dan hasil lab.',
      pic: 'Tim TB DOTS',
      deadline_day: 10,
      status: 'SUDAH',
      portal_url: 'https://sitb.kemkes.go.id'
    },
    {
      id: 'siha',
      name: 'SIHA 2.1',
      category: 'HIV / AIDS',
      description: 'Pencatatan konseling, testing HIV, dan pengobatan ART.',
      pic: 'Klinik VCT',
      deadline_day: 15,
      status: 'BELUM',
      portal_url: 'https://siha.kemkes.go.id'
    }
  ];

  initialReports.forEach(r => {
    db.run(
      `INSERT OR IGNORE INTO reports (id, name, category, description, pic, deadline_day, status, portal_url, last_checked) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
      [r.id, r.name, r.category, r.description, r.pic, r.deadline_day, r.status, r.portal_url]
    );
  });
});

// API: Ambil semua data status laporan
app.get('/api/reports', (req, res) => {
  db.all('SELECT * FROM reports', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Toggle Status Manual
app.post('/api/reports/:id/toggle', (req, res) => {
  const { id } = req.params;
  db.get('SELECT status FROM reports WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Laporan tidak ditemukan' });
    const newStatus = row.status === 'SUDAH' ? 'BELUM' : 'SUDAH';
    db.run(
      "UPDATE reports SET status = ?, last_checked = datetime('now', 'localtime') WHERE id = ?",
      [newStatus, id],
      () => res.json({ success: true, status: newStatus })
    );
  });
});

// API: Trigger Pengecekan Otomatis Langsung dari Dashboard
app.post('/api/check-now', async (req, res) => {
  try {
    await runChecker(db);
    res.json({ success: true, message: 'Pengecekan selesai dan status diperbarui!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server dashboard berjalan di http://localhost:${PORT}`);
});