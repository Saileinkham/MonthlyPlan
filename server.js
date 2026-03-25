const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3030;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const FILES = {
  schedules: path.join(DATA_DIR, 'schedules.json'),
  jobs: path.join(DATA_DIR, 'jobs.json'),
  holidays: path.join(DATA_DIR, 'holidays.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  notified: path.join(DATA_DIR, 'notified.json'),
};

const DEFAULTS = {
  schedules: [],
  jobs: [],
  holidays: [],
  settings: {
    discordWebhook: '',
    notifyBeforeMinutes: 60,
    timezone: 'Asia/Bangkok',
    githubToken: '',
    githubRepo: '',
    googleAIKey: '',
    theme: 'dark'
  },
  notified: {}
};

Object.entries(FILES).forEach(([key, p]) => {
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(DEFAULTS[key], null, 2));
});

const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return Array.isArray(DEFAULTS[path.basename(f, '.json')]) ? [] : {}; } };
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// ── SCHEDULES ──────────────────────────────────────────────────
app.get('/api/schedules', (req, res) => res.json(read(FILES.schedules)));

app.post('/api/schedules', (req, res) => {
  const list = read(FILES.schedules);
  const item = { id: uuidv4(), createdAt: new Date().toISOString(), ...req.body };
  list.push(item);
  write(FILES.schedules, list);
  res.json(item);
});

app.put('/api/schedules/:id', (req, res) => {
  const list = read(FILES.schedules);
  const i = list.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  list[i] = { ...list[i], ...req.body };
  write(FILES.schedules, list);
  res.json(list[i]);
});

app.delete('/api/schedules/:id', (req, res) => {
  write(FILES.schedules, read(FILES.schedules).filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ── JOBS ──────────────────────────────────────────────────────
app.get('/api/jobs', (req, res) => res.json(read(FILES.jobs)));

app.post('/api/jobs', (req, res) => {
  const list = read(FILES.jobs);
  const item = { id: uuidv4(), createdAt: new Date().toISOString(), completedTasks: {}, ...req.body };
  list.push(item);
  write(FILES.jobs, list);
  res.json(item);
});

app.put('/api/jobs/:id', (req, res) => {
  const list = read(FILES.jobs);
  const i = list.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  list[i] = { ...list[i], ...req.body };
  write(FILES.jobs, list);
  res.json(list[i]);
});

app.delete('/api/jobs/:id', (req, res) => {
  write(FILES.jobs, read(FILES.jobs).filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ── HOLIDAYS ──────────────────────────────────────────────────
app.get('/api/holidays', (req, res) => res.json(read(FILES.holidays)));

app.post('/api/holidays', (req, res) => {
  const list = read(FILES.holidays);
  const item = { id: uuidv4(), createdAt: new Date().toISOString(), ...req.body };
  list.push(item);
  write(FILES.holidays, list);
  res.json(item);
});

app.put('/api/holidays/:id', (req, res) => {
  const list = read(FILES.holidays);
  const i = list.findIndex(x => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Not found' });
  list[i] = { ...list[i], ...req.body };
  write(FILES.holidays, list);
  res.json(list[i]);
});

app.delete('/api/holidays/:id', (req, res) => {
  write(FILES.holidays, read(FILES.holidays).filter(x => x.id !== req.params.id));
  res.json({ ok: true });
});

// ── SETTINGS ──────────────────────────────────────────────────
app.get('/api/settings', (req, res) => res.json(read(FILES.settings)));

app.put('/api/settings', (req, res) => {
  const current = read(FILES.settings);
  const merged = { ...current, ...req.body };
  write(FILES.settings, merged);
  res.json(merged);
});

// ── DISCORD TEST ──────────────────────────────────────────────
app.post('/api/discord/test', async (req, res) => {
  const settings = read(FILES.settings);
  if (!settings.discordWebhook) return res.status(400).json({ error: 'No webhook configured' });
  try {
    await sendDiscord(settings.discordWebhook, {
      embeds: [{
        title: '✅ Monthly Plan — ทดสอบการเชื่อมต่อ',
        description: 'Discord notification ทำงานปกติ!',
        color: 0x7C3AED,
        timestamp: new Date().toISOString()
      }]
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GITHUB PROXY ──────────────────────────────────────────────
app.get('/api/github/commits', async (req, res) => {
  const settings = read(FILES.settings);
  if (!settings.githubRepo) return res.json([]);
  try {
    const headers = {};
    if (settings.githubToken) headers['Authorization'] = `Bearer ${settings.githubToken}`;
    const r = await axios.get(`https://api.github.com/repos/${settings.githubRepo}/commits?per_page=5`, { headers });
    res.json(r.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI SUGGESTION ─────────────────────────────────────────────
app.post('/api/ai/suggest', async (req, res) => {
  const settings = read(FILES.settings);
  if (!settings.googleAIKey) return res.status(400).json({ error: 'กรุณาตั้งค่า Google AI Key ก่อน' });

  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const prompt = `You are a productivity assistant. Based on the job title "${title}", suggest a checklist of 3-7 specific, actionable sub-tasks in Thai language. Return ONLY a JSON array of strings. Example: ["task 1", "task 2"]`;

    const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.googleAIKey}`, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });

    const text = r.data.candidates[0].content.parts[0].text;
    const suggestions = JSON.parse(text);
    res.json({ suggestions });
  } catch (e) {
    console.error('AI Suggestion Error:', e.response ? e.response.data : e.message);
    res.status(500).json({ error: 'ไม่สามารถติดต่อ AI ได้ หรือ API Key ไม่ถูกต้อง' });
  }
});

// ── DISCORD SENDER ────────────────────────────────────────────
async function sendDiscord(webhook, payload) {
  await axios.post(webhook, payload, { headers: { 'Content-Type': 'application/json' } });
}

// ── CRON: Notify every minute ─────────────────────────────────
cron.schedule('* * * * *', async () => {
  const settings = read(FILES.settings);
  if (!settings.discordWebhook) return;

  const notified = read(FILES.notified);
  
  // Current UTC time
  const nowUtc = new Date().getTime();
  // Current time in Bangkok for string comparison
  const bangkokNow = new Date(nowUtc + (3600000 * 7));

  const notifyUnit = settings.notifyUnit || 'minutes';
  const notifyTime = settings.notifyTime || '08:00';
  const pad = n => String(n).padStart(2, '0');

  function shouldNotify(taskDateStr, taskTime) {
    if (notifyUnit === 'days') {
      // Notify N days before at specific time
      const taskDate = new Date(`${taskDateStr}T00:00:00+07:00`);
      const nDays = settings.notifyBefore || 1;
      const notifyDate = new Date(taskDate.getTime() - nDays * 86400000);
      const nStr = `${notifyDate.getFullYear()}-${pad(notifyDate.getMonth()+1)}-${pad(notifyDate.getDate())}`;
      const todayStr = `${bangkokNow.getFullYear()}-${pad(bangkokNow.getMonth()+1)}-${pad(bangkokNow.getDate())}`;
      const nowTime = `${pad(bangkokNow.getHours())}:${pad(bangkokNow.getMinutes())}`;
      return nStr === todayStr && nowTime === notifyTime;
    } else {
      // Notify N minutes/hours before task time
      if (!taskTime) return false;
      const taskMs = new Date(`${taskDateStr}T${taskTime}:00+07:00`).getTime();
      const diffMin = Math.round((taskMs - nowUtc) / 60000);
      const targetMin = settings.notifyBeforeMinutes || 60;
      return diffMin === targetMin;
    }
  }

  function getNotifyLabel() {
    const n = settings.notifyBefore || (settings.notifyBeforeMinutes / (settings.notifyUnit === 'hours' ? 60 : 1)) || 1;
    const units = { minutes: 'นาที', hours: 'ชั่วโมง', days: 'วัน' };
    return `${n} ${units[notifyUnit] || 'นาที'}`;
  }

  // Check schedules
  const schedules = read(FILES.schedules);
  for (const s of schedules) {
    if (!s.discordNotify) continue;
    for (const dateStr of (s.dates || [])) {
      if (!shouldNotify(dateStr, s.time)) continue;
      const key = `s_${s.id}_${dateStr}`;
      if (notified[key]) continue;
      notified[key] = new Date().toISOString();
      write(FILES.notified, notified);

      const timeRange = s.endTime ? `${s.time || '-'} - ${s.endTime}` : (s.time || '-');
      const dayObjs = (s.objectives && s.objectives[dateStr]) || [];
      const completedObjs = (s.completedObjectives && s.completedObjectives[dateStr]) || [];
      const objText = dayObjs.length
        ? '\n\n**Objectives:**\n' + dayObjs.map((o, i) => `${completedObjs.includes(i) ? '✅' : '⬜'} ${o}`).join('\n')
        : '';

      await sendDiscord(settings.discordWebhook, {
        embeds: [{
          title: `📋 ${s.title}`,
          description: `⏰ เวลา **${timeRange}** น.\n📍 สาขา: **${s.branch || '-'}**\n📅 วันที่: **${dateStr}**${objText}`,
          color: parseInt((s.color || '#7C3AED').replace('#', ''), 16),
          footer: { text: `แจ้งเตือนล่วงหน้า ${getNotifyLabel()}` },
          timestamp: new Date().toISOString()
        }]
      }).catch(console.error);
    }
  }

  // Check jobs
  const jobs = read(FILES.jobs);
  for (const j of jobs) {
    if (!j.discordNotify) continue;
    const allDates = getJobDatesForMonth(j, bangkokNow.getFullYear(), bangkokNow.getMonth());
    for (const dateStr of allDates) {
      if (!shouldNotify(dateStr, j.time)) continue;
      const key = `j_${j.id}_${dateStr}`;
      if (notified[key]) continue;
      notified[key] = new Date().toISOString();
      write(FILES.notified, notified);
      const completed = (j.completedTasks && j.completedTasks[dateStr]) || [];
      const tasks = (j.tasks || []).map((t, i) => `${completed.includes(i) ? '✅' : '⬜'} ${t}`).join('\n');
      await sendDiscord(settings.discordWebhook, {
        embeds: [{
          title: `✅ ${j.title}`,
          description: `⏰ เวลา **${j.time || '-'}** น.\n📅 วันที่: **${dateStr}**\n\n**งานที่ต้องทำ:**\n${tasks}`,
          color: parseInt((j.color || '#22C55E').replace('#', ''), 16),
          footer: { text: `แจ้งเตือนล่วงหน้า ${getNotifyLabel()}` },
          timestamp: new Date().toISOString()
        }]
      }).catch(console.error);
    }
  }

  // Repeat notifications
  if (settings.notifyRepeat) {
    const repeatMin = settings.repeatUnit === 'hours'
      ? (settings.repeatInterval || 1) * 60
      : (settings.repeatInterval || 30);
    // Re-notify tasks happening today that are not yet complete
    const todayStr = `${bangkokNow.getFullYear()}-${pad(bangkokNow.getMonth()+1)}-${pad(bangkokNow.getDate())}`;
    for (const s of schedules) {
      if (!s.discordNotify || !s.dates.includes(todayStr)) continue;
      const dayObjs = (s.objectives && s.objectives[todayStr]) || [];
      const completedObjs = (s.completedObjectives && s.completedObjectives[todayStr]) || [];
      if (dayObjs.length && completedObjs.length < dayObjs.length) {
        const rKey = `r_${s.id}_${todayStr}`;
        const lastNotify = notified[rKey] ? new Date(notified[rKey]).getTime() : 0;
        if (nowUtc - lastNotify >= repeatMin * 60000) {
          notified[rKey] = new Date().toISOString();
          write(FILES.notified, notified);
          const objText = dayObjs.map((o, i) => `${completedObjs.includes(i) ? '✅' : '⬜'} ${o}`).join('\n');
          await sendDiscord(settings.discordWebhook, {
            embeds: [{
              title: `🔔 เตือนซ้ำ: ${s.title}`,
              description: `📅 วันนี้ (${todayStr})\n\n**Objectives ยังไม่เสร็จ:**\n${objText}`,
              color: 0xEAB308,
              footer: { text: `เตือนซ้ำทุก ${settings.repeatInterval} ${settings.repeatUnit === 'hours' ? 'ชม.' : 'นาที'}` },
              timestamp: new Date().toISOString()
            }]
          }).catch(console.error);
        }
      }
    }
  }
});

function getJobDatesForMonth(job, year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = n => String(n).padStart(2, '0');

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
    const date = new Date(dateStr);

    if ((job.dates || []).includes(dateStr)) { dates.push(dateStr); continue; }
    if (!job.recurring || job.recurring.type === 'none') continue;

    const startDate = job.startDate ? new Date(job.startDate) : null;
    if (startDate && date < startDate) continue;
    if (job.endDate && date > new Date(job.endDate)) continue;

    const { type, days, interval, unit } = job.recurring;
    if (type === 'daily') { dates.push(dateStr); continue; }
    if (type === 'weekly' && days && days.includes(date.getDay())) { dates.push(dateStr); continue; }
    if (type === 'monthly' && startDate && date.getDate() === startDate.getDate()) { dates.push(dateStr); continue; }
    if (type === 'custom' && startDate) {
      const diffDays = Math.floor((date - startDate) / 86400000);
      const iDays = unit === 'weeks' ? interval * 7 : unit === 'months' ? interval * 30 : interval;
      if (diffDays >= 0 && diffDays % iDays === 0) dates.push(dateStr);
    }
  }
  return dates;
}

app.listen(PORT, () => {
  console.log(`\n🗓  Monthly Plan running at → http://localhost:${PORT}\n`);
});
