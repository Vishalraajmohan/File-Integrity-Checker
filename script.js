/* ================================================================
   File Integrity Checker — Frontend JavaScript
   Minor Project
   Communicates with Flask backend via fetch API
   ================================================================ */

// ── State ─────────────────────────────────────────────────────────
const state = {
  files: {},
  history: [],
  stats: { files: 0, hashes: 0, lastSize: '—' }
};

// ── Utility: Format file size ──────────────────────────────────────
function fmtSize(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
}

// ── Utility: Escape HTML ───────────────────────────────────────────
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Tab Switching ──────────────────────────────────────────────────
function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}

// ── Algorithm Chip Toggle ──────────────────────────────────────────
function toggleChip(el) {
  const activeChips = document.querySelectorAll('.algo-chip.on');
  if (el.classList.contains('on') && activeChips.length === 1) return;
  el.classList.toggle('on');
}

// ── File Select Handler ────────────────────────────────────────────
function handleFileSelect(id, file) {
  if (!file) return;
  state.files[id] = file;

  const badgeMap = {
    'gen':  'genBadge',
    'vfy':  'vfyBadge',
    'cmpA': 'cmpABadge',
    'cmpB': 'cmpBBadge'
  };

  const badge = document.getElementById(badgeMap[id]);
  if (badge) {
    badge.style.display = 'block';
    badge.textContent = '✔  ' + file.name + '  (' + fmtSize(file.size) + ')';
  }
}

// ── Drag and Drop Support ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.drop-zone').forEach(dz => {
    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.classList.add('over');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('over');
      const input = dz.querySelector('input[type="file"]');
      if (input && e.dataTransfer.files[0]) {
        const dt = new DataTransfer();
        dt.items.add(e.dataTransfer.files[0]);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  });
});

// ── Update Stats Strip ─────────────────────────────────────────────
function updateStats() {
  document.getElementById('sFiles').textContent  = state.stats.files;
  document.getElementById('sHashes').textContent = state.stats.hashes;
  document.getElementById('sSize').textContent   = state.stats.lastSize;
  document.getElementById('statsStrip').classList.add('visible');
}

// ── Generate Hashes ────────────────────────────────────────────────
async function runGenerate() {
  const file = state.files['gen'];
  if (!file) { alert('Please select a file first.'); return; }

  const algos = [...document.querySelectorAll('.algo-chip.on')].map(c => c.dataset.algo);
  if (!algos.length) { alert('Select at least one algorithm.'); return; }

  const form = new FormData();
  form.append('file', file);
  algos.forEach(a => form.append('algorithms', a));

  // Show progress bar
  const prog  = document.getElementById('genProg');
  const fill  = document.getElementById('genFill');
  const label = document.getElementById('genProgLabel');
  const pct   = document.getElementById('genProgPct');

  prog.style.display = 'block';
  let fakeProgress = 0;
  const interval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 12, 85);
    fill.style.width = fakeProgress + '%';
    pct.textContent  = Math.round(fakeProgress) + '%';
  }, 150);

  try {
    const res  = await fetch('/api/generate', { method: 'POST', body: form });
    const data = await res.json();

    clearInterval(interval);
    fill.style.width = '100%';
    pct.textContent  = '100%';
    label.textContent = 'Done!';
    setTimeout(() => {
      prog.style.display = 'none';
      fill.style.width   = '0%';
    }, 700);

    if (data.error) { alert('Error: ' + data.error); return; }

    // Update stats
    state.stats.files++;
    state.stats.hashes   += Object.keys(data.hashes).length;
    state.stats.lastSize  = data.size;
    updateStats();

    // Update history
    state.history.unshift({
      ts:     data.timestamp,
      name:   data.filename,
      size:   data.size,
      hashes: data.hashes
    });
    refreshHistory();

    renderGenResults(data);

  } catch (err) {
    clearInterval(interval);
    alert('Request failed: ' + err.message);
  }
}

// ── Render Generate Results ────────────────────────────────────────
function renderGenResults(data) {
  const entries = Object.entries(data.hashes).map(([algo, hash]) => `
    <div class="hash-entry">
      <div class="hash-entry-top">
        <span class="hash-algo-tag">${algo}</span>
        <span class="hash-len">${hash.length} chars</span>
      </div>
      <div class="hash-value">${hash}</div>
      <div class="hash-actions">
        <button class="mini-btn" onclick="copyValue('${hash}', this)">Copy</button>
      </div>
    </div>
  `).join('');

  document.getElementById('genOut').innerHTML = `
    <div class="file-meta-bar">
      <div class="meta-item">
        <span class="meta-key">File</span>
        <span class="meta-val">${esc(data.filename)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">Size</span>
        <span class="meta-val">${data.size}</span>
      </div>
      <div class="meta-item">
        <span class="meta-key">Generated</span>
        <span class="meta-val">${data.timestamp}</span>
      </div>
    </div>
    <div class="hash-list">${entries}</div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="btn btn-ghost" onclick='copyAllHashes(${JSON.stringify(data.hashes)})'>Copy All</button>
      <button class="btn btn-ghost" onclick='saveReport(${JSON.stringify(data)})'>Save Report</button>
    </div>
  `;
}

// ── Verify File Integrity ──────────────────────────────────────────
async function runVerify() {
  const file = state.files['vfy'];
  if (!file) { alert('Please select a file.'); return; }

  const expected = document.getElementById('expectedInput').value.trim();
  if (!expected) { alert('Please paste the expected hash.'); return; }

  const algo = document.querySelector('input[name="vAlgo"]:checked').value;

  const form = new FormData();
  form.append('file', file);
  form.append('algorithm', algo);
  form.append('expected_hash', expected);

  try {
    const res  = await fetch('/api/verify', { method: 'POST', body: form });
    const data = await res.json();

    if (data.error) { alert('Error: ' + data.error); return; }

    const banner = document.getElementById('vfyBanner');
    banner.innerHTML = data.matched
      ? `<div class="verify-banner success">
           <div class="banner-icon-wrap">✔</div>
           <div class="banner-text">
             <h3>INTEGRITY VERIFIED</h3>
             <p>The computed hash matches your expected value. This file is authentic and untampered.</p>
           </div>
         </div>`
      : `<div class="verify-banner fail">
           <div class="banner-icon-wrap">✘</div>
           <div class="banner-text">
             <h3>INTEGRITY FAILED</h3>
             <p>Hash mismatch detected. This file may be corrupted, modified, or from an untrustworthy source.</p>
           </div>
         </div>`;

    document.getElementById('vfyComputedOut').innerHTML = `
      <div class="card">
        <div class="card-label" style="margin-bottom:8px">Computed Hash (${algo})</div>
        <div class="hash-value">${data.computed}</div>
        <div class="hash-actions" style="margin-top:10px">
          <button class="mini-btn" onclick="copyValue('${data.computed}', this)">Copy</button>
        </div>
      </div>
    `;
  } catch (err) {
    alert('Request failed: ' + err.message);
  }
}

// ── Compare Two Files ──────────────────────────────────────────────
async function runCompare() {
  const fa = state.files['cmpA'];
  const fb = state.files['cmpB'];
  if (!fa || !fb) { alert('Please select both files.'); return; }

  const form = new FormData();
  form.append('file_a', fa);
  form.append('file_b', fb);

  try {
    const res  = await fetch('/api/compare', { method: 'POST', body: form });
    const data = await res.json();

    if (data.error) { alert('Error: ' + data.error); return; }

    const banner = data.all_match
      ? `<div class="verify-banner success">
           <div class="banner-icon-wrap">✔</div>
           <div class="banner-text">
             <h3>FILES ARE IDENTICAL</h3>
             <p>All hashes match. These files are byte-for-byte identical.</p>
           </div>
         </div>`
      : `<div class="verify-banner fail">
           <div class="banner-icon-wrap">✘</div>
           <div class="banner-text">
             <h3>FILES ARE DIFFERENT</h3>
             <p>One or more hash mismatches detected. The files have different content.</p>
           </div>
         </div>`;

    const rows = data.results.map(r => `
      <tr>
        <td><span class="hash-algo-tag">${r.algorithm}</span></td>
        <td style="font-family:var(--mono);font-size:0.68rem;color:var(--text2);word-break:break-all">
          ${r.hash_a.substring(0, 32)}…
        </td>
        <td style="font-family:var(--mono);font-size:0.68rem;color:var(--text2);word-break:break-all">
          ${r.hash_b.substring(0, 32)}…
        </td>
        <td><span class="match-badge ${r.match ? 'yes' : 'no'}">${r.match ? '✔ Match' : '✘ Differ'}</span></td>
      </tr>
    `).join('');

    document.getElementById('cmpOut').innerHTML = banner + `
      <div class="card" style="margin-top:12px;overflow:auto">
        <div style="display:flex;gap:1rem;margin-bottom:12px;flex-wrap:wrap">
          <span style="font-family:var(--mono);font-size:0.72rem;color:var(--text3)">
            A: <span style="color:var(--text)">${esc(data.file_a)}</span> (${data.size_a})
          </span>
          <span style="font-family:var(--mono);font-size:0.72rem;color:var(--text3)">
            B: <span style="color:var(--text)">${esc(data.file_b)}</span> (${data.size_b})
          </span>
        </div>
        <table class="compare-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Hash — File A</th>
              <th>Hash — File B</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  } catch (err) {
    alert('Request failed: ' + err.message);
  }
}

// ── History ────────────────────────────────────────────────────────
function refreshHistory() {
  const el = document.getElementById('histList');
  if (!state.history.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No files processed yet.</p>
      </div>`;
    return;
  }

  el.innerHTML = state.history.map(e => {
    const pills = Object.entries(e.hashes).map(([a, h]) => `
      <span class="history-hash-pill">
        <span class="pill-algo">${a}</span>${h.substring(0, 16)}…
      </span>
    `).join('');
    return `
      <div class="history-item">
        <div class="history-item-top">
          <div>
            <div class="history-filename">${esc(e.name)}</div>
            <div class="history-time">${e.ts}</div>
          </div>
          <div class="history-size">${e.size}</div>
        </div>
        <div class="history-hashes">${pills}</div>
      </div>`;
  }).join('');
}

async function clearHistory() {
  if (!state.history.length) return;
  if (!confirm('Clear all session history?')) return;
  await fetch('/api/history/clear', { method: 'POST' });
  state.history = [];
  refreshHistory();
}

function exportHistory() {
  if (!state.history.length) { alert('No history to export yet.'); return; }
  const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'integrity_history_' + Date.now() + '.json';
  a.click();
}

// ── Copy Helpers ───────────────────────────────────────────────────
function copyValue(val, btn) {
  navigator.clipboard.writeText(val).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('ok'); }, 1400);
  });
}

function copyAllHashes(hashes) {
  const text = Object.entries(hashes).map(([a, h]) => `${a}: ${h}`).join('\n');
  navigator.clipboard.writeText(text).then(() => alert('All hashes copied to clipboard!'));
}

// ── Save Report ────────────────────────────────────────────────────
async function saveReport(data) {
  try {
    const res  = await fetch('/api/report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data)
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `integrity_report_${data.filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Could not save report: ' + err.message);
  }
}
