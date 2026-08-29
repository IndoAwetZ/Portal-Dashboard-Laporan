const { chromium } = require('playwright');
const axios = require('axios');
const cron = require('node-cron');

async function sendTelegramAlert(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('Telegram Error:', err.message);
  }
}

async function checkMPDNViaPlaywright() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let isDone = false;

  try {
    await page.goto(process.env.MPDN_URL, { waitUntil: 'networkidle', timeout: 30000 });

    if (process.env.MPDN_USERNAME && process.env.MPDN_PASSWORD) {
      await page.fill('input[name="username"], input[type="text"]', process.env.MPDN_USERNAME);
      await page.fill('input[name="password"], input[type="password"]', process.env.MPDN_PASSWORD);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
        page.click('button[type="submit"]')
      ]);

      const now = new Date();
      const currentMonth = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      
      // Deteksi record bulan berjalan pada tabel rekapitulasi
      const count = await page.locator(`table tr:has-text("${currentMonth}")`).count();
      isDone = count > 0;
    }
  } catch (err) {
    console.error('[MPDN Checker Error]:', err.message);
  } finally {
    await browser.close();
  }
  return isDone;
}

async function runChecker(db) {
  console.log('[Auto-Check] Memulai verifikasi pelaporan...');
  const mpdnDone = await checkMPDNViaPlaywright();
  const status = mpdnDone ? 'SUDAH' : 'BELUM';

  return new Promise((resolve, reject) => {
    db.run(
      "UPDATE reports SET status = ?, last_checked = datetime('now', 'localtime') WHERE id = 'mpdn'",
      [status],
      async (err) => {
        if (err) return reject(err);

        // Jika tanggal mendekati deadline dan belum lapor, kirim notif
        const today = new Date().getDate();
        if (status === 'BELUM' && today >= 20) {
          await sendTelegramAlert(
            `⚠️ *Pengingat Laporan Prognas*\n\nLaporan *MPDN Kemenkes* periode bulan ini masih berstatus *BELUM DIINPUT*.\nMohon PIC segera menindaklanjuti.`
          );
        }
        resolve();
      }
    );
  });
}

// Jadwal Cron: Berjalan otomatis setiap hari pukul 08:00 WIB
cron.schedule('0 8 * * *', () => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./data.db');
  runChecker(db);
});

module.exports = { runChecker };