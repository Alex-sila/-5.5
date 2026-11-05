/* =========================================================
   CRM Рента — Модули 1–5
   ========================================================= */

// ---------- КОНФИГ (поменяй URL после деплоя Worker) ----------
const CONFIG = {
  WORKER_URL: 'https://renta-pro.YOUR-SUBDOMAIN.workers.dev', // ← ЗАМЕНИ
  PRICE_RUB: 990,
  FREE_LIMIT: 2,
};

const KEYS = {
  APARTMENTS: 'renta_apartments',
  DEVICE_ID: 'renta_device_id',
  IS_PRO: 'renta_isPro',
  PRO_EMAIL: 'renta_pro_email',
};

// ---------- СОСТОЯНИЕ ----------
let apartments = [];
let searchQuery = '';
let expandedIds = new Set();


/* =========================================================
   УТИЛИТЫ
   ========================================================= */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function formatMoney(n) {
  return (Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}


/* =========================================================
   ХРАНИЛИЩЕ
   ========================================================= */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(KEYS.APARTMENTS);
    apartments = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(apartments)) apartments = [];
  } catch (e) { console.error(e); apartments = []; }
}

function saveToStorage() {
  try {
    localStorage.setItem(KEYS.APARTMENTS, JSON.stringify(apartments));
  } catch (e) { console.error(e); }
}

function getDeviceId() {
  let id = localStorage.getItem(KEYS.DEVICE_ID);
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
    localStorage.setItem(KEYS.DEVICE_ID, id);
  }
  return id;
}

function isPro() {
  return localStorage.getItem(KEYS.IS_PRO) === 'true';
}

function grantPro() {
  localStorage.setItem(KEYS.IS_PRO, 'true');
  updateProUI();
}

function updateProUI() {
  const pro = isPro();
  document.getElementById('proBadge').hidden = !pro;
  document.getElementById('proBanner').hidden = pro;
}


/* =========================================================
   РАСЧЕТЫ
   ========================================================= */
function getApartmentProfit(a) {
  const income = Number(a.rentAmount) || 0;
  const exp = (Number(a.utilitiesAmount) || 0) + (Number(a.emergencyAmount) || 0);
  return income - exp;
}

function calculateTotals() {
  let inc = 0, exp = 0;
  apartments.forEach(a => {
    inc += Number(a.rentAmount) || 0;
    exp += (Number(a.utilitiesAmount) || 0) + (Number(a.emergencyAmount) || 0);
  });
  const profit = inc - exp;
  document.getElementById('statIncome').textContent = formatMoney(inc);
  document.getElementById('statExpense').textContent = formatMoney(exp);
  const pEl = document.getElementById('statProfit');
  pEl.textContent = formatMoney(profit);
  pEl.classList.toggle('negative', profit < 0);
}


/* =========================================================
   РЕНДЕР СПИСКА
   ========================================================= */
function getStatusBadge(status) {
  const map = {
    paid:    { text: 'Оплачено',    cls: 'badge-paid' },
    unpaid:  { text: 'Не оплачено', cls: 'badge-unpaid' },
    partial: { text: 'Частично',    cls: 'badge-partial' },
  };
  const s = map[status] || map.unpaid;
  return `<span class="badge ${s.cls}">${s.text}</span>`;
}

function renderList() {
  const listEl = document.getElementById('apartmentList');
  const emptyEl = document.getElementById('emptyState');
  const q = searchQuery.trim().toLowerCase();

  const filtered = apartments.filter(a => {
    if (!q) return true;
    return `${a.address || ''} ${a.tenantName || ''}`.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.innerHTML = apartments.length === 0
      ? '<p>Пока нет квартир</p><p class="hint">Нажмите «+», чтобы добавить первую</p>'
      : '<p>Ничего не найдено</p><p class="hint">Попробуйте изменить запрос</p>';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = filtered.map(renderCard).join('');
}

function renderCard(a) {
  const profit = getApartmentProfit(a);
  const isOpen = expandedIds.has(a.id);
  const cls = profit < 0 ? 'negative' : 'positive';

  return `
    <article class="apt-card ${isOpen ? 'open' : ''}" data-id="${a.id}">
      <div class="apt-summary" data-action="toggle">
        <div class="apt-summary-main">
          <div class="apt-address">${escapeHtml(a.address) || 'Без адреса'}</div>
          <div class="apt-tenant">${escapeHtml(a.tenantName) || '—'}</div>
        </div>
        <div class="apt-summary-right">
          ${getStatusBadge(a.paymentStatus)}
          <div class="apt-profit ${cls}">${formatMoney(profit)}</div>
          <div class="apt-chevron">${isOpen ? '▲' : '▼'}</div>
        </div>
      </div>
      <div class="apt-details">
        ${renderDetails(a)}
        <div class="apt-actions">
          <button type="button" class="btn btn-pdf ${isPro() ? '' : 'locked'}" data-action="pdf">🧾 PDF</button>
          <button type="button" class="btn btn-secondary" data-action="edit">Изменить</button>
          <button type="button" class="btn btn-danger" data-action="delete">Удалить</button>
        </div>
      </div>
    </article>
  `;
}

function renderDetails(a) {
  const inc = Number(a.rentAmount) || 0;
  const utils = Number(a.utilitiesAmount) || 0;
  const emerg = Number(a.emergencyAmount) || 0;
  const elDiff = (Number(a.meterElectricCurr) || 0) - (Number(a.meterElectricPrev) || 0);
  const wcDiff = (Number(a.meterWaterColdCurr) || 0) - (Number(a.meterWaterColdPrev) || 0);
  const whDiff = (Number(a.meterWaterHotCurr) || 0) - (Number(a.meterWaterHotPrev) || 0);

  return `
    <div class="detail-grid">
      <div class="detail-item"><span class="detail-label">Аренда</span><span class="detail-value positive">${formatMoney(inc)}</span></div>
      <div class="detail-item"><span class="detail-label">ЖКХ</span><span class="detail-value negative">${formatMoney(utils)}</span></div>
      <div class="detail-item"><span class="detail-label">Аварийка</span><span class="detail-value negative">${formatMoney(emerg)}</span></div>
      <div class="detail-item"><span class="detail-label">Договор до</span><span class="detail-value">${formatDate(a.contractEndDate)}</span></div>
    </div>
    <div class="meters-block">
      <div class="meters-title">Показания счетчиков</div>
      <div class="meter-line"><span>⚡ Электро</span><span>${a.meterElectricPrev || 0} → ${a.meterElectricCurr || 0}</span><span class="meter-diff">${elDiff} кВт</span></div>
      <div class="meter-line"><span>💧 Холодная</span><span>${a.meterWaterColdPrev || 0} → ${a.meterWaterColdCurr || 0}</span><span class="meter-diff">${wcDiff} м³</span></div>
      <div class="meter-line"><span>🔥 Горячая</span><span>${a.meterWaterHotPrev || 0} → ${a.meterWaterHotCurr || 0}</span><span class="meter-diff">${whDiff} м³</span></div>
    </div>
    ${a.tenantPhone ? `<div class="detail-line"><span class="detail-label">Телефон:</span> <a href="tel:${escapeHtml(a.tenantPhone)}">${escapeHtml(a.tenantPhone)}</a></div>` : ''}
    ${a.notes ? `<div class="detail-line"><span class="detail-label">Заметки:</span> ${escapeHtml(a.notes)}</div>` : ''}
  `;
}


/* =========================================================
   ФОРМА
   ========================================================= */
function openForm(apt) {
  document.getElementById('modalTitle').textContent = apt ? 'Редактировать квартиру' : 'Новая квартира';
  const set = (id, v) => { document.getElementById(id).value = (v ?? ''); };
  set('apartmentId', apt?.id);
  set('address', apt?.address);
  set('tenantName', apt?.tenantName);
  set('tenantPhone', apt?.tenantPhone);
  set('rentAmount', apt?.rentAmount);
  set('utilitiesAmount', apt?.utilitiesAmount);
  set('emergencyAmount', apt?.emergencyAmount);
  set('meterElectricPrev', apt?.meterElectricPrev);
  set('meterElectricCurr', apt?.meterElectricCurr);
  set('meterWaterColdPrev', apt?.meterWaterColdPrev);
  set('meterWaterColdCurr', apt?.meterWaterColdCurr);
  set('meterWaterHotPrev', apt?.meterWaterHotPrev);
  set('meterWaterHotCurr', apt?.meterWaterHotCurr);
  set('contractEndDate', apt?.contractEndDate);
  set('notes', apt?.notes);
  document.getElementById('paymentStatus').value = apt?.paymentStatus || 'unpaid';
  document.getElementById('modalOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeForm() {
  document.getElementById('modalOverlay').hidden = true;
  document.body.style.overflow = '';
}

function readForm() {
  const num = id => Number(document.getElementById(id).value) || 0;
  const str = id => document.getElementById(id).value.trim();
  return {
    address: str('address'),
    tenantName: str('tenantName'),
    tenantPhone: str('tenantPhone'),
    rentAmount: num('rentAmount'),
    utilitiesAmount: num('utilitiesAmount'),
    emergencyAmount: num('emergencyAmount'),
    meterElectricPrev:  num('meterElectricPrev'),
    meterElectricCurr:  num('meterElectricCurr'),
    meterWaterColdPrev: num('meterWaterColdPrev'),
    meterWaterColdCurr: num('meterWaterColdCurr'),
    meterWaterHotPrev:  num('meterWaterHotPrev'),
    meterWaterHotCurr:  num('meterWaterHotCurr'),
    paymentStatus: document.getElementById('paymentStatus').value,
    contractEndDate: document.getElementById('contractEndDate').value,
    notes: str('notes'),
  };
}


/* =========================================================
   CRUD (Модуль 1 + проверка лимита PRO)
   ========================================================= */
function addApartment(data) {
  if (!isPro() && apartments.length >= CONFIG.FREE_LIMIT) {
    alert(`Бесплатная версия — не больше ${CONFIG.FREE_LIMIT} квартир.\nКупите PRO, чтобы снять лимит.`);
    openBuyPro();
    return;
  }
  const apt = { id: uid(), ...data, createdAt: Date.now() };
  apartments.push(apt);
  saveToStorage();
  expandedIds.add(apt.id);
  renderAll();
  scheduleNotificationsForApartment(apt);
}

function editApartment(id, data) {
  const idx = apartments.findIndex(a => a.id === id);
  if (idx === -1) return;
  apartments[idx] = { ...apartments[idx], ...data, updatedAt: Date.now() };
  saveToStorage();
  renderAll();
  scheduleNotificationsForApartment(apartments[idx]);
}

function deleteApartment(id) {
  if (!confirm('Удалить эту квартиру?')) return;
  apartments = apartments.filter(a => a.id !== id);
  expandedIds.delete(id);
  saveToStorage();
  renderAll();
}

function renderAll() {
  renderList();
  calculateTotals();
}


/* =========================================================
   МОДУЛЬ 2: ЭКСПОРТ / ИМПОРТ
   ========================================================= */

// ----- JSON бэкап -----
function exportToJSON() {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    device_id: getDeviceId(),
    is_pro: isPro(),
    apartments,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `renta-backup-${todayStamp()}.json`);
}

function importFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const list = Array.isArray(data) ? data : data.apartments;
      if (!Array.isArray(list)) throw new Error('Неверный формат файла');
      if (!confirm(`Импортировать ${list.length} квартир? Текущие данные будут заменены.`)) return;
      apartments = list.map(a => ({ id: a.id || uid(), ...a }));
      saveToStorage();
      renderAll();
      alert('Импорт завершен ✅');
    } catch (err) {
      alert('Ошибка импорта: ' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ----- Excel -----
function exportToExcel() {
  if (!window.XLSX) { alert('Библиотека Excel не загружена'); return; }

  const rows = apartments.map(a => ({
    'ID': a.id,
    'Адрес': a.address || '',
    'ФИО': a.tenantName || '',
    'Телефон': a.tenantPhone || '',
    'Аренда': a.rentAmount || 0,
    'ЖКХ': a.utilitiesAmount || 0,
    'Аварийка': a.emergencyAmount || 0,
    'Электро (пред.)': a.meterElectricPrev || 0,
    'Электро (тек.)': a.meterElectricCurr || 0,
    'Холодная (пред.)': a.meterWaterColdPrev || 0,
    'Холодная (тек.)': a.meterWaterColdCurr || 0,
    'Горячая (пред.)': a.meterWaterHotPrev || 0,
    'Горячая (тек.)': a.meterWaterHotCurr || 0,
    'Статус оплаты': a.paymentStatus || 'unpaid',
    'Договор до': a.contractEndDate || '',
    'Заметки': a.notes || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Квартиры');
  XLSX.writeFile(wb, `renta-${todayStamp()}.xlsx`);
}

function importFromExcel(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      if (!confirm(`Импортировать ${rows.length} квартир? Текущие данные будут заменены.`)) return;

      apartments = rows.map(r => ({
        id: r['ID'] || uid(),
        address: r['Адрес'] || '',
        tenantName: r['ФИО'] || '',
        tenantPhone: String(r['Телефон'] || ''),
        rentAmount: Number(r['Аренда']) || 0,
        utilitiesAmount: Number(r['ЖКХ']) || 0,
        emergencyAmount: Number(r['Аварийка']) || 0,
        meterElectricPrev: Number(r['Электро (пред.)']) || 0,
        meterElectricCurr: Number(r['Электро (тек.)']) || 0,
        meterWaterColdPrev: Number(r['Холодная (пред.)']) || 0,
        meterWaterColdCurr: Number(r['Холодная (тек.)']) || 0,
        meterWaterHotPrev: Number(r['Горячая (пред.)']) || 0,
        meterWaterHotCurr: Number(r['Горячая (тек.)']) || 0,
        paymentStatus: r['Статус оплаты'] || 'unpaid',
        contractEndDate: r['Договор до'] || '',
        notes: r['Заметки'] || '',
      }));

      saveToStorage();
      renderAll();
      alert('Импорт Excel завершен ✅');
    } catch (err) {
      alert('Ошибка импорта Excel: ' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsArrayBuffer(file);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}


/* =========================================================
   МОДУЛЬ 3: PDF-КВИТАНЦИЯ
   ========================================================= */
async function generateReceipt(aptId) {
  if (!isPro()) {
    alert('PDF-квитанции доступны только в PRO версии');
    openBuyPro();
    return;
  }
  const apt = apartments.find(a => a.id === aptId);
  if (!apt) return;

  if (!window.html2canvas || !window.jspdf) {
    alert('Библиотеки PDF не загружены');
    return;
  }

  const template = document.getElementById('receiptTemplate');
  template.innerHTML = buildReceiptHtml(apt);
  template.style.display = 'block';

  try {
    const canvas = await html2canvas(template, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgW = 210;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);

    const filename = `Квитанция_${(apt.address || 'квартира').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}.pdf`;

    // Нативная отправка через Share
    if (isNative() && window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.Share) {
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const Fs = window.Capacitor.Plugins.Filesystem;
      const Share = window.Capacitor.Plugins.Share;
      const writeRes = await Fs.writeFile({
        path: filename,
        data: pdfBase64,
        directory: 'CACHE',
      });
      await Share.share({
        title: 'Квитанция',
        text: `Квитанция за квартиру ${apt.address}`,
        url: writeRes.uri,
        dialogTitle: 'Отправить квитанцию',
      });
    } else {
      // Браузер — просто скачиваем
      pdf.save(filename);
    }
  } catch (e) {
    console.error(e);
    alert('Ошибка генерации PDF: ' + e.message);
  } finally {
    template.style.display = 'none';
  }
}

function buildReceiptHtml(a) {
  const now = new Date();
  const monthName = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const rent = Number(a.rentAmount) || 0;
  const utils = Number(a.utilitiesAmount) || 0;
  const emerg = Number(a.emergencyAmount) || 0;
  const total = rent + utils + emerg;

  return `
    <h2>🏠 CRM Рента — Квитанция</h2>
    <p class="receipt-sub">Период: ${monthName} · Сформировано ${now.toLocaleDateString('ru-RU')}</p>

    <table>
      <tr><th style="width:35%">Адрес</th><td>${escapeHtml(a.address) || '—'}</td></tr>
      <tr><th>Жилец</th><td>${escapeHtml(a.tenantName) || '—'}</td></tr>
      <tr><th>Телефон</th><td>${escapeHtml(a.tenantPhone) || '—'}</td></tr>
    </table>

    <h3 style="margin-top:24px;font-size:16px">Показания счётчиков</h3>
    <table>
      <thead>
        <tr><th>Счётчик</th><th>Предыдущие</th><th>Текущие</th><th>Расход</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>⚡ Электричество</td>
          <td>${a.meterElectricPrev || 0}</td>
          <td>${a.meterElectricCurr || 0}</td>
          <td>${(Number(a.meterElectricCurr) || 0) - (Number(a.meterElectricPrev) || 0)} кВт</td>
        </tr>
        <tr>
          <td>💧 Холодная вода</td>
          <td>${a.meterWaterColdPrev || 0}</td>
          <td>${a.meterWaterColdCurr || 0}</td>
          <td>${(Number(a.meterWaterColdCurr) || 0) - (Number(a.meterWaterColdPrev) || 0)} м³</td>
        </tr>
        <tr>
          <td>🔥 Горячая вода</td>
          <td>${a.meterWaterHotPrev || 0}</td>
          <td>${a.meterWaterHotCurr || 0}</td>
          <td>${(Number(a.meterWaterHotCurr) || 0) - (Number(a.meterWaterHotPrev) || 0)} м³</td>
        </tr>
      </tbody>
    </table>

    <h3 style="margin-top:24px;font-size:16px">Начисления</h3>
    <table>
      <tr><th style="width:50%">Аренда</th><td style="text-align:right">${formatMoney(rent)}</td></tr>
      <tr><th>ЖКХ</th><td style="text-align:right">${formatMoney(utils)}</td></tr>
      <tr><th>Аварийка</th><td style="text-align:right">${formatMoney(emerg)}</td></tr>
    </table>

    <div class="total">ИТОГО К ОПЛАТЕ: ${formatMoney(total)}</div>

    <p class="receipt-footer">
      Сформировано в приложении «CRM Рента» · renta.app
    </p>
  `;
}


/* =========================================================
   МОДУЛЬ 4: PRO / ЮKASSA / WORKER
   ========================================================= */
function openBuyPro() {
  if (isPro()) { alert('У вас уже есть PRO ✅'); return; }
  const saved = localStorage.getItem(KEYS.PRO_EMAIL) || '';
  document.getElementById('proEmail').value = saved;
  document.getElementById('buyProOverlay').hidden = false;
}

function closeBuyPro() {
  document.getElementById('buyProOverlay').hidden = true;
}

async function startBuyPro() {
  const email = document.getElementById('proEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    alert('Введите корректный email');
    return;
  }

  const deviceId = getDeviceId();

  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/create-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        device_id: deviceId,
        return_url: `${CONFIG.WORKER_URL}/success`,
      }),
    });

    if (!res.ok) throw new Error('Worker вернул ошибку ' + res.status);
    const data = await res.json();
    if (!data.confirmation_url) throw new Error('Нет ссылки на оплату');

    localStorage.setItem(KEYS.PRO_EMAIL, email);

    if (isNative() && window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url: data.confirmation_url });
    } else {
      window.location.href = data.confirmation_url;
    }

    closeBuyPro();
  } catch (e) {
    console.error(e);
    alert('Не удалось создать платёж. Проверьте интернет и URL Worker.\n' + e.message);
  }
}

async function restorePro() {
  const email = document.getElementById('restoreEmail').value.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    alert('Введите корректный email');
    return;
  }

  const deviceId = getDeviceId();

  try {
    const res = await fetch(
      `${CONFIG.WORKER_URL}/restore?email=${encodeURIComponent(email)}&new_device_id=${encodeURIComponent(deviceId)}`
    );
    const data = await res.json();

    if (data.status === 'success') {
      grantPro();
      closeRestorePro();
      alert('✅ PRO восстановлен!');
    } else if (data.status === 'not_found') {
      alert('Такой email не найден. Проверьте, что вы указали его при покупке.');
    } else {
      alert('Не удалось восстановить. Попробуйте позже.');
    }
  } catch (e) {
    console.error(e);
    alert('Ошибка сети. Проверьте подключение.');
  }
}

function openRestorePro() {
  const saved = localStorage.getItem(KEYS.PRO_EMAIL) || '';
  document.getElementById('restoreEmail').value = saved;
  document.getElementById('restoreProOverlay').hidden = false;
}

function closeRestorePro() {
  document.getElementById('restoreProOverlay').hidden = true;
}

// Проверка статуса PRO при запуске
async function refreshProStatus() {
  const deviceId = getDeviceId();
  try {
    const res = await fetch(`${CONFIG.WORKER_URL}/check?device_id=${encodeURIComponent(deviceId)}`);
    const data = await res.json();
    if (data.isPro) {
      grantPro();
    }
  } catch (e) {
    // тихо игнорируем — остаёмся на локальном статусе
    console.warn('PRO check failed', e);
  }
}

// Обработка deep link renta://success
function setupDeepLink() {
  if (!isNative() || !window.Capacitor?.Plugins?.App) return;

  window.Capacitor.Plugins.App.addListener('appUrlOpen', async (event) => {
    const url = event.url || '';
    if (url.startsWith('renta://success')) {
      // Подождём секунду, чтобы webhook успел долететь
      await new Promise(r => setTimeout(r, 1500));
      await refreshProStatus();
      if (isPro()) {
        alert('✅ PRO активирован! Спасибо за покупку!');
        renderAll();
      } else {
        alert('Оплата обрабатывается. Откройте приложение через минуту — статус обновится автоматически.');
      }
    }
  });
}


/* =========================================================
   МОДУЛЬ 5: ЛОКАЛЬНЫЕ УВЕДОМЛЕНИЯ
   ========================================================= */
async function ensureNotificationPermission() {
  if (!isNative() || !window.Capacitor?.Plugins?.LocalNotifications) return false;
  const LN = window.Capacitor.Plugins.LocalNotifications;
  let perm = await LN.checkPermissions();
  if (perm.display !== 'granted') {
    perm = await LN.requestPermissions();
  }
  return perm.display === 'granted';
}

async function scheduleNotificationsForApartment(apt) {
  if (!isNative() || !apt?.contractEndDate) return;
  if (!(await ensureNotificationPermission())) return;

  const LN = window.Capacitor.Plugins.LocalNotifications;
  const end = new Date(apt.contractEndDate);
  const now = new Date();
  const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  // За 3 дня до конца договора (если ещё не прошло)
  if (daysLeft >= 0 && daysLeft <= 30) {
    const remindAt = new Date(end);
    remindAt.setDate(remindAt.getDate() - 3);
    remindAt.setHours(10, 0, 0, 0);

    if (remindAt > now) {
      // ID из хеша id квартиры, чтобы не плодить дубли
      const numericId = Math.abs(hashCode(apt.id)) % 100000;
      try {
        await LN.schedule({
          notifications: [{
            id: numericId,
            title: '📝 Скоро конец договора',
            body: `${apt.address} — до окончания 3 дня (${apt.tenantName || 'жилец'})`,
            schedule: { at: remindAt },
          }],
        });
      } catch (e) { console.warn('notify error', e); }
    }
  }
}

async function checkDailyReminders() {
  if (!isNative()) return;
  if (apartments.length === 0) return;
  if (!(await ensureNotificationPermission())) return;

  const now = new Date();
  const day = now.getDate();

  // 20–25 число — напомнить про показания
  if (day >= 20 && day <= 25) {
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.schedule({
        notifications: [{
          id: 1,
          title: '📊 Пора снять показания счётчиков',
          body: `Сегодня ${day}-е число. Не забудьте снять показания по ${apartments.length} квартир(ам).`,
          schedule: { at: new Date(Date.now() + 3000) },
        }],
      });
    } catch (e) { console.warn(e); }
  }
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}


/* =========================================================
   ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
function init() {
  loadFromStorage();
  getDeviceId();      // создаём ID при первом запуске
  renderAll();
  updateProUI();
  setupDeepLink();

  // FAB
  document.getElementById('fabAdd').addEventListener('click', () => {
    if (!isPro() && apartments.length >= CONFIG.FREE_LIMIT) {
      alert(`Бесплатная версия — до ${CONFIG.FREE_LIMIT} квартир.\nКупите PRO, чтобы снять лимит.`);
      openBuyPro();
      return;
    }
    openForm(null);
  });

  // Модалка формы
  document.getElementById('modalClose').addEventListener('click', closeForm);
  document.getElementById('btnCancel').addEventListener('click', closeForm);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeForm();
  });

  // Поиск
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderList();
  });

  // Submit формы
  document.getElementById('apartmentForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = readForm();
    if (!data.address) { alert('Укажите адрес'); return; }
    const id = document.getElementById('apartmentId').value;
    if (id) editApartment(id, data);
    else addApartment(data);
    closeForm();
  });

  // Делегирование кликов по карточкам
  document.getElementById('apartmentList').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = e.target.closest('.apt-card');
    if (!card) return;
    const id = card.dataset.id;
    const action = btn.dataset.action;

    if (action === 'toggle') {
      expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id);
      renderList();
    } else if (action === 'edit') {
      const apt = apartments.find(a => a.id === id);
      if (apt) openForm(apt);
    } else if (action === 'delete') {
      deleteApartment(id);
    } else if (action === 'pdf') {
      generateReceipt(id);
    }
  });

  // Кнопки экспорта/импорта
  document.getElementById('btnExportJson').addEventListener('click', exportToJSON);
  document.getElementById('btnImportJson').addEventListener('click', () => document.getElementById('fileInputJson').click());
  document.getElementById('fileInputJson').addEventListener('change', importFromJSON);
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
  document.getElementById('btnImportExcel').addEventListener('click', () => document.getElementById('fileInputExcel').click());
  document.getElementById('fileInputExcel').addEventListener('change', importFromExcel);

  // PRO
  document.getElementById('btnBuyPro').addEventListener('click', openBuyPro);
  document.getElementById('buyProClose').addEventListener('click', closeBuyPro);
  document.getElementById('buyProCancel').addEventListener('click', closeBuyPro);
  document.getElementById('buyProPay').addEventListener('click', startBuyPro);
  document.getElementById('linkRestore').addEventListener('click', e => {
    e.preventDefault();
    closeBuyPro();
    openRestorePro();
  });

  document.getElementById('restoreProClose').addEventListener('click', closeRestorePro);
  document.getElementById('restoreProCancel').addEventListener('click', closeRestorePro);
  document.getElementById('restoreProBtn').addEventListener('click', restorePro);

  // Сетевые проверки
  refreshProStatus();
  setTimeout(checkDailyReminders, 2000);
}

document.addEventListener('DOMContentLoaded', init);