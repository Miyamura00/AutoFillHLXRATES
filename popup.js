/* =========================================================
   Hotel Rate Filler v2 — Groq Vision + Adaptive Page Fill
   ========================================================= */

// ── State ──────────────────────────────────────────────────
let imageBase64    = null;
let imageType      = null;
let savedRates     = null;   // { RoomType: { "2": num, ... } }
let isEditing      = false;
let disabledRooms  = new Set(); // room names toggled off — will not be filled
let roomAliases    = {};        // { "originalName": "aliasOnPage" }

const SLOTS       = ['2','3','6','10','10ONP','12','24'];
const SLOT_LABELS = { '2':'2H','3':'3H','6':'6H','10':'10H','10ONP':'10H ONP','12':'12H','24':'24H','OT':'OT' };

// ── DOM refs ───────────────────────────────────────────────
const $ = id => document.getElementById(id);

const settingsToggle    = $('settingsToggle');
const settingsPanel     = $('settingsPanel');
const apiKeyInput       = $('apiKeyInput');
const toggleApiKeyBtn   = $('toggleApiKey');
const saveApiKeyBtn     = $('saveApiKey');
const apiStatus         = $('apiStatus');

const uploadZone        = $('uploadZone');
const fileInput         = $('fileInput');
const previewWrap       = $('previewWrap');
const previewImg        = $('previewImg');
const clearImageBtn     = $('clearImage');

const parseBtn          = $('parseBtn');
const parseStatus       = $('parseStatus');
const rateTableWrap     = $('rateTableWrap');
const rateTableContainer= $('rateTableContainer');
const editRatesBtn      = $('editRatesBtn');
const saveRatesBtn      = $('saveRatesBtn');
const useRatesBtn       = $('useRatesBtn');
const savedBadge        = $('savedBadge');

const fillBtn           = $('fillBtn');
const fillStatus        = $('fillStatus');
const fillResults       = $('fillResults');
const saveAllBtn        = $('saveAllBtn');
const saveAllStatus     = $('saveAllStatus');
const noRatesWarn       = $('noRatesWarn');
const ratePreviewSection= $('ratePreviewSection');
const previewRateTable  = $('previewRateTable');
const fillAllDays       = $('fillAllDays');
const fillAllRateRows   = $('fillAllRateRows');
const extraHrChgInput   = $('extraHrChgInput');

// ── Init ───────────────────────────────────────────────────
(async () => {
  const { apiKey, savedRates: stored, extraHrChg, disabledRooms: storedDR, roomAliases: storedRA }
    = await chrome.storage.local.get(['apiKey','savedRates','extraHrChg','disabledRooms','roomAliases']);
  if (apiKey) { apiKeyInput.value = apiKey; apiStatus.textContent = '✓ API key saved'; }
  if (extraHrChg != null) extraHrChgInput.value = extraHrChg;
  if (storedDR) disabledRooms = new Set(storedDR);
  if (storedRA) roomAliases   = storedRA;
  if (stored) {
    savedRates = stored;
    renderRateTable(savedRates, false);
    rateTableWrap.style.display = 'block';
    savedBadge.style.display = 'flex';
    noRatesWarn.style.display = 'none';
    fillBtn.disabled = false;
    updateSlotPreview();
  }
})();

// ── Settings ───────────────────────────────────────────────
settingsToggle.addEventListener('click', () => settingsPanel.classList.toggle('open'));
toggleApiKeyBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});
saveApiKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key.startsWith('gsk_')) {
    apiStatus.style.color = 'var(--danger)';
    apiStatus.textContent = '⚠ Groq keys start with gsk_';
    return;
  }
  await chrome.storage.local.set({ apiKey: key });
  apiStatus.style.color = 'var(--success)';
  apiStatus.textContent = '✓ Saved';
  setTimeout(() => settingsPanel.classList.remove('open'), 700);
});

// ── Tabs ───────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── File Upload ────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f?.type.startsWith('image/')) loadFile(f);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

clearImageBtn.addEventListener('click', () => {
  imageBase64 = imageType = null;
  previewWrap.style.display = 'none';
  uploadZone.style.display = 'block';
  parseBtn.disabled = true;
  fileInput.value = '';
  setStatus(parseStatus, '', '');
});

function loadFile(file) {
  imageType = file.type;
  const reader = new FileReader();
  reader.onload = e => {
    imageBase64 = e.target.result.split(',')[1];
    previewImg.src = e.target.result;
    previewWrap.style.display = 'block';
    uploadZone.style.display = 'none';
    parseBtn.disabled = false;
    setStatus(parseStatus, '', '');
  };
  reader.readAsDataURL(file);
}

// ── Parse Rates via Groq ───────────────────────────────────
parseBtn.addEventListener('click', async () => {
  if (!imageBase64) return;
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    setStatus(parseStatus, 'error', '⚠ Save your Groq API key in Settings first.');
    settingsPanel.classList.add('open');
    return;
  }
  parseBtn.disabled = true;
  parseBtn.innerHTML = `<span class="spinner"></span> Extracting…`;
  setStatus(parseStatus, 'loading', 'Sending to Groq AI…');

  try {
    const rates = await extractRatesWithGroq(apiKey, imageBase64, imageType);
    savedRates = rates;
    renderRateTable(rates, false);
    rateTableWrap.style.display = 'block';
    setStatus(parseStatus, 'success', `✓ Found ${Object.keys(rates).length} room types`);
  } catch(err) {
    setStatus(parseStatus, 'error', '✗ ' + (err.message || 'Unknown error'));
    console.error(err);
  } finally {
    parseBtn.disabled = false;
    parseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13 9H9l-1 6h4l-1 6 6-8h-4l1-4z" fill="currentColor"/></svg>Extract Rates with Groq AI`;
  }
});

async function extractRatesWithGroq(apiKey, base64, mediaType) {
  const prompt = `Extract the hotel rate table from this image.
Return ONLY valid JSON (no markdown, no extra text) in this exact format:
{
  "RoomTypeName": { "2": number_or_null, "3": number_or_null, "6": number_or_null, "10": number_or_null, "10ONP": number_or_null, "12": number_or_null, "24": number_or_null, "otCharge": number_or_null }
}
Rules:
- Include ALL room types visible (e.g. Econo, Premium, De luxe, Regency, Regular, Executive, Mega, etc.)
- Room type names exactly as shown
- Numbers only, no commas or currency symbols
- null for missing/dash values
- LOS column mapping (read column headers carefully):
  "2"     = 2-hour rate
  "3"     = 3-hour rate
  "6"     = 6-hour rate
  "12"    = 12-hour rate
  "24"    = 24-hour rate
  "10"    = 10-hour REGULAR / DAYTIME rate
             → keywords: REGULAR, daytime, 6:01 AM to 7:59 PM, morning start
             → this is the NORMAL 10-hour column
  "10ONP" = 10-hour OVERNIGHT / ONP rate (completely separate column)
             → keywords: ONP, overnight, 8PM to 6AM, night rate, Sun to Fri night
             → if the column header contains "ONP" or "overnight" → ALWAYS use "10ONP"
  CRITICAL: "10" and "10ONP" are TWO DIFFERENT columns. Never mix them.
            A dash/blank in a column means null — do not copy the other 10hr value.
- otCharge: overtime/extra hour charge per room type shown in the Overtime column, otherwise null`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 1500,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.choices?.[0]?.message?.content || '';
  // Strip possible markdown fences
  const clean = raw.replace(/```json|```/gi, '').trim();
  // Extract JSON object
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not parse JSON from response');
  return JSON.parse(match[0]);
}

// ── Rate Table Render ──────────────────────────────────────
function renderRateTable(ratesObj, editable) {
  const rooms = Object.keys(ratesObj);
  if (!rooms.length) { rateTableContainer.innerHTML = '<p style="padding:10px;color:var(--text-muted);font-size:11px">No data found</p>'; return; }

  let html = '<table class="rate-tbl"><thead><tr><th>Room Type</th>';
  SLOTS.forEach(s => html += `<th>${SLOT_LABELS[s]}</th>`);
  html += '<th style="color:var(--warning)">OT Chg</th>';
  html += '</tr></thead><tbody>';

  rooms.forEach(room => {
    const r = ratesObj[room] || {};
    html += `<tr><td>${esc(room)}</td>`;
    SLOTS.forEach(s => {
      const v = r[s];
      if (editable) {
        html += `<td><input type="number" data-room="${esc(room)}" data-slot="${s}" value="${v ?? ''}" placeholder="—"></td>`;
      } else {
        html += `<td style="color:${v != null ? 'var(--text-primary)' : 'var(--text-muted)'}">${v != null ? v : '—'}</td>`;
      }
    });
    // OT Charge column
    const ot = r['otCharge'];
    if (editable) {
      html += `<td><input type="number" data-room="${esc(room)}" data-slot="otCharge" value="${ot ?? ''}" placeholder="—" style="border-color:rgba(224,154,48,.4)"></td>`;
    } else {
      html += `<td style="color:${ot != null ? 'var(--warning)' : 'var(--text-muted)'}">${ot != null ? ot : '—'}</td>`;
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  rateTableContainer.innerHTML = html;
}

const esc = s => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

editRatesBtn.addEventListener('click', () => {
  isEditing = !isEditing;
  renderRateTable(savedRates, isEditing);
  editRatesBtn.textContent = isEditing ? 'Cancel' : 'Edit';
  saveRatesBtn.style.display = isEditing ? 'inline' : 'none';
});

saveRatesBtn.addEventListener('click', async () => {
  const updated = {};
  rateTableContainer.querySelectorAll('input[data-room]').forEach(inp => {
    const room = inp.dataset.room; const slot = inp.dataset.slot;
    if (!updated[room]) updated[room] = {};
    const v = parseFloat(inp.value);
    updated[room][slot] = isNaN(v) ? null : v;
  });
  savedRates = updated;
  isEditing = false;
  renderRateTable(updated, false);
  editRatesBtn.textContent = 'Edit';
  saveRatesBtn.style.display = 'none';
  // Auto-persist rates to storage
  await chrome.storage.local.set({ savedRates });
  savedBadge.style.display = 'flex';
  fillBtn.disabled = false;
  noRatesWarn.style.display = 'none';
  updateSlotPreview();
});

useRatesBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ savedRates });
  savedBadge.style.display = 'flex';
  fillBtn.disabled = false;
  noRatesWarn.style.display = 'none';
  updateSlotPreview();
  // Switch to Fill tab
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="fill"]').classList.add('active');
  $('tab-fill').classList.add('active');
});

// ── Slot Preview ───────────────────────────────────────────
document.querySelectorAll('input[name="slot"]').forEach(r => r.addEventListener('change', updateSlotPreview));

// ── Inject OT slot radio button ────────────────────────────────────────────
(function injectOtSlot() {
  const slotInputs = [...document.querySelectorAll('input[name="slot"]')];
  if (!slotInputs.length) return;
  const lastInput = slotInputs[slotInputs.length - 1];
  // Find the immediate wrapper element for the last slot button
  const itemEl = lastInput.closest('label') || lastInput.parentElement;
  const clone   = itemEl.cloneNode(true);
  // Update the cloned input
  const ci = clone.querySelector('input[name="slot"]') || (clone.tagName === 'INPUT' ? clone : null);
  if (ci) { ci.value = 'OT'; ci.id = 'slotOT'; ci.checked = false; }
  // Replace every leaf text node with "OT"
  (function replaceText(node) {
    node.childNodes.forEach(n => {
      if (n.nodeType === 3 && n.textContent.trim()) n.textContent = 'OT';
      else if (n.nodeType === 1 && n.tagName !== 'INPUT') replaceText(n);
    });
  })(clone);
  clone.querySelectorAll('label[for]').forEach(l => l.setAttribute('for', 'slotOT'));
  if (clone.tagName === 'LABEL' && clone.getAttribute('for')) clone.setAttribute('for', 'slotOT');
  // Mark it so CSS can style it distinctly if needed
  clone.dataset.otSlot = 'true';
  itemEl.after(clone);
  clone.querySelector('input[name="slot"]')?.addEventListener('change', updateSlotPreview);
})();


function updateSlotPreview() {
  if (!savedRates) return;
  const slot  = document.querySelector('input[name="slot"]:checked')?.value;
  const isOt  = slot === 'OT';
  const rooms = Object.keys(savedRates);
  if (!rooms.length) return;

  let html = '';
  rooms.forEach(room => {
    const enabled = !disabledRooms.has(room);
    const alias   = roomAliases[room] || '';
    const rate    = isOt ? savedRates[room]?.otCharge : savedRates[room]?.[slot];
    const rateStr = rate != null ? '&#x20B1;&nbsp;' + Number(rate).toLocaleString() : 'N/A';
    const roomEsc = esc(room);
    html += `
      <div class="prv-row ${enabled ? '' : 'prv-row--off'}" data-room="${roomEsc}">
        <label class="room-toggle" title="${enabled ? 'Disable' : 'Enable'} this room type">
          <input type="checkbox" class="room-chk" data-room="${roomEsc}" ${enabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
        <div class="prv-names">
          <span class="preview-room-name">${roomEsc}</span>
          ${alias ? `<span class="room-alias-badge">&rarr; ${esc(alias)}</span>` : ''}
        </div>
        <button class="btn-rename-open" data-room="${roomEsc}" title="Set page alias">&#9998;</button>
        <span class="preview-room-rate ${rate == null ? 'na' : ''}">${rateStr}</span>
      </div>
      <div class="rename-panel" data-room="${roomEsc}" style="display:none">
        <input type="text" class="text-input rename-inp" data-room="${roomEsc}"
               placeholder="Alias on page (e.g. MC Deluxe)" value="${esc(alias)}">
        <div class="rename-actions">
          <button class="btn-save-alias btn-save" data-room="${roomEsc}">Save</button>
          <button class="btn-clear-alias btn-text" data-room="${roomEsc}">Clear</button>
        </div>
      </div>`;
  });
  previewRateTable.innerHTML = html;
  ratePreviewSection.style.display = 'block';

  // ── Bind toggle events ──────────────────────────────────
  previewRateTable.querySelectorAll('.room-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      const room = chk.dataset.room;
      if (chk.checked) disabledRooms.delete(room);
      else             disabledRooms.add(room);
      // visual feedback immediately
      const row = previewRateTable.querySelector(`.prv-row[data-room="${room}"]`);
      if (row) row.classList.toggle('prv-row--off', !chk.checked);
      await chrome.storage.local.set({ disabledRooms: [...disabledRooms] });
    });
  });

  // ── Bind rename open/close ──────────────────────────────
  previewRateTable.querySelectorAll('.btn-rename-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const room  = btn.dataset.room;
      const panel = previewRateTable.querySelector(`.rename-panel[data-room="${room}"]`);
      if (!panel) return;
      const open = panel.style.display === 'none';
      // close all panels first
      previewRateTable.querySelectorAll('.rename-panel').forEach(p => p.style.display = 'none');
      previewRateTable.querySelectorAll('.btn-rename-open').forEach(b => b.classList.remove('active'));
      if (open) { panel.style.display = 'flex'; btn.classList.add('active'); panel.querySelector('.rename-inp')?.focus(); }
    });
  });

  // ── Bind alias save ─────────────────────────────────────
  previewRateTable.querySelectorAll('.btn-save-alias').forEach(btn => {
    btn.addEventListener('click', async () => {
      const room  = btn.dataset.room;
      const panel = previewRateTable.querySelector(`.rename-panel[data-room="${room}"]`);
      const inp   = panel?.querySelector('.rename-inp');
      const val   = inp?.value.trim() || '';
      if (val) roomAliases[room] = val;
      else     delete roomAliases[room];
      await chrome.storage.local.set({ roomAliases });
      panel.style.display = 'none';
      updateSlotPreview(); // re-render with updated badge
    });
  });

  // ── Bind alias clear ────────────────────────────────────
  previewRateTable.querySelectorAll('.btn-clear-alias').forEach(btn => {
    btn.addEventListener('click', async () => {
      const room = btn.dataset.room;
      delete roomAliases[room];
      await chrome.storage.local.set({ roomAliases });
      updateSlotPreview();
    });
  });

  // ── Allow Enter key in rename input ────────────────────
  previewRateTable.querySelectorAll('.rename-inp').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        previewRateTable.querySelector(`.btn-save-alias[data-room="${inp.dataset.room}"]`)?.click();
      } else if (e.key === 'Escape') {
        previewRateTable.querySelectorAll('.rename-panel').forEach(p => p.style.display = 'none');
      }
    });
  });
}

// ── Fill Form ──────────────────────────────────────────────
fillBtn.addEventListener('click', async () => {
  if (!savedRates) return;
  const slot      = document.querySelector('input[name="slot"]:checked')?.value;
  const allDays   = fillAllDays.checked;
  const allRows   = fillAllRateRows.checked;
  const rawExtra  = extraHrChgInput.value.trim();
  const extraHrChgRate = rawExtra !== '' ? parseFloat(rawExtra) : null;
  const otMode    = slot === 'OT';

  // Persist extra hr chg value
  if (extraHrChgRate != null) chrome.storage.local.set({ extraHrChg: extraHrChgRate });

  // Per-room OT charges from the rate sheet
  const roomOtCharges = {};
  Object.keys(savedRates).forEach(room => {
    const ot = savedRates[room]?.otCharge;
    if (ot != null) roomOtCharges[room] = ot;
  });

  // Build rates map for this slot: { roomType: rateNumber }
  // — skip rooms that the user has disabled
  const slotRates = {};
  if (otMode) {
    Object.keys(savedRates).forEach(room => {
      if (disabledRooms.has(room)) return;
      const ot = savedRates[room]?.otCharge;
      if (ot != null) slotRates[room] = ot;
    });
  } else {
    Object.keys(savedRates).forEach(room => {
      if (disabledRooms.has(room)) return;
      const v = savedRates[room]?.[slot];
      if (v != null) slotRates[room] = v;
    });
  }

  if (!Object.keys(slotRates).length) {
    setStatus(fillStatus, 'error', otMode
      ? '✗ No OT charges found — add them in the Rates tab (OT Chg column)'
      : `✗ No rates available for ${SLOT_LABELS[slot]}`);
    return;
  }

  fillBtn.disabled = true;
  fillBtn.innerHTML = `<span class="spinner"></span> Filling…`;
  setStatus(fillStatus, 'loading', '');
  fillResults.style.display = 'none';
  saveAllBtn.style.display = 'none';
  saveAllStatus.textContent = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillAllRoomTypes,
      args: [slotRates, allDays, allRows, extraHrChgRate, roomOtCharges, otMode, roomAliases],
      world: 'MAIN'
    });

    const res = results?.[0]?.result || [];
    renderFillResults(res);
    const filled = res.filter(r => r.status === 'ok').length;
    const total  = res.length;
    setStatus(fillStatus, filled > 0 ? 'success' : 'error',
      filled > 0 ? `✓ Filled ${filled} of ${total} room type(s)` : '✗ No room types matched on this page');
  } catch(err) {
    setStatus(fillStatus, 'error', '✗ ' + (err.message || 'Script error'));
  } finally {
    fillBtn.disabled = false;
    fillBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Fill All Room Types on Page`;
  }
});

function renderFillResults(res) {
  if (!res.length) return;
  let html = '';
  res.forEach(r => {
    const dot = r.status === 'ok' ? 'ok' : r.status === 'skip' ? 'skip' : 'err';
    html += `<div class="fill-result-row">
      <div class="fill-result-dot ${dot}"></div>
      <span class="fill-result-name">${esc(r.room)}</span>
      <span class="fill-result-msg">${esc(r.msg)}</span>
    </div>`;
  });
  fillResults.innerHTML = html;
  fillResults.style.display = 'block';
  // Show Save All button so user can commit all rooms in one click
  const anyFilled = res.some(r => r.status === 'ok');
  saveAllBtn.style.display = anyFilled ? 'flex' : 'none';
}

// ── Save All Rooms ─────────────────────────────────────────
saveAllBtn.addEventListener('click', async () => {
  saveAllBtn.disabled = true;
  saveAllBtn.innerHTML = `<span class="spinner"></span> Saving…`;
  saveAllStatus.className = 'fill-status loading';
  saveAllStatus.textContent = 'Clicking Save on all rooms…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: saveAllRoomTypes,
      args: [],
      world: 'MAIN'
    });
    const res = results?.[0]?.result || { saved: 0, total: 0 };
    saveAllStatus.className = res.saved > 0 ? 'fill-status success' : 'fill-status error';
    saveAllStatus.textContent = res.saved > 0
      ? `✓ Saved ${res.saved} of ${res.total} room(s)`
      : '✗ No Save buttons found on page';
  } catch(err) {
    saveAllStatus.className = 'fill-status error';
    saveAllStatus.textContent = '✗ ' + (err.message || 'Script error');
  } finally {
    saveAllBtn.disabled = false;
    saveAllBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><polyline points="17 21 17 13 7 13 7 21" stroke="currentColor" stroke-width="2"/><polyline points="7 3 7 8 15 8" stroke="currentColor" stroke-width="2"/></svg>Save All Rooms`;
  }
});

// ── Helpers ────────────────────────────────────────────────
function setStatus(el, cls, msg) {
  el.className = 'parse-status' === el.id ? `parse-status ${cls}` : `fill-status ${cls}`;
  el.textContent = msg;
}

// ── Content Script: injected into the page ─────────────────
/**
 * slotRates: { "Executive": 855, "Regency": 715, ... }
 * allDays: bool — if false, only fill first day column (Monday)
 * allRows: bool — if false, only fill Base(0) row
 */
async function fillAllRoomTypes(slotRates, allDays, allRows, extraHrChgRate, roomOtCharges, otMode, roomAliases) {
  roomAliases = roomAliases || {};
  const RATE_ROW_KEYWORDS = ['base', 'single', 'double', 'triple'];
  const SKIP_ROW_KEYWORDS = ['bed'];
  const EXTRA_HR_KEYWORDS = ['extra hr', 'extra hour'];
  const results = [];
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ── setValue: click + focus + set + fire events ─────────
  function setValue(input, num) {
    const existing = input.value;
    let fmt;
    if (/\.\d{5,}/.test(existing))     fmt = num.toFixed(6);
    else if (/\.\d{2}$/.test(existing)) fmt = num.toFixed(2);
    else                                fmt = String(num);

    input.click();
    ['mousedown','mouseup','click'].forEach(e =>
      input.dispatchEvent(new MouseEvent(e, { bubbles: true, cancelable: true })));
    input.focus();
    input.dispatchEvent(new FocusEvent('focus',   { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    input.select();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter ? setter.call(input, fmt) : (input.value = fmt);
    ['input','change','keydown','keyup','blur'].forEach(e =>
      input.dispatchEvent(new Event(e, { bubbles: true, cancelable: true })));
  }

  // ── Name normalization & matching ───────────────────────
  // Strip spaces/hyphens/dots, lowercase → "De luxe" = "deluxe"
  function norm(s) { return s.toLowerCase().replace(/[\s\-\.]+/g, ''); }

  function matchesRoom(pageText, rateName) {
    const np = norm(pageText), nr = norm(rateName);
    if (np === nr) return true;                    // exact normalized match

    // ── Case A: page text starts with rate name ──────────────────────────────
    // e.g. page "Executive Adult: 2 Child: 0" matches rate "Executive"
    // e.g. page "MC Deluxe Adult: ..."       matches rate "MC Delux"  (fuzzy: 1 trailing char)
    if (np.startsWith(nr)) {
      const origLow = pageText.toLowerCase();
      let ni = 0, oi = 0;
      while (ni < nr.length && oi < origLow.length) {
        if (/[\s\-\.]/.test(origLow[oi])) { oi++; continue; }
        ni++; oi++;
      }
      const after = origLow[oi];
      if (!after || /[^a-z]/.test(after)) return true;   // clean word boundary ✓
      // Fuzzy: allow exactly 1 trailing alpha char after the matched portion
      // Handles "MC Delux" (rate) vs "MC Deluxe" (page) — the 'e' is the tail
      const tail = np.slice(nr.length);
      if (tail.length === 1 && /^[a-z]$/.test(tail)) return true;
    }

    // ── Case B: rate name starts with page text ───────────────────────────────
    // e.g. rate "MC Deluxe" vs page text "MC Delux" — rate is longer by 1 char
    if (nr.startsWith(np) && !np.startsWith(nr)) {
      const tail = nr.slice(np.length);
      if (tail.length === 1 && /^[a-z]$/.test(tail)) return true;
    }

    return false;
  }

  // ── Find the <TR> that is the header for this room ──────
  function findHeaderRow(roomName) {
    function trFor(el) {
      let e = el;
      while (e && e !== document.body) {
        if (e.tagName === 'TR') return e;
        e = e.parentElement;
      }
      return null;
    }

    // Pass A: text-node walker (most precise)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = walker.nextNode())) {
      const t = tn.textContent.trim();
      if (t && matchesRoom(t, roomName)) {
        const tr = trFor(tn.parentElement);
        if (tr) return tr;
      }
    }

    // Pass B: element query (room name might be inside <b> or <span>)
    for (const el of document.querySelectorAll('td,th,b,strong,span,a,label,div')) {
      if (el.querySelectorAll('tr,td,th').length > 2) continue; // skip big containers
      const t = el.textContent.trim();
      if (t && matchesRoom(t, roomName)) {
        const tr = trFor(el);
        if (tr) return tr;
      }
    }
    return null;
  }

  // ── Is this <TR> a room-section header? ─────────────────
  // Header rows have action buttons (Edit / Change / Copy All) and almost no inputs
  function isRoomHeader(tr) {
    const ACTION = ['edit','change','copy all','copy cell','save','cancel'];
    const hasAction = Array.from(tr.querySelectorAll('button,a,input[type="button"]'))
      .some(b => ACTION.includes(b.textContent.trim().toLowerCase()));
    const inputCount = tr.querySelectorAll('input[type="text"],input[type="number"],input:not([type])').length;
    return hasAction && inputCount < 3;
  }

  // ── Build a proxy so fillSection / isEditable / clickEditButton
  //    can call querySelectorAll on our logical row-group ───
  function makeProxy(rows) {
    return {
      querySelectorAll(sel) {
        const out = [];
        for (const row of rows) {
          if (row.matches && row.matches(sel)) out.push(row);
          out.push(...row.querySelectorAll(sel));
        }
        return out;
      }
    };
  }

  // ── Locate the section for a given room ─────────────────
  function findRoomSection(roomName) {
    const headerRow = findHeaderRow(roomName);
    if (!headerRow) return null;

    // CASE 1: each section has its own <tbody> → return it directly
    const par = headerRow.parentElement;
    if (par && par.tagName === 'TBODY' && par.querySelectorAll('tr').length <= 12) {
      return par;
    }

    // CASE 2: flat table — collect header + siblings until next room header
    const rows = [headerRow];
    let sib = headerRow.nextElementSibling;
    while (sib) {
      if (sib.tagName === 'TBODY') { sib = sib.firstElementChild; continue; }
      if (sib.tagName !== 'TR') break;
      if (isRoomHeader(sib)) break;   // next room starts here
      rows.push(sib);
      sib = sib.nextElementSibling;
    }

    return makeProxy(rows);
  }

  // ── Edit-mode helpers ───────────────────────────────────
  function isEditable(section) {
    const inputs = section.querySelectorAll('input[type="text"],input[type="number"],input:not([type])');
    return inputs.length > 0 && !inputs[0].disabled && !inputs[0].readOnly;
  }

  function clickEditButton(section) {
    for (const btn of section.querySelectorAll('button,input[type="button"],a')) {
      if (btn.textContent.trim().toLowerCase() === 'edit') { btn.click(); return true; }
    }
    return false;
  }

  // ── Row classifiers ─────────────────────────────────────
  function isRateRow(label) {
    const t = label.toLowerCase().trim();
    if (SKIP_ROW_KEYWORDS.some(k => t.includes(k))) return false;
    if (EXTRA_HR_KEYWORDS.some(k => t.includes(k))) return false;
    if (!allRows) return t.startsWith('base');
    return RATE_ROW_KEYWORDS.some(k => t.startsWith(k));
  }

  function isExtraHrRow(label) {
    const t = label.toLowerCase().trim();
    return EXTRA_HR_KEYWORDS.some(k => t.includes(k));
  }

  // ── Fill adult inputs in one <TR> ───────────────────────
  function fillRowInputs(row, val) {
    const inputs = Array.from(
      row.querySelectorAll('input[type="text"],input[type="number"],input:not([type])')
    );
    let n = 0;
    inputs.forEach((inp, i) => {
      if (inp.disabled || inp.readOnly) return;
      if (i % 2 !== 0) return;                        // skip Ex.Child columns
      if (!allDays && Math.floor(i / 2) > 0) return;  // Monday only
      setValue(inp, val);
      n++;
    });
    return n;
  }

  // ── Fill all rows in a section ──────────────────────────
  function fillSection(section, rate, roomOtRate) {
    let count = 0;
    for (const row of section.querySelectorAll('tr')) {
      const cell = row.querySelector ? row.querySelector('td:first-child,th:first-child') : null;
      const label = cell ? cell.textContent.trim() : '';
      const labelLow = label.toLowerCase();

      // ── GATE 1: Attribute-based block (catches Bed/Extra Hr even with split-table layout) ──
      // Hotelogix uses a split layout: row labels (Bed, Extra Hr Chg) are in a SEPARATE
      // left-side table. The input rows in the right table have NO visible label text, so
      // we detect Bed and Extra Hr Chg rows via HTML attributes on their td/input elements:
      //   tdfor="bed"  / boxfor="bed"  / name contains "Bed["
      //   tdfor="lco"  / boxfor="lco"  / name contains "Lco["
      const isBedOrLcoRow = !!row.querySelector(
        'td[tdfor="bed"], td[tdfor="lco"], ' +
        'input[boxfor="bed"], input[boxfor="lco"], ' +
        'input[name*="Bed["], input[name*="Lco["]' 
      );
      if (isBedOrLcoRow) continue;

      // ── GATE 2: Label-based block (for tables where label IS in the same row) ──
      if (label) {
        if (SKIP_ROW_KEYWORDS.some(k => labelLow.includes(k))) continue;
        if (isExtraHrRow(label)) continue;
        if (!RATE_ROW_KEYWORDS.some(k => labelLow.startsWith(k))) continue;
        if (!allRows && !labelLow.startsWith('base')) continue;
      }

      // ── GATE 3: Skip rows with no fillable inputs ─────────────────────────
      if (!row.querySelectorAll || row.querySelectorAll('input').length === 0) continue;

      count += fillRowInputs(row, rate);
    }
    return count;
  }

  // ── Fill ONLY Extra Hr Chg (lco) rows — used in OT mode ────────────────────
  // fillRowInputsLco: like fillRowInputs but WITHOUT the i%2 adult/exChild filter,
  // because Extra Hr Chg rows have one input per day (no ExChild split).
  function fillRowInputsLco(row, val) {
    const inputs = Array.from(
      row.querySelectorAll('input[type="text"],input[type="number"],input:not([type])')
    ).filter(inp => !inp.disabled && !inp.readOnly);
    if (!inputs.length) return 0;
    if (!allDays) {
      setValue(inputs[0], val);
      return 1;
    }
    inputs.forEach(inp => setValue(inp, val));
    return inputs.length;
  }

  function fillOtSection(section, otRate) {
    let count = 0;
    for (const row of section.querySelectorAll('tr')) {
      // ── GUARD: skip adult / child rate rows (Base, Single, Double…) ──────────
      // These rows carry boxfor="ad" / tdfor="ad" attributes. Bail out early so
      // OT mode never accidentally writes into Base(0) or any other rate row.
      const isAdultOrChildRow = !!row.querySelector(
        'td[tdfor="ad"], td[tdfor="ch"], input[boxfor="ad"], input[boxfor="ch"]'
      );
      if (isAdultOrChildRow) continue;

      // ── Attribute-based: detect lco rows by tdfor / boxfor / name ────────────
      const isLcoAttr = !!row.querySelector(
        'td[tdfor="lco"], input[boxfor="lco"], input[name*="Lco["]'
      );
      // ── Label-based: detect "Extra Hr Chg" text label in the same row ────────
      const cell = row.querySelector ? row.querySelector('td:first-child,th:first-child') : null;
      const label = cell ? cell.textContent.trim().toLowerCase() : '';
      const isLcoLabel = EXTRA_HR_KEYWORDS.some(k => label.includes(k));

      if (!isLcoAttr && !isLcoLabel) continue;
      if (!row.querySelectorAll || row.querySelectorAll('input').length === 0) continue;
      // Use lco-specific filler (no adult/exChild interleave assumption)
      count += fillRowInputsLco(row, otRate);
    }
    return count;
  }

  // ── Main loop ───────────────────────────────────────────
  for (const [room, rate] of Object.entries(slotRates)) {
    // Use alias if set, otherwise use the original name from the rate sheet
    const lookupName = (roomAliases[room] && roomAliases[room].trim()) ? roomAliases[room].trim() : room;
    const section = findRoomSection(lookupName);
    if (!section) {
      results.push({ room, status: 'skip', msg: 'not found on page' });
      continue;
    }
    try {
      if (!isEditable(section)) {
        if (clickEditButton(section)) await delay(450);
      }
      // otMode → fill ONLY Extra Hr Chg rows with the otCharge rate
      // normal mode → fill Base/Single/Double rows with the slot rate
      const count = otMode
        ? fillOtSection(section, rate)
        : fillSection(section, rate, (roomOtCharges && roomOtCharges[room] != null) ? roomOtCharges[room] : null);
      results.push(count > 0
        ? { room, status: 'ok',  msg: `${count} field(s) filled` }
        : { room, status: 'err', msg: 'section found but no inputs filled' }
      );
    } catch(e) {
      results.push({ room, status: 'err', msg: e.message });
    }
  }

  return results;
}

// ── Content Script: click every visible Save button on the page ────────────
async function saveAllRoomTypes() {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Hotelogix Save buttons: <a class="saveProperty bound">Save</a>
  const candidates = Array.from(document.querySelectorAll(
    'a[class*="saveProperty"], button[class*="saveProperty"]'
  )).filter(el => {
    const t = el.textContent.trim().toLowerCase();
    return t === 'save' && el.offsetParent !== null; // visible only
  });

  // Fallback: any visible link/button whose text is exactly "Save" inside
  // a rate-table container
  const fallback = candidates.length === 0
    ? Array.from(document.querySelectorAll('a, button')).filter(el => {
        const t = el.textContent.trim().toLowerCase();
        return t === 'save' && el.offsetParent !== null &&
               el.closest('table, [id*="rateContainer"], [id*="Rate"]');
      })
    : [];

  const saveBtns = candidates.length > 0 ? candidates : fallback;
  if (!saveBtns.length) return { saved: 0, total: 0 };

  let saved = 0;
  for (const btn of saveBtns) {
    try {
      btn.click();
      saved++;
      await delay(1500);
    } catch (_) { /* skip */ }
  }
  return { saved, total: saveBtns.length };
}
