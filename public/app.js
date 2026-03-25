/* ── Monthly Plan — Frontend App ─────────────────────── */
'use strict';

// ── FIREBASE CONFIG (FILL THIS) ───────────────────────
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;

// ── STATE ─────────────────────────────────────────────
const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  schedules: [],
  jobs: [],
  holidays: [],
  settings: {},
  dpYear: new Date().getFullYear(),
  dpMonth: new Date().getMonth(),
  activePicker: null,   // 'schedule' | 'job' | 'holiday'
  activePickerDates: [],
  scheduleColor: '#7C3AED',
  jobColor: '#0EA5E9',
  holidayColor: '#EF4444',
  showDashObjectives: true,
  showCalObjectives: true,
};

const COLORS = ['#7C3AED','#0EA5E9','#22C55E','#EF4444','#F97316','#EAB308','#EC4899','#14B8A6'];
const TODAY = new Date().toISOString().split('T')[0];
const pad = n => String(n).padStart(2, '0');
const dateStr = (y, m, d) => `${y}-${pad(m+1)}-${pad(d)}`;

function safeAddListener(id, event, cb) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, cb);
  else console.warn(`Element #${id} not found for ${event} listener`);
}

function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── API (FIRESTORE) ──────────────────────────────────
const api = {
  getCollection(name) {
    if (!currentUser) return Promise.resolve([]);
    return db.collection('users').doc(currentUser.uid).collection(name).get()
      .then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  },
  async get(path) {
    if (!currentUser) return [];
    if (path.includes('settings')) {
      const doc = await db.collection('users').doc(currentUser.uid).collection('config').doc('settings').get();
      return doc.exists ? doc.data() : { timezone: 'Asia/Bangkok' };
    }
    const name = path.split('/').pop();
    return this.getCollection(name);
  },
  async post(path, body) {
    if (!currentUser) return;
    const name = path.split('/').pop();
    const docRef = await db.collection('users').doc(currentUser.uid).collection(name).add({
      ...body,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id, ...body };
  },
  async put(path, body) {
    if (!currentUser) return;
    if (path === '/api/settings') {
      await db.collection('users').doc(currentUser.uid).collection('config').doc('settings').set(body, { merge: true });
      return body;
    }
    const parts = path.split('/');
    const id = parts.pop();
    const name = parts.pop();
    await db.collection('users').doc(currentUser.uid).collection(name).doc(id).set(body, { merge: true });
    return { id, ...body };
  },
  async del(path) {
    if (!currentUser) return;
    const parts = path.split('/');
    const id = parts.pop();
    const name = parts.pop();
    await db.collection('users').doc(currentUser.uid).collection(name).doc(id).delete();
    return { ok: true };
  },
};

// ── AUTHENTICATION ────────────────────────────────────
auth.onAuthStateChanged(user => {
  currentUser = user;
  const overlay = document.getElementById('authOverlay');
  if (user) {
    document.body.classList.remove('auth-loading');
    overlay.classList.add('hidden');
    loadAll().then(renderCalendar);
  } else {
    document.body.classList.add('auth-loading');
    overlay.classList.remove('hidden');
  }
});

safeAddListener('btnLogin', 'click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  if (!email || !pass) return toast('กรุณากรอกอีเมลและรหัสผ่าน', 'error');
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    toast('เข้าสู่ระบบไม่สำเร็จ: ' + e.message, 'error');
  }
});

safeAddListener('btnGoogleLogin', 'click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    toast('เข้าสู่ระบบไม่สำเร็จ: ' + e.message, 'error');
  }
});

safeAddListener('btnLogout', 'click', () => {
  auth.signOut();
});

async function loadAll() {
  console.log('loadAll: starting...');
  try {
    const [schedules, jobs, holidays, settings] = await Promise.all([
      api.get('/api/schedules'),
      api.get('/api/jobs'),
      api.get('/api/holidays'),
      api.get('/api/settings'),
    ]);
    state.schedules = schedules || [];
    state.jobs = jobs || [];
    state.holidays = holidays || [];
    state.settings = settings || {};
    console.log('loadAll: success', { 
      schedules: state.schedules.length, 
      jobs: state.jobs.length, 
      holidays: state.holidays.length 
    });
  } catch (e) {
    console.error('loadAll: FAILED', e);
    throw e;
  }
}

// ── CALENDAR ──────────────────────────────────────────
function renderCalendar() {
  try {
    const { year, month } = state;
    const thLocale = 'th-TH';
    const monthName = new Date(year, month, 1).toLocaleDateString(thLocale, { month: 'long', year: 'numeric' });
    document.getElementById('monthLabel').textContent = monthName;

    const grid = document.getElementById('calendarGrid');
    if (!grid) throw new Error('Cannot find calendarGrid');
    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // empty leading cells
    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div');
      el.className = 'day-cell empty';
      grid.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = buildDayCell(d);
      if (cell) grid.appendChild(cell);
    }
  } catch (e) {
    console.error('renderCalendar ERROR:', e);
    const grid = document.getElementById('calendarGrid');
    if (grid) grid.innerHTML = `<div style="color:red;padding:20px">Error rendering calendar: ${e.message}</div>`;
  }
}

function buildDayCell(d) {
  try {
    const { year, month } = state;
    const ds = dateStr(year, month, d);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (ds === TODAY) cell.classList.add('today');

    // Day number
    const numEl = document.createElement('div');
    numEl.className = 'day-number';
    numEl.textContent = d;
    cell.appendChild(numEl);

    const holidays = state.holidays || [];
    const dayHolidays = holidays.filter(h => h && h.dates && h.dates.includes(ds));
    const isBlocked = dayHolidays.some(h => h.blockTasks);

    if (dayHolidays.length > 0) {
      const overlay = document.createElement('div');
      overlay.className = 'holiday-overlay';
      overlay.style.background = dayHolidays[0].color || '#EF4444';
      overlay.innerHTML = dayHolidays.map(h => {
        const typeLabel = h.holidayType === 'นักขัตฤกษ์' ? '🚩' : '🎉';
        return `<div class="holiday-name">${typeLabel} ${h.name || h.holidayType || 'วันหยุด'}</div>`;
      }).join('');
      cell.appendChild(overlay);
      cell.addEventListener('click', () => {
        if (dayHolidays.length === 1) openHolidayModal(dayHolidays[0]);
        else openDetailModal(ds);
      });
      if (isBlocked) return cell;
    }

    const content = document.createElement('div');
    content.className = 'day-content';

    // Schedules
    const schedules = state.schedules || [];
    const daySchedules = schedules.filter(s => s && s.dates && s.dates.includes(ds));
    daySchedules.forEach(s => {
      const timeRange = s.endTime ? `${s.time || '-'} - ${s.endTime}` : (s.time || '');
      const el = document.createElement('div');
      el.className = 'schedule-banner';
      el.style.background = s.color || '#7C3AED';
      el.innerHTML = `<span class="schedule-title">${s.title}</span><span class="schedule-time">${timeRange}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); editSchedule(s.id); });
      content.appendChild(el);
      
      const dayObjs = (s.objectives && s.objectives[ds]) || [];
      if (dayObjs.length && state.showCalObjectives) {
        const completedObjs = (s.completedObjectives && s.completedObjectives[ds]) || [];
        const objList = document.createElement('div');
        objList.className = 'obj-list-cal';
        dayObjs.forEach((obj, idx) => {
          const isDone = completedObjs.includes(idx);
          const item = document.createElement('label');
          item.className = 'obj-item-cal' + (isDone ? ' done' : '');
          item.innerHTML = `<input type="checkbox" ${isDone ? 'checked' : ''}><span>${obj}</span>`;
          item.querySelector('input').addEventListener('change', async (e) => {
            e.stopPropagation();
            const co = { ...(s.completedObjectives || {}) };
            const arr = co[ds] ? [...co[ds]] : [];
            if (e.target.checked) { if (!arr.includes(idx)) arr.push(idx); }
            else { const pos = arr.indexOf(idx); if (pos > -1) arr.splice(pos, 1); }
            co[ds] = arr;
            await api.put(`/api/schedules/${s.id}`, { completedObjectives: co });
            state.schedules = await api.get('/api/schedules');
            renderCalendar();
          });
          item.addEventListener('click', (e) => e.stopPropagation());
          objList.appendChild(item);
        });
        content.appendChild(objList);
      }
    });

    // Jobs
    const dayJobs = getJobsForDate(ds) || [];
    dayJobs.forEach(j => {
      const completed = (j.completedTasks && j.completedTasks[ds]) || [];
      const tasks = j.tasks || [];
      const isJobWithoutTasks = tasks.length === 0;
      const isFullyDone = isJobWithoutTasks 
        ? completed.includes(0) 
        : (tasks.length > 0 && tasks.every((_, idx) => completed.includes(idx)));
      
      if (isFullyDone) return;

      const el = document.createElement('div');
      el.className = 'job-item-text' + (isFullyDone ? ' done' : '');
      el.innerHTML = `
        <span class="job-dot" style="background:${j.color || '#0EA5E9'}"></span>
        <span class="job-title-text">${j.title}</span>
        ${j.time ? `<span class="job-time-text">${j.time}</span>` : ''}
      `;
      el.addEventListener('click', (e) => { e.stopPropagation(); openDetailModal(ds); });
      content.appendChild(el);
    });

    cell.appendChild(content);
    cell.addEventListener('click', () => openDetailModal(ds));
    return cell;
  } catch (err) {
    console.error('buildDayCell error', d, err);
    // Return a basic cell instead of null so the calendar doesn't look empty
    const cell = document.createElement('div');
    cell.className = 'day-cell error';
    cell.innerHTML = `<div class="day-number">${d}</div><div style="color:red;font-size:10px">!</div>`;
    return cell;
  }
}

// ── RECURRING JOB DATES ──────────────────────────────
function getJobsForDate(ds) {
  const date = new Date(ds);
  return state.jobs.filter(job => {
    if (job.dates && job.dates.includes(ds)) return true;
    if (!job.recurring || job.recurring.type === 'none') return false;
    const start = job.startDate ? new Date(job.startDate) : null;
    if (start && date < start) return false;
    if (job.endDate && date > new Date(job.endDate)) return false;
    const { type, days, interval, unit } = job.recurring;
    if (type === 'daily') return true;
    if (type === 'weekly') return days && days.includes(date.getDay());
    if (type === 'monthly') return start && date.getDate() === start.getDate();
    if (type === 'custom' && start) {
      const diff = Math.floor((date - start) / 86400000);
      const step = unit === 'weeks' ? interval*7 : unit === 'months' ? interval*30 : interval;
      return diff >= 0 && diff % step === 0;
    }
    return false;
  });
}

// ── DETAIL MODAL ──────────────────────────────────────
function openDetailModal(ds) {
  const dayHolidaysDetail = state.holidays.filter(h => h.dates && h.dates.includes(ds));
  const isBlockedDetail = dayHolidaysDetail.some(h => h.blockTasks);
  const daySchedules = state.schedules.filter(s => s.dates && s.dates.includes(ds));
  const dayJobs = getJobsForDate(ds);

  const dateObj = new Date(ds + 'T00:00:00');
  document.getElementById('detailDate').textContent =
    dateObj.toLocaleDateString('th-TH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  const body = document.getElementById('detailBody');
  body.innerHTML = '';

  // ── HOLIDAYS — each one editable ──
  if (dayHolidaysDetail.length) {
    const sec = document.createElement('div');
    sec.className = 'detail-section';
    sec.innerHTML = `<h4>🎉 วันหยุด / OFF (${dayHolidaysDetail.length})</h4>`;
    dayHolidaysDetail.forEach(h => {
      const row = document.createElement('div');
      row.className = 'detail-action-row';
      row.innerHTML = `
        <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${h.color};flex-shrink:0"></span>
        <div style="flex:1">
          <strong style="color:${h.color}">${h.holidayType || 'วันหยุด'}</strong>
          ${h.name ? `<span style="margin-left:6px">${h.name}</span>` : ''}
        </div>
        <button class="btn-edit-sm" title="แก้ไข">✎</button>
        <button class="btn-del-sm" title="ลบ">✕</button>
      `;
      row.querySelector('.btn-edit-sm').addEventListener('click', () => {
        closeModal('detail');
        openHolidayModal(h);
      });
      row.querySelector('.btn-del-sm').addEventListener('click', async () => {
        if (!confirm('ลบวันหยุดนี้?')) return;
        await api.del(`/api/holidays/${h.id}`);
        state.holidays = await api.get('/api/holidays');
        renderCalendar();
        openDetailModal(ds);
      });
      sec.appendChild(row);
    });
    body.appendChild(sec);
    if (isBlockedDetail) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'วันนี้เป็นวันหยุด — งานถูกบล็อก';
      body.appendChild(note);
      openModal('detail');
      return;
    }
  }

  // ── SCHEDULES — with editable objectives ──
  if (daySchedules.length) {
    daySchedules.forEach(s => {
      const sec = document.createElement('div');
      sec.className = 'detail-section';
      const timeRange = s.endTime ? `${s.time || '-'} - ${s.endTime}` : (s.time || '-');
      sec.innerHTML = `
        <div class="detail-action-row" style="border:none;padding:0;margin-bottom:6px">
          <h4 style="display:flex;align-items:center;gap:6px;flex:1">
            <span style="width:10px;height:10px;border-radius:50%;background:${s.color||'#7C3AED'};display:inline-block"></span>
            📋 ${s.title}
          </h4>
          <button class="btn-edit-sm" title="แก้ไขตารางงาน">✎</button>
        </div>
        <div class="detail-meta" style="margin:0 0 6px">
          ${s.branch ? `<span>📍 ${s.branch}</span>` : ''}
          <span>⏰ ${timeRange}</span>
          ${s.note ? `<span>📝 ${s.note}</span>` : ''}
        </div>`;
      sec.querySelector('.btn-edit-sm').addEventListener('click', () => {
        closeModal('detail');
        editSchedule(s.id);
      });

      // Objectives with checkboxes + edit/delete
      const dayObjs = (s.objectives && s.objectives[ds]) || [];
      if (dayObjs.length) {
        const completedObjs = (s.completedObjectives && s.completedObjectives[ds]) || [];
        const objHeader = document.createElement('div');
        objHeader.style.cssText = 'font-size:12px;font-weight:700;color:var(--text2);margin:4px 0;display:flex;align-items:center;justify-content:space-between;';
        objHeader.innerHTML = `<span>Objectives (${completedObjs.length}/${dayObjs.length})</span>`;
        sec.appendChild(objHeader);

        const objList = document.createElement('div');
        objList.className = 'detail-checklist';
        dayObjs.forEach((obj, idx) => {
          const isDone = completedObjs.includes(idx);
          const row = document.createElement('div');
          row.className = 'check-item-row' + (isDone ? ' done' : '');
          row.innerHTML = `
            <label class="check-item" style="flex:1;margin:0">
              <input type="checkbox" ${isDone ? 'checked' : ''}> ${obj}
            </label>
            <button class="btn-del-sm tiny" title="ลบ Objective">✕</button>
          `;
          row.querySelector('input').addEventListener('change', async (e) => {
            const co = { ...(s.completedObjectives || {}) };
            const arr = co[ds] ? [...co[ds]] : [];
            if (e.target.checked) { if (!arr.includes(idx)) arr.push(idx); }
            else { const pos = arr.indexOf(idx); if (pos > -1) arr.splice(pos, 1); }
            co[ds] = arr;
            await api.put(`/api/schedules/${s.id}`, { completedObjectives: co });
            state.schedules = await api.get('/api/schedules');
            renderCalendar();
            openDetailModal(ds);
          });
          row.querySelector('.btn-del-sm').addEventListener('click', async () => {
            const objs = { ...(s.objectives || {}) };
            const arr = objs[ds] ? [...objs[ds]] : [];
            arr.splice(idx, 1);
            objs[ds] = arr;
            // Also fix completed indices
            const co = { ...(s.completedObjectives || {}) };
            co[ds] = (co[ds] || []).filter(i => i !== idx).map(i => i > idx ? i - 1 : i);
            await api.put(`/api/schedules/${s.id}`, { objectives: objs, completedObjectives: co });
            state.schedules = await api.get('/api/schedules');
            renderCalendar();
            openDetailModal(ds);
          });
          objList.appendChild(row);
        });
        sec.appendChild(objList);
      }

      // Add objective inline
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add-task';
      addBtn.textContent = '+ เพิ่ม Objective';
      addBtn.style.marginTop = '6px';
      addBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'พิมพ์แล้วกด Enter';
        input.style.cssText = 'margin-top:6px;font-size:12px;';
        addBtn.before(input);
        input.focus();
        input.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            const objs = { ...(s.objectives || {}) };
            const arr = objs[ds] ? [...objs[ds]] : [];
            arr.push(input.value.trim());
            objs[ds] = arr;
            await api.put(`/api/schedules/${s.id}`, { objectives: objs });
            state.schedules = await api.get('/api/schedules');
            renderCalendar();
            openDetailModal(ds);
          }
          if (e.key === 'Escape') input.remove();
        });
      });
      sec.appendChild(addBtn);
      body.appendChild(sec);
    });
  }

    // ── JOBS — with edit/delete buttons ──
    dayJobs.forEach(j => {
      const completed = (j.completedTasks && j.completedTasks[ds]) ? [...j.completedTasks[ds]] : [];
      const sec = document.createElement('div');
      sec.className = 'detail-section';
      sec.innerHTML = `
        <div class="detail-action-row" style="border:none;padding:0;margin-bottom:6px">
          <h4 style="display:flex;align-items:center;gap:6px;flex:1">
            <span style="width:10px;height:10px;border-radius:50%;background:${j.color || '#0EA5E9'};display:inline-block"></span>
            ✅ ${j.title} <span style="font-size:11px;color:var(--text2);font-weight:400">${j.time ? '⏰ ' + j.time : ''}</span>
          </h4>
          <button class="btn-edit-sm" title="แก้ไข Job">✎</button>
          <button class="btn-del-sm" title="ลบ Job">✕</button>
        </div>`;

      sec.querySelector('.btn-edit-sm').addEventListener('click', () => {
        closeModal('detail');
        openJobModal(j);
      });
      sec.querySelector('.btn-del-sm').addEventListener('click', async () => {
        if (!confirm(`ลบ Job "${j.title}"?`)) return;
        await api.del(`/api/jobs/${j.id}`);
        state.jobs = await api.get('/api/jobs');
        renderCalendar();
        openDetailModal(ds);
      });

      if (j.tasks && j.tasks.length) {
        const list = document.createElement('div');
        list.className = 'detail-checklist';
        j.tasks.forEach((task, idx) => {
          const item = document.createElement('label');
          item.className = 'check-item' + (completed.includes(idx) ? ' done' : '');
          item.innerHTML = `<input type="checkbox" ${completed.includes(idx) ? 'checked' : ''}> ${task}`;
          item.querySelector('input').addEventListener('change', async (e) => {
            const ct = { ...(j.completedTasks || {}) };
            const arr = ct[ds] ? [...ct[ds]] : [];
            if (e.target.checked) { if (!arr.includes(idx)) arr.push(idx); }
            else { const pos = arr.indexOf(idx); if (pos > -1) arr.splice(pos, 1); }
            ct[ds] = arr;
            await api.put(`/api/jobs/${j.id}`, { completedTasks: ct });
            state.jobs = await api.get('/api/jobs');
            item.classList.toggle('done', e.target.checked);
            renderCalendar();
            if (dashboardOpen) renderDashboard();
          });
          list.appendChild(item);
        });
        sec.appendChild(list);
      }

      // Always show the main completion toggle for the Job itself
      const mainList = document.createElement('div');
      mainList.className = 'detail-checklist';
      const isDone = (j.tasks && j.tasks.length > 0)
        ? j.tasks.every((_, i) => completed.includes(i))
        : completed.includes(0);
      const mainItem = document.createElement('label');
      mainItem.className = 'check-item' + (isDone ? ' done' : '');
      mainItem.innerHTML = `<input type="checkbox" ${isDone ? 'checked' : ''}> <strong>ทำเสร็จแล้ว</strong>`;
      mainItem.querySelector('input').addEventListener('change', async (e) => {
        const ct = { ...(j.completedTasks || {}) };
        let arr = [];
        if (e.target.checked) {
          if (j.tasks && j.tasks.length > 0) arr = j.tasks.map((_, i) => i);
          else arr = [0];
        }
        ct[ds] = arr;
        await api.put(`/api/jobs/${j.id}`, { completedTasks: ct });
        state.jobs = await api.get('/api/jobs');
        renderCalendar();
        openDetailModal(ds); // Refresh modal to update subtasks too
        if (dashboardOpen) renderDashboard();
      });
      mainList.appendChild(mainItem);
      sec.appendChild(mainList);
      body.appendChild(sec);
    });

  if (!dayHolidaysDetail.length && !daySchedules.length && !dayJobs.length) {
    body.innerHTML = '<p class="hint" style="text-align:center;padding:20px">ไม่มีรายการในวันนี้</p>';
  }

  openModal('detail');
}

// ── DATE PICKER ───────────────────────────────────────
function buildDatePicker(containerId, tagsId, context) {
  const container = document.getElementById(containerId);
  const tagsContainer = document.getElementById(tagsId);
  const y = state.dpYear;
  const m = state.dpMonth;

  container.innerHTML = '';

  // Header row
  const header = document.createElement('div');
  header.className = 'dp-header';
  header.style.gridColumn = '1/-1';
  header.innerHTML = `
    <button id="dp-prev-${context}">‹</button>
    <span>${new Date(y,m,1).toLocaleDateString('th-TH',{month:'long',year:'numeric'})}</span>
    <button id="dp-next-${context}">›</button>
  `;
  container.appendChild(header);

  // Day labels
  ['อา','จ','อ','พ','พฤ','ศ','ส'].forEach(label => {
    const el = document.createElement('div');
    el.className = 'dp-day-label';
    el.textContent = label;
    container.appendChild(el);
  });

  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'dp-day empty';
    container.appendChild(el);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStr(y, m, d);
    const el = document.createElement('div');
    el.className = 'dp-day';
    el.textContent = d;
    if (ds === TODAY) el.classList.add('today-dp');
    if (state.activePickerDates.includes(ds)) el.classList.add('selected');
    // Show existing holidays/schedules/jobs as dots
    const hasHoliday = state.holidays.some(h => h.dates && h.dates.includes(ds));
    const hasSchedule = state.schedules.some(s => s.dates && s.dates.includes(ds));
    if (hasHoliday) el.classList.add('dp-has-holiday');
    if (hasSchedule) el.classList.add('dp-has-schedule');
    el.addEventListener('click', () => togglePickerDate(ds, containerId, tagsId, context));
    container.appendChild(el);
  }

  document.getElementById(`dp-prev-${context}`).addEventListener('click', (e) => {
    e.stopPropagation();
    state.dpMonth--;
    if (state.dpMonth < 0) { state.dpMonth = 11; state.dpYear--; }
    buildDatePicker(containerId, tagsId, context);
  });
  document.getElementById(`dp-next-${context}`).addEventListener('click', (e) => {
    e.stopPropagation();
    state.dpMonth++;
    if (state.dpMonth > 11) { state.dpMonth = 0; state.dpYear++; }
    buildDatePicker(containerId, tagsId, context);
  });

  renderDateTags(tagsContainer);
}

function togglePickerDate(ds, containerId, tagsId, context) {
  const idx = state.activePickerDates.indexOf(ds);
  if (idx > -1) state.activePickerDates.splice(idx, 1);
  else state.activePickerDates.push(ds);
  buildDatePicker(containerId, tagsId, context);
}

function renderDateTags(container) {
  container.innerHTML = '';
  [...state.activePickerDates].sort().forEach(ds => {
    const tag = document.createElement('div');
    tag.className = 'date-tag';
    const dateObj = new Date(ds + 'T00:00:00');
    tag.innerHTML = `${dateObj.toLocaleDateString('th-TH',{day:'numeric',month:'short'})} <button data-ds="${ds}">×</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      state.activePickerDates = state.activePickerDates.filter(x => x !== ds);
      const ctx = state.activePicker;
      buildDatePicker(`${ctx}DatePicker`, `${ctx}DateTags`, ctx);
    });
    container.appendChild(tag);
  });
}

// ── COLOR SWATCHES ────────────────────────────────────
function buildColorSwatches(containerId, stateKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  COLORS.forEach(c => {
    const el = document.createElement('div');
    el.className = 'color-swatch' + (state[stateKey] === c ? ' active' : '');
    el.style.background = c;
    el.addEventListener('click', () => {
      state[stateKey] = c;
      buildColorSwatches(containerId, stateKey);
    });
    container.appendChild(el);
  });
}

// ── MODAL MANAGEMENT ─────────────────────────────────
function openModal(type) {
  document.getElementById('modalOverlay').classList.remove('hidden');
  // hide all modals first
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById(`modal${capitalize(type)}`).classList.remove('hidden');
}
function closeModal(type) {
  document.getElementById(`modal${capitalize(type)}`).classList.add('hidden');
  const anyOpen = [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'));
  if (!anyOpen) document.getElementById('modalOverlay').classList.add('hidden');
}
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

// ── SCHEDULE FORM ─────────────────────────────────────
function openScheduleModal(schedule = null) {
  state.activePicker = 'schedule';
  state.activePickerDates = schedule ? [...(schedule.dates || [])] : [];
  state.scheduleColor = schedule ? (schedule.color || '#7C3AED') : '#7C3AED';
  state.dpYear = state.year;
  state.dpMonth = state.month;

  document.getElementById('scheduleId').value = schedule ? schedule.id : '';
  document.getElementById('scheduleTitle').value = schedule ? schedule.title : '';
  document.getElementById('scheduleBranch').value = schedule ? (schedule.branch || '') : '';
  
  const hasTime = schedule ? !!schedule.time : true;
  document.getElementById('scheduleHasTime').checked = hasTime;
  document.getElementById('scheduleTime').value = schedule ? (schedule.time || '10:00') : '10:00';
  document.getElementById('scheduleEndTime').value = schedule ? (schedule.endTime || '22:00') : '22:00';
  document.getElementById('scheduleTime').classList.toggle('hidden', !hasTime);
  document.getElementById('scheduleEndTimeCol').classList.toggle('hidden', !hasTime);

  document.getElementById('scheduleNote').value = schedule ? (schedule.note || '') : '';
  document.getElementById('scheduleDiscordNotify').checked = schedule ? !!schedule.discordNotify : false;
  document.getElementById('scheduleModalTitle').textContent = schedule ? '📋 แก้ไขตารางงาน' : '📋 เพิ่มตารางงาน';

  // Objectives
  const objectivesTextarea = document.getElementById('scheduleObjectives');
  const allObjs = schedule ? getScheduleObjectivesList(schedule) : [];
  objectivesTextarea.value = allObjs.join('\n');

  const delBtn = document.getElementById('scheduleDeleteBtn');
  delBtn.classList.toggle('hidden', !schedule);
  if (schedule) {
    delBtn.onclick = async () => {
      if (!confirm('ลบตารางงานนี้?')) return;
      await api.del(`/api/schedules/${schedule.id}`);
      state.schedules = await api.get('/api/schedules');
      renderCalendar();
      closeModal('schedule');
      toast('ลบตารางงานแล้ว', 'info');
    };
  }

  buildColorSwatches('scheduleColorSwatches', 'scheduleColor');
  buildDatePicker('scheduleDatePicker', 'scheduleDateTags', 'schedule');
  openModal('schedule');
}

// Get unique objectives list from all dates
function getScheduleObjectivesList(schedule) {
  if (!schedule.objectives) return [];
  const all = new Set();
  Object.values(schedule.objectives).forEach(arr => arr.forEach(o => all.add(o)));
  return [...all];
}

document.getElementById('scheduleSaveBtn').addEventListener('click', async () => {
  const title = document.getElementById('scheduleTitle').value.trim();
  if (!title) { toast('กรุณากรอกชื่องาน', 'error'); return; }
  if (!state.activePickerDates.length) { toast('กรุณาเลือกอย่างน้อย 1 วัน', 'error'); return; }

  const objLines = document.getElementById('scheduleObjectives').value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  // Build per-date objectives: apply same objectives to all selected dates
  const id = document.getElementById('scheduleId').value;
  let objectives = {};
  let completedObjectives = {};

  if (id) {
    const existing = state.schedules.find(s => s.id === id);
    if (existing) {
      objectives = { ...(existing.objectives || {}) };
      completedObjectives = { ...(existing.completedObjectives || {}) };
    }
  }

  // Update objectives for all selected dates
  state.activePickerDates.forEach(ds => {
    if (!objectives[ds] || !id) {
      objectives[ds] = [...objLines];
    } else {
      // Merge: keep existing, add new ones if they don't exist
      const current = objectives[ds];
      objLines.forEach(o => { if (!current.includes(o)) current.push(o); });
      objectives[ds] = current;
    }
  });

  // Remove dates no longer selected
  Object.keys(objectives).forEach(ds => {
    if (!state.activePickerDates.includes(ds)) {
      delete objectives[ds];
      if (completedObjectives[ds]) delete completedObjectives[ds];
    }
  });

  const hasTime = document.getElementById('scheduleHasTime').checked;
  const payload = {
    title,
    branch: document.getElementById('scheduleBranch').value.trim(),
    time: hasTime ? document.getElementById('scheduleTime').value : null,
    endTime: hasTime ? document.getElementById('scheduleEndTime').value : null,
    note: document.getElementById('scheduleNote').value.trim(),
    dates: [...state.activePickerDates],
    objectives,
    completedObjectives,
    color: state.scheduleColor,
    discordNotify: document.getElementById('scheduleDiscordNotify').checked,
  };

  if (id) await api.put(`/api/schedules/${id}`, payload);
  else await api.post('/api/schedules', payload);

  state.schedules = await api.get('/api/schedules');
  renderCalendar();
  closeModal('schedule');
  toast(id ? 'อัพเดทตารางงานแล้ว' : 'เพิ่มตารางงานแล้ว', 'success');
});

function editSchedule(id) {
  const s = state.schedules.find(x => x.id === id);
  if (s) openScheduleModal(s);
}

// ── JOB FORM ──────────────────────────────────────────
function openJobModal(job = null) {
  state.activePicker = 'job';
  state.activePickerDates = job ? [...(job.dates || [])] : [];
  state.jobColor = job ? (job.color || '#0EA5E9') : '#0EA5E9';
  state.dpYear = state.year;
  state.dpMonth = state.month;

  document.getElementById('jobId').value = job ? job.id : '';
  document.getElementById('jobTitle').value = job ? job.title : '';
  
  const hasTime = job ? !!job.time : true;
  document.getElementById('jobHasTime').checked = hasTime;
  document.getElementById('jobTime').value = job ? (job.time || '08:00') : '08:00';
  document.getElementById('jobTime').classList.toggle('hidden', !hasTime);

  document.getElementById('jobModalTitle').textContent = job ? '✅ แก้ไขงาน' : '✅ เพิ่มงาน (Job)';
  document.getElementById('jobDiscordNotify').checked = job ? !!job.discordNotify : false;

  // Recurring
  const rec = job ? (job.recurring || { type: 'none' }) : { type: 'none' };
  document.getElementById('jobRecurringType').value = rec.type || 'none';
  document.getElementById('jobStartDate').value = job ? (job.startDate || '') : '';
  document.getElementById('jobEndDate').value = job ? (job.endDate || '') : '';
  document.getElementById('customInterval').value = rec.interval || 1;
  document.getElementById('customUnit').value = rec.unit || 'days';

  // Weekly checkboxes
  document.querySelectorAll('#recurringWeekly input[type="checkbox"]').forEach(cb => {
    cb.checked = rec.days && rec.days.includes(parseInt(cb.value));
  });

  updateRecurringUI(rec.type);

  const delBtn = document.getElementById('jobDeleteBtn');
  delBtn.classList.toggle('hidden', !job);
  if (job) {
    delBtn.onclick = async () => {
      if (!confirm('ลบงานนี้?')) return;
      await api.del(`/api/jobs/${job.id}`);
      state.jobs = await api.get('/api/jobs');
      renderCalendar();
      closeModal('job');
      toast('ลบงานแล้ว', 'info');
    };
  }

  buildColorSwatches('jobColorSwatches', 'jobColor');
  buildDatePicker('jobDatePicker', 'jobDateTags', 'job');
  openModal('job');
}

document.getElementById('jobRecurringType').addEventListener('change', (e) => {
  updateRecurringUI(e.target.value);
});

function updateRecurringUI(type) {
  document.getElementById('recurringWeekly').classList.toggle('hidden', type !== 'weekly');
  document.getElementById('recurringCustom').classList.toggle('hidden', type !== 'custom');
  document.getElementById('recurringDates').classList.toggle('hidden', type === 'none');
}

document.getElementById('jobSaveBtn').addEventListener('click', async () => {
  const title = document.getElementById('jobTitle').value.trim();
  if (!title) { toast('กรุณากรอกชื่องาน', 'error'); return; }

  const recType = document.getElementById('jobRecurringType').value;
  const recurring = { type: recType };
  if (recType === 'weekly') {
    recurring.days = [...document.querySelectorAll('#recurringWeekly input:checked')]
      .map(cb => parseInt(cb.value));
  }
  if (recType === 'custom') {
    recurring.interval = parseInt(document.getElementById('customInterval').value) || 1;
    recurring.unit = document.getElementById('customUnit').value;
  }

  const hasTime = document.getElementById('jobHasTime').checked;
  const payload = {
    title,
    time: hasTime ? document.getElementById('jobTime').value : null,
    tasks: [], // Empty as Job = Task
    dates: recType === 'none' ? [...state.activePickerDates] : [],
    recurring,
    startDate: document.getElementById('jobStartDate').value || null,
    endDate: document.getElementById('jobEndDate').value || null,
    color: state.jobColor,
    discordNotify: document.getElementById('jobDiscordNotify').checked,
  };

  if (recType === 'none' && !payload.dates.length) {
    toast('กรุณาเลือกอย่างน้อย 1 วัน', 'error'); return;
  }

  const id = document.getElementById('jobId').value;
  if (id) {
    const existing = state.jobs.find(j => j.id === id);
    if (existing) payload.completedTasks = existing.completedTasks || {};
    await api.put(`/api/jobs/${id}`, payload);
  } else {
    await api.post('/api/jobs', payload);
  }

  state.jobs = await api.get('/api/jobs');
  renderCalendar();
  closeModal('job');
  toast(id ? 'อัพเดทงานแล้ว' : 'เพิ่มงานแล้ว', 'success');
});

// ── HOLIDAY FORM ──────────────────────────────────────
// Auto-set color based on holiday type
const HOLIDAY_TYPE_COLORS = {
  'นักขัตฤกษ์': '#EF4444',
  'OFF': '#F97316',
  'ลาป่วย': '#EC4899',
  'ลาพักร้อน': '#0EA5E9',
  'ลากิจ': '#EAB308',
  'อื่นๆ': '#8B5CF6',
};

function openHolidayModal(holiday = null) {
  state.activePicker = 'holiday';
  state.activePickerDates = holiday ? [...(holiday.dates || [])] : [];
  state.holidayColor = holiday ? (holiday.color || '#EF4444') : '#EF4444';
  state.dpYear = state.year;
  state.dpMonth = state.month;

  document.getElementById('holidayId').value = holiday ? holiday.id : '';
  document.getElementById('holidayType').value = holiday ? (holiday.holidayType || 'นักขัตฤกษ์') : 'นักขัตฤกษ์';
  document.getElementById('holidayName').value = holiday ? (holiday.name || '') : '';
  document.getElementById('holidayCustomColor').value = holiday ? (holiday.color || '#EF4444') : '#EF4444';
  document.getElementById('holidayBlockTasks').checked = holiday ? (holiday.blockTasks !== false) : true;
  document.getElementById('holidayModalTitle').textContent = holiday ? '🎉 แก้ไขวันหยุด / OFF' : '🎉 เพิ่มวันหยุด / OFF';

  // Auto-set color when type changes
  document.getElementById('holidayType').onchange = (e) => {
    const autoColor = HOLIDAY_TYPE_COLORS[e.target.value] || '#EF4444';
    state.holidayColor = autoColor;
    document.getElementById('holidayCustomColor').value = autoColor;
    buildColorSwatches('holidayColorSwatches', 'holidayColor');
  };

  document.getElementById('holidayCustomColor').oninput = (e) => {
    state.holidayColor = e.target.value;
    buildColorSwatches('holidayColorSwatches', 'holidayColor');
  };

  const delBtn = document.getElementById('holidayDeleteBtn');
  delBtn.classList.toggle('hidden', !holiday);
  if (holiday) {
    delBtn.onclick = async () => {
      if (!confirm('ลบวันหยุดนี้?')) return;
      await api.del(`/api/holidays/${holiday.id}`);
      state.holidays = await api.get('/api/holidays');
      renderCalendar();
      closeModal('holiday');
      toast('ลบวันหยุดแล้ว', 'info');
    };
  }

  buildColorSwatches('holidayColorSwatches', 'holidayColor');
  buildDatePicker('holidayDatePicker', 'holidayDateTags', 'holiday');
  openModal('holiday');
}

document.getElementById('holidaySaveBtn').addEventListener('click', async () => {
  const holidayType = document.getElementById('holidayType').value;
  const name = document.getElementById('holidayName').value.trim();
  if (!state.activePickerDates.length) { toast('กรุณาเลือกอย่างน้อย 1 วัน', 'error'); return; }

  const payload = {
    holidayType,
    name,
    dates: [...state.activePickerDates],
    color: state.holidayColor,
    blockTasks: document.getElementById('holidayBlockTasks').checked,
  };

  const id = document.getElementById('holidayId').value;
  if (id) await api.put(`/api/holidays/${id}`, payload);
  else await api.post('/api/holidays', payload);

  state.holidays = await api.get('/api/holidays');
  renderCalendar();
  closeModal('holiday');
  toast(id ? 'อัพเดทวันหยุดแล้ว' : 'เพิ่มวันหยุดแล้ว', 'success');
});

// ── SETTINGS ──────────────────────────────────────────
function openSettingsModal() {
  const s = state.settings;
  document.getElementById('settingDiscordWebhook').value = s.discordWebhook || '';
  document.getElementById('settingNotifyBefore').value = s.notifyBefore || 1;
  document.getElementById('settingNotifyUnit').value = s.notifyUnit || 'days';
  document.getElementById('settingNotifyTime').value = s.notifyTime || '08:00';
  document.getElementById('settingNotifyRepeat').checked = !!s.notifyRepeat;
  document.getElementById('settingRepeatInterval').value = s.repeatInterval || 30;
  document.getElementById('settingRepeatUnit').value = s.repeatUnit || 'minutes';
  document.getElementById('settingGithubRepo').value = s.githubRepo || '';
  document.getElementById('settingGithubToken').value = s.githubToken || '';
  document.getElementById('settingGoogleAIKey').value = s.googleAIKey || '';
  document.getElementById('discordTestResult').textContent = '';
  document.getElementById('repeatOptions').classList.toggle('hidden', !s.notifyRepeat);
  openModal('settings');
}

document.getElementById('settingNotifyRepeat').addEventListener('change', (e) => {
  document.getElementById('repeatOptions').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('settingsSaveBtn').addEventListener('click', async () => {
  const notifyBefore = parseInt(document.getElementById('settingNotifyBefore').value) || 1;
  const notifyUnit = document.getElementById('settingNotifyUnit').value;
  // Convert to minutes for the server
  let notifyBeforeMinutes = notifyBefore;
  if (notifyUnit === 'hours') notifyBeforeMinutes = notifyBefore * 60;
  if (notifyUnit === 'days') notifyBeforeMinutes = notifyBefore * 1440;

  const payload = {
    discordWebhook: document.getElementById('settingDiscordWebhook').value.trim(),
    notifyBefore,
    notifyUnit,
    notifyBeforeMinutes,
    notifyTime: document.getElementById('settingNotifyTime').value,
    notifyRepeat: document.getElementById('settingNotifyRepeat').checked,
    repeatInterval: parseInt(document.getElementById('settingRepeatInterval').value) || 30,
    repeatUnit: document.getElementById('settingRepeatUnit').value,
    githubRepo: document.getElementById('settingGithubRepo').value.trim(),
    githubToken: document.getElementById('settingGithubToken').value.trim(),
    googleAIKey: document.getElementById('settingGoogleAIKey').value.trim(),
  };
  state.settings = await api.put('/api/settings', payload);
  closeModal('settings');
  toast('บันทึกการตั้งค่าแล้ว', 'success');
});

document.getElementById('btnTestDiscord').addEventListener('click', async () => {
  const resultEl = document.getElementById('discordTestResult');
  resultEl.textContent = 'กำลังทดสอบ...';
  try {
    const r = await fetch('/api/discord/test', { method: 'POST' });
    const data = await r.json();
    if (data.ok) resultEl.textContent = '✅ ส่งสำเร็จ!';
    else resultEl.textContent = '❌ ' + (data.error || 'ผิดพลาด');
  } catch (e) {
    resultEl.textContent = '❌ ' + e.message;
  }
});

// ── GITHUB ────────────────────────────────────────────
async function openGithubModal() {
  document.getElementById('githubBody').innerHTML = '<p class="hint">กำลังโหลด...</p>';
  openModal('github');
  try {
    const commits = await api.get('/api/github/commits');
    if (!commits.length) {
      document.getElementById('githubBody').innerHTML = '<p class="hint">ไม่พบ commits หรือยังไม่ได้ตั้งค่า GitHub repo</p>';
      return;
    }
    document.getElementById('githubBody').innerHTML = commits.map(c => `
      <div class="commit-item">
        <div class="commit-sha">${c.sha.slice(0,7)}</div>
        <div class="commit-msg">${c.commit.message.split('\n')[0]}</div>
        <div class="commit-author">by ${c.commit.author.name} · ${new Date(c.commit.author.date).toLocaleDateString('th-TH')}</div>
      </div>
    `).join('');
  } catch (e) {
    document.getElementById('githubBody').innerHTML = `<p class="hint">เกิดข้อผิดพลาด: ${e.message}</p>`;
  }
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type]||''}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ── FAB ───────────────────────────────────────────────
safeAddListener('fabMain', 'click', () => {
  const menu = document.getElementById('fabMenu');
  const btn = document.getElementById('fabMain');
  if (menu) menu.classList.toggle('hidden');
  if (btn) btn.classList.toggle('open');
});

document.querySelectorAll('.fab-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const menu = document.getElementById('fabMenu');
    const fab = document.getElementById('fabMain');
    if (menu) menu.classList.add('hidden');
    if (fab) fab.classList.remove('open');
    if (action === 'schedule') openScheduleModal();
    else if (action === 'job') openJobModal();
    else if (action === 'holiday') openHolidayModal();
  });
});

// ── TOGGLE TIME UI ────────────────────────────────────
safeAddListener('scheduleHasTime', 'change', (e) => {
  document.getElementById('scheduleTime').classList.toggle('hidden', !e.target.checked);
  document.getElementById('scheduleEndTimeCol').classList.toggle('hidden', !e.target.checked);
});
safeAddListener('jobHasTime', 'change', (e) => {
  document.getElementById('jobTime').classList.toggle('hidden', !e.target.checked);
});

// ── CLOSE MODALS ──────────────────────────────────────
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
safeAddListener('modalOverlay', 'click', (e) => {
  const overlay = document.getElementById('modalOverlay');
  if (e.target === overlay) {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
      const type = m.id.replace('modal','').toLowerCase();
      closeModal(type);
    });
  }
});

// ── MONTH NAVIGATION ──────────────────────────────────
safeAddListener('btnPrevMonth', 'click', () => {
  state.month--;
  if (state.month < 0) { state.month = 11; state.year--; }
  renderCalendar();
  if (dashboardOpen) renderDashboard();
});
safeAddListener('btnNextMonth', 'click', () => {
  state.month++;
  if (state.month > 11) { state.month = 0; state.year++; }
  renderCalendar();
  if (dashboardOpen) renderDashboard();
});
safeAddListener('btnToday', 'click', () => {
  state.year = new Date().getFullYear();
  state.month = new Date().getMonth();
  renderCalendar();
  if (dashboardOpen) renderDashboard();
});

// ── HEADER BUTTONS ────────────────────────────────────
safeAddListener('btnSettings', 'click', openSettingsModal);
safeAddListener('btnGithub', 'click', openGithubModal);

// ── DASHBOARD ─────────────────────────────────────────
let dashboardOpen = false;

safeAddListener('btnDashboard', 'click', () => {
  dashboardOpen = !dashboardOpen;
  const grid = document.getElementById('calendarWrapper');
  const legend = document.getElementById('legendBar');
  const dash = document.getElementById('dashboardWrapper');
  const btn = document.getElementById('btnDashboard');

  if (grid) grid.classList.toggle('hidden', dashboardOpen);
  if (legend) legend.classList.toggle('hidden', dashboardOpen);
  if (dash) dash.classList.toggle('hidden', !dashboardOpen);
  if (btn) btn.classList.toggle('active', dashboardOpen);

  if (dashboardOpen) renderDashboard();
});

safeAddListener('btnToggleDashObjectives', 'click', () => {
  state.showDashObjectives = !state.showDashObjectives;
  renderDashboard();
});

safeAddListener('btnToggleCalObjectives', 'click', () => {
  state.showCalObjectives = !state.showCalObjectives;
  const btn = document.getElementById('btnToggleCalObjectives');
  if (btn) btn.textContent = state.showCalObjectives ? '👁️' : '🙈';
  renderCalendar();
});

function renderDashboard() {
  const { year, month } = state;
  const pad2 = n => String(n).padStart(2, '0');
  const monthPrefix = `${year}-${pad2(month + 1)}`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = new Date(year, month, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  // Collect all dates this month
  const allDates = [];
  for (let d = 1; d <= daysInMonth; d++) allDates.push(dateStr(year, month, d));

  // Get blocked dates
  const blockedDates = state.holidays
    .filter(h => h.blockTasks)
    .flatMap(h => h.dates || [])
    .filter(d => d.startsWith(monthPrefix));

  // Holidays this month
  const monthHolidays = state.holidays.filter(h =>
    h.dates && h.dates.some(d => d.startsWith(monthPrefix))
  );
  const holidayDatesCount = new Set(monthHolidays.flatMap(h => h.dates.filter(d => d.startsWith(monthPrefix)))).size;

  // Jobs this month (flatten per-date, not blocked)
  const jobEntries = [];
  allDates.forEach(ds => {
    if (blockedDates.includes(ds)) return;
    const dayJobs = getJobsForDate(ds);
    dayJobs.forEach(j => {
      jobEntries.push({
        job: j,
        date: ds,
        tasks: j.tasks || [],
        completed: (j.completedTasks && j.completedTasks[ds]) || []
      });
    });
  });

  const totalJobTasks = jobEntries.reduce((sum, e) => sum + Math.max(e.tasks.length, 1), 0);
  const doneJobTasks = jobEntries.reduce((sum, e) => {
    if (e.tasks.length === 0) return sum + (e.completed.includes(0) ? 1 : 0);
    return sum + e.completed.length;
  }, 0);

  // Schedules this month (flatten per-date, not blocked)
  const scheduleEntries = [];
  allDates.forEach(ds => {
    if (blockedDates.includes(ds)) return;
    const daySchedules = state.schedules.filter(s => s.dates && s.dates.includes(ds));
    daySchedules.forEach(s => {
      scheduleEntries.push({
        schedule: s,
        date: ds,
        objectives: (s.objectives && s.objectives[ds]) || [],
        completed: (s.completedObjectives && s.completedObjectives[ds]) || []
      });
    });
  });

  // Unique schedule dates count
  const scheduleDatesCount = new Set(scheduleEntries.map(e => e.date)).size;

  // ── Stats Cards ──
  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card">
      <span class="stat-icon">📋</span>
      <span class="stat-value">${scheduleEntries.length}</span>
      <span class="stat-label">ตารางงาน (${scheduleDatesCount} วัน)</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">✅</span>
      <span class="stat-value">${doneJobTasks}/${totalJobTasks}</span>
      <span class="stat-label">งานที่เสร็จ</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">🎉</span>
      <span class="stat-value">${holidayDatesCount}</span>
      <span class="stat-label">วันหยุด</span>
    </div>
    <div class="stat-card">
      <span class="stat-icon">📅</span>
      <span class="stat-value">${daysInMonth - holidayDatesCount}</span>
      <span class="stat-label">วันทำงาน</span>
    </div>
  `;

  // ── Jobs Column ──
  const pendingEl = document.getElementById('dashJobsPending');
  const doneEl = document.getElementById('dashJobsDone');
  pendingEl.innerHTML = '';
  doneEl.innerHTML = '';
  document.getElementById('dashJobCount').textContent = jobEntries.length;

  jobEntries.forEach(({ job, date, tasks, completed }) => {
    const isJobWithoutTasks = tasks.length === 0;
    const allDone = isJobWithoutTasks 
      ? completed.includes(0) 
      : (tasks.length > 0 && tasks.every((_, idx) => completed.includes(idx)));
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

    const item = createDashJobItem(job, date, job.title, dateLabel, allDone, isJobWithoutTasks ? 0 : -1);
    (allDone ? doneEl : pendingEl).appendChild(item);
  });

  if (!pendingEl.children.length) pendingEl.innerHTML = '<div class="dash-item"><span style="color:var(--text2);font-size:12px">ไม่มีงานค้าง</span></div>';
  if (!doneEl.children.length) doneEl.innerHTML = '<div class="dash-item"><span style="color:var(--text2);font-size:12px">ยังไม่มีงานเสร็จ</span></div>';

  // ── Schedules Column ──
  const schedEl = document.getElementById('dashSchedules');
  const toggleBtn = document.getElementById('btnToggleDashObjectives');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', state.showDashObjectives);
    toggleBtn.textContent = state.showDashObjectives ? '👁️' : '🙈';
  }

  schedEl.innerHTML = '';
  document.getElementById('dashScheduleCount').textContent = scheduleEntries.length;

  if (!scheduleEntries.length) {
    schedEl.innerHTML = '<div class="dash-item"><span style="color:var(--text2);font-size:12px">ไม่มีตารางงาน</span></div>';
  }
  scheduleEntries.forEach(({ schedule: s, date, objectives, completed }) => {
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    const item = document.createElement('div');
    item.className = 'dash-item';
    
    let objHtml = '';
    if (objectives.length && state.showDashObjectives) {
      objHtml = `
        <div class="dash-item-objectives">
          ${objectives.map((obj, idx) => {
            const isDone = completed.includes(idx);
            return `
              <div class="dash-obj-row ${isDone ? 'done' : ''}">
                <input type="checkbox" ${isDone ? 'checked' : ''} data-idx="${idx}">
                <span>${obj}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    item.innerHTML = `
      <div class="dash-item-body">
        <div class="dash-item-title">
          <span class="color-bar" style="background:${s.color || '#7C3AED'}"></span>
          ${s.title}
          <span style="font-size:11px;color:var(--text2);font-weight:400;margin-left:auto">📅 ${dateLabel}</span>
        </div>
        <div class="dash-item-meta">
          ${s.branch ? `<span class="dash-branch-tag">📍 ${s.branch}</span>` : ''}
          <span>⏰ ${s.time || '-'}</span>
        </div>
        ${objHtml}
        ${s.note ? `<div class="dash-item-meta"><span>📝 ${s.note}</span></div>` : ''}
      </div>
    `;

    // Objective toggle logic
    item.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const co = { ...(s.completedObjectives || {}) };
        const arr = co[date] ? [...co[date]] : [];
        if (e.target.checked) { if (!arr.includes(idx)) arr.push(idx); }
        else { const pos = arr.indexOf(idx); if (pos > -1) arr.splice(pos, 1); }
        co[date] = arr;
        await api.put(`/api/schedules/${s.id}`, { completedObjectives: co });
        state.schedules = await api.get('/api/schedules');
        renderDashboard();
        renderCalendar();
      });
    });

    item.querySelector('.dash-item-title').style.cursor = 'pointer';
    item.querySelector('.dash-item-title').addEventListener('click', () => editSchedule(s.id));
    schedEl.appendChild(item);
  });

  // ── Holidays Column ──
  const holEl = document.getElementById('dashHolidays');
  holEl.innerHTML = '';
  document.getElementById('dashHolidayCount').textContent = holidayDatesCount;

  if (!monthHolidays.length) {
    holEl.innerHTML = '<div class="dash-item"><span style="color:var(--text2);font-size:12px">ไม่มีวันหยุด</span></div>';
  }
  monthHolidays.forEach(h => {
    const dates = (h.dates || []).filter(d => d.startsWith(monthPrefix)).sort();
    const datesLabel = dates.map(d => {
      return new Date(d + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    }).join(', ');

    const item = document.createElement('div');
    item.className = 'dash-item';
    item.innerHTML = `
      <div class="dash-holiday-color" style="background:${h.color || '#EF4444'}"></div>
      <div class="dash-item-body">
        <div class="dash-item-title">
          <span class="dash-holiday-type" style="background:${h.color || '#EF4444'}">${h.holidayType || 'วันหยุด'}</span>
          ${h.name || ''}
        </div>
        <div class="dash-item-meta"><span>📅 ${datesLabel}</span></div>
      </div>
    `;
    holEl.appendChild(item);
  });
}

function createDashJobItem(job, date, title, subtitle, isDone, taskIdx) {
  const item = document.createElement('div');
  item.className = 'dash-item' + (isDone ? ' checked' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'dash-job-check';
  cb.checked = isDone;

  const body = document.createElement('div');
  body.className = 'dash-item-body';
  const progress = (job.tasks && job.tasks.length) ? ` <span class="job-progress-mini">(${ (job.completedTasks && job.completedTasks[date] ? job.completedTasks[date].length : 0) }/${job.tasks.length})</span>` : '';
  body.innerHTML = `
    <div class="dash-item-title">
      <span class="color-bar" style="background:${job.color || '#0EA5E9'}"></span>
      ${title} ${progress}
    </div>
    <div class="dash-item-meta"><span>${subtitle} ${job.time ? '⏰ ' + job.time : ''}</span></div>
  `;

  // Clicking the body opens the detail modal for this job/date
  body.style.cursor = 'pointer';
  body.addEventListener('click', (e) => {
    e.stopPropagation();
    openDetailModal(date);
  });

  cb.addEventListener('change', async (e) => {
    e.stopPropagation();
    const allJobs = [...state.jobs];
    const jIdx = allJobs.findIndex(x => x.id === job.id);
    if (jIdx === -1) return;

    const ct = allJobs[jIdx].completedTasks || {};
    let arr = ct[date] ? [...ct[date]] : [];

    if (taskIdx === -1) {
      // Toggle the WHOLE job
      if (cb.checked) {
        // Mark all tasks as completed
        arr = (job.tasks || []).map((_, i) => i);
        if (arr.length === 0) arr = [0]; // Handle job without tasks
      } else {
        arr = [];
      }
    } else {
      // Toggle a specific task (from detail modal or if used elsewhere)
      if (cb.checked) {
        if (!arr.includes(taskIdx)) arr.push(taskIdx);
      } else {
        const pos = arr.indexOf(taskIdx);
        if (pos > -1) arr.splice(pos, 1);
      }
    }
    ct[date] = arr;

    await api.put(`/api/jobs/${job.id}`, { completedTasks: ct });
    state.jobs = await api.get('/api/jobs');

    // Animate the item
    item.style.transition = 'opacity .3s, transform .3s';
    item.style.opacity = '0';
    item.style.transform = 'translateX(' + (cb.checked ? '20px' : '-20px') + ')';
    setTimeout(() => {
      renderDashboard();
      renderCalendar();
    }, 300);
  });

  item.appendChild(cb);
  item.appendChild(body);
  return item;
}

// ── THEME TOGGLE ──────────────────────────────────────
function loadTheme() {
  const saved = localStorage.getItem('mp-theme') || 'dark';
  document.body.classList.toggle('light', saved === 'light');
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = saved === 'light' ? '🌙' : '☀';
}
safeAddListener('btnTheme', 'click', () => {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('mp-theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = isLight ? '🌙' : '☀';
});
loadTheme();

// ── KEYBOARD SHORTCUTS ────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
      const type = m.id.replace('modal','').toLowerCase();
      closeModal(type);
    });
    const menu = document.getElementById('fabMenu');
    const fab = document.getElementById('fabMain');
    if (menu) menu.classList.add('hidden');
    if (fab) fab.classList.remove('open');
  }
  if (e.key === 'ArrowLeft' && !e.target.matches('input,textarea,select')) {
    const btn = document.getElementById('btnPrevMonth');
    if (btn) btn.click();
  }
  if (e.key === 'ArrowRight' && !e.target.matches('input,textarea,select')) {
    const btn = document.getElementById('btnNextMonth');
    if (btn) btn.click();
  }
});

// ── INIT ──────────────────────────────────────────────
// Initialization is now handled by auth.onAuthStateChanged
