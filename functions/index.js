const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

// ── DISCORD SENDER ────────────────────────────────────
async function sendDiscord(webhook, payload) {
  if (!webhook) return;
  return fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// ── HELPER: GET JOB DATES ─────────────────────────────
function getJobDatesForMonth(job, year, month) {
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = n => String(n).padStart(2, '0');

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${pad(month + 1)}-${pad(d)}`;
    const date = new Date(`${ds}T00:00:00`);
    let match = false;

    if (job.dates && job.dates.includes(ds)) match = true;
    else if (job.recurring && job.recurring.type !== 'none') {
      const start = job.startDate ? new Date(job.startDate) : null;
      if (!start || date >= start) {
        if (!job.endDate || date <= new Date(job.endDate)) {
          const { type, days, interval, unit } = job.recurring;
          if (type === 'daily') match = true;
          else if (type === 'weekly') match = (days && days.includes(date.getDay()));
          else if (type === 'monthly') match = (date.getDate() === start.getDate());
          else if (type === 'custom') {
            const diff = Math.floor((date - start) / 86400000);
            const step = unit === 'weeks' ? interval * 7 : unit === 'months' ? interval * 30 : interval;
            match = (diff >= 0 && diff % step === 0);
          }
        }
      }
    }
    if (match) dates.push(ds);
  }
  return dates;
}

// ── CRON: Every minute ────────────────────────────────
exports.discordNotifier = functions.pubsub.schedule('* * * * *').onRun(async (context) => {
  const usersSnap = await db.collection('users').get();
  const pad = n => String(n).padStart(2, '0');

  // Current UTC time
  const nowUtc = new Date().getTime();
  // Current time in Bangkok for string comparison
  const bangkokNow = new Date(nowUtc + (3600000 * 7));
  const todayStr = `${bangkokNow.getFullYear()}-${pad(bangkokNow.getMonth() + 1)}-${pad(bangkokNow.getDate())}`;
  const nowTime = `${pad(bangkokNow.getHours())}:${pad(bangkokNow.getMinutes())}`;

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const settingsDoc = await db.collection('users').doc(userId).collection('config').doc('settings').get();
    if (!settingsDoc.exists) continue;

    const settings = settingsDoc.data();
    if (!settings.discordWebhook) continue;

    const notifiedDoc = await db.collection('users').doc(userId).collection('config').doc('notified').get();
    const notified = notifiedDoc.exists ? notifiedDoc.data() : {};
    let notifiedChanged = false;

    const notifyUnit = settings.notifyUnit || 'minutes';
    const notifyTimeSetting = settings.notifyTime || '08:00';

    function shouldNotify(taskDateStr, taskTime) {
      if (notifyUnit === 'days') {
        const taskDate = new Date(`${taskDateStr}T00:00:00+07:00`);
        const nDays = settings.notifyBefore || 1;
        const notifyDate = new Date(taskDate.getTime() - nDays * 86400000);
        const nStr = `${notifyDate.getFullYear()}-${pad(notifyDate.getMonth() + 1)}-${pad(notifyDate.getDate())}`;
        return nStr === todayStr && nowTime === notifyTimeSetting;
      } else {
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
    const schedulesSnap = await db.collection('users').doc(userId).collection('schedules').get();
    for (const sDoc of schedulesSnap.docs) {
      const s = sDoc.data();
      s.id = sDoc.id;
      if (!s.discordNotify || !s.dates) continue;

      for (const dateStr of s.dates) {
        if (!shouldNotify(dateStr, s.time)) continue;
        const key = `s_${s.id}_${dateStr}`;
        if (notified[key]) continue;

        notified[key] = new Date().toISOString();
        notifiedChanged = true;

        const objectives = (s.objectives && s.objectives[dateStr]) || [];
        const completed = (s.completedObjectives && s.completedObjectives[dateStr]) || [];
        const objText = objectives.map((o, i) => `${completed.includes(i) ? '✅' : '⬜'} ${o}`).join('\n');

        await sendDiscord(settings.discordWebhook, {
          embeds: [{
            title: `📋 ${s.title}`,
            description: `⏰ เวลา **${s.time || '-'} - ${s.endTime || '-'}** น.\n📅 วันที่: **${dateStr}**\n\n**Objectives:**\n${objText || '-'}`,
            color: parseInt((s.color || '#7C3AED').replace('#', ''), 16),
            footer: { text: `แจ้งเตือนล่วงหน้า ${getNotifyLabel()}` },
            timestamp: new Date().toISOString()
          }]
        }).catch(console.error);
      }
    }

    // Check jobs
    const jobsSnap = await db.collection('users').doc(userId).collection('jobs').get();
    for (const jDoc of jobsSnap.docs) {
      const j = jDoc.data();
      j.id = jDoc.id;
      if (!j.discordNotify) continue;

      const allDates = getJobDatesForMonth(j, bangkokNow.getFullYear(), bangkokNow.getMonth());
      for (const dateStr of allDates) {
        if (!shouldNotify(dateStr, j.time)) continue;
        const key = `j_${j.id}_${dateStr}`;
        if (notified[key]) continue;

        notified[key] = new Date().toISOString();
        notifiedChanged = true;

        const completed = (j.completedTasks && j.completedTasks[dateStr]) || [];
        const tasks = (j.tasks || []).map((t, i) => `${completed.includes(i) ? '✅' : '⬜'} ${t}`).join('\n');

        await sendDiscord(settings.discordWebhook, {
          embeds: [{
            title: `✅ ${j.title}`,
            description: `⏰ เวลา **${j.time || '-'}** น.\n📅 วันที่: **${dateStr}**\n\n**งานที่ต้องทำ:**\n${tasks || '-'}`,
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

      for (const sDoc of schedulesSnap.docs) {
        const s = sDoc.data();
        s.id = sDoc.id;
        if (!s.discordNotify || !s.dates || !s.dates.includes(todayStr)) continue;

        const dayObjs = (s.objectives && s.objectives[todayStr]) || [];
        const completedObjs = (s.completedObjectives && s.completedObjectives[todayStr]) || [];

        if (dayObjs.length && completedObjs.length < dayObjs.length) {
          const rKey = `r_${s.id}_${todayStr}`;
          const lastNotify = notified[rKey] ? new Date(notified[rKey]).getTime() : 0;
          if (nowUtc - lastNotify >= repeatMin * 60000) {
            notified[rKey] = new Date().toISOString();
            notifiedChanged = true;

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

    if (notifiedChanged) {
      await db.collection('users').doc(userId).collection('config').doc('notified').set(notified);
    }
  }
  return null;
});
