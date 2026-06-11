(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var allStudents = {};   // { normalisedName: { displayName, payCode, reports: [{name, link}] } }
  var selectedKey = null; // the key of the student currently being verified

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var searchInput      = document.getElementById('student-search');
  var suggestionsList  = document.getElementById('suggestions-list');

  var stepSearch  = document.getElementById('step-search');
  var stepVerify  = document.getElementById('step-verify');
  var stepResults = document.getElementById('step-results');

  var selectedNameDisplay = document.getElementById('selected-name-display');
  var verifyForm          = document.getElementById('verify-form');
  var payCodeInput        = document.getElementById('pay-code-input');
  var errorMsg            = document.getElementById('error-msg');

  var resultName   = document.getElementById('results-name');
  var reportList   = document.getElementById('report-list');

  var btnBack      = document.getElementById('btn-back');
  var btnNewSearch = document.getElementById('btn-new-search');

  document.getElementById('footer-year').textContent = new Date().getFullYear();

  // ── CSV loading ────────────────────────────────────────────────────────────
  function loadData() {
    fetch('reports.csv', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('CSV not found');
        return res.text();
      })
      .then(function (text) {
        parseCSV(text);
      })
      .catch(function () {});
  }

  function parseCSV(text) {
    var lines = text.split(/\r?\n/);
    if (lines.length < 2) return;

    // Determine header indices (case-insensitive, trimmed)
    var headers = splitCSVLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var iName   = headers.indexOf('student_name');
    var iCode   = headers.indexOf('school_pay_code');
    var iLink   = headers.indexOf('report_card_link');
    var iRName  = headers.indexOf('report_card_name');

    if (iName === -1 || iCode === -1 || iLink === -1 || iRName === -1) {
      return;
    }

    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cols = splitCSVLine(line);

      var name     = (cols[iName]  || '').trim();
      var code     = (cols[iCode]  || '').trim();
      var link     = (cols[iLink]  || '').trim();
      var rname    = (cols[iRName] || '').trim();

      if (!name || !code || !link || !rname) continue;

      var key = normalise(name);

      if (!allStudents[key]) {
        allStudents[key] = { displayName: name, payCode: code, reports: [] };
      }

      // Avoid duplicate report entries
      var already = allStudents[key].reports.some(function (r) {
        return r.name === rname && r.link === link;
      });
      if (!already) {
        allStudents[key].reports.push({ name: rname, link: link });
      }
    }
  }

  // Minimal RFC 4180-aware CSV line splitter (handles quoted fields with commas)
  function splitCSVLine(line) {
    var result = [];
    var cur = '';
    var inQuotes = false;
    for (var c = 0; c < line.length; c++) {
      var ch = line[c];
      if (ch === '"') {
        if (inQuotes && line[c + 1] === '"') { cur += '"'; c++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  function normalise(str) {
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // ── Autocomplete search ────────────────────────────────────────────────────
  var activeIndex = -1;

  searchInput.addEventListener('input', function () {
    var query = searchInput.value.trim();
    errorMsg.hidden = true;

    if (!query) {
      hideSuggestions();
      return;
    }

    var qNorm = normalise(query);
    var matches = Object.keys(allStudents).filter(function (key) {
      return key.indexOf(qNorm) !== -1;
    });

    if (matches.length === 0) {
      hideSuggestions();
      return;
    }

    // Sort: starts-with first, then contains
    matches.sort(function (a, b) {
      var aStarts = a.indexOf(qNorm) === 0 ? 0 : 1;
      var bStarts = b.indexOf(qNorm) === 0 ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return allStudents[a].displayName.localeCompare(allStudents[b].displayName);
    });

    renderSuggestions(matches, qNorm);
  });

  function renderSuggestions(keys, query) {
    suggestionsList.innerHTML = '';
    activeIndex = -1;

    keys.slice(0, 10).forEach(function (key) {
      var student = allStudents[key];
      var li = document.createElement('li');
      li.className = 'suggestion-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-key', key);

      // Bold the matching part
      var display = student.displayName;
      var lower   = normalise(display);
      var idx     = lower.indexOf(query);
      if (idx !== -1) {
        li.innerHTML =
          escapeHTML(display.substring(0, idx)) +
          '<mark>' + escapeHTML(display.substring(idx, idx + query.length)) + '</mark>' +
          escapeHTML(display.substring(idx + query.length));
      } else {
        li.textContent = display;
      }

      li.addEventListener('mousedown', function (e) {
        e.preventDefault(); // keep focus on input
        selectStudent(key);
      });

      suggestionsList.appendChild(li);
    });

    suggestionsList.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
  }

  function hideSuggestions() {
    suggestionsList.hidden = true;
    suggestionsList.innerHTML = '';
    searchInput.setAttribute('aria-expanded', 'false');
    activeIndex = -1;
  }

  // Keyboard navigation
  searchInput.addEventListener('keydown', function (e) {
    var items = suggestionsList.querySelectorAll('.suggestion-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveItem(items);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      var key = items[activeIndex].getAttribute('data-key');
      selectStudent(key);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  function updateActiveItem(items) {
    items.forEach(function (item, idx) {
      item.classList.toggle('active', idx === activeIndex);
    });
    if (activeIndex >= 0) {
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  document.addEventListener('click', function (e) {
    if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
      hideSuggestions();
    }
  });

  // ── Student selection → verify step ───────────────────────────────────────
  function selectStudent(key) {
    selectedKey = key;
    var student = allStudents[key];

    searchInput.value = student.displayName;
    hideSuggestions();

    selectedNameDisplay.textContent = student.displayName;
    payCodeInput.value = '';
    errorMsg.hidden = true;

    stepSearch.hidden  = true;
    stepVerify.hidden  = false;
    stepResults.hidden = true;

    payCodeInput.focus();
  }

  // ── Verification ──────────────────────────────────────────────────────────
  verifyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    errorMsg.hidden = true;

    var student  = allStudents[selectedKey];
    var entered  = payCodeInput.value.trim();

    if (entered === student.payCode) {
      showResults(student);
    } else {
      errorMsg.hidden = false;
      payCodeInput.value = '';
      payCodeInput.focus();
    }
  });

  function showResults(student) {
    resultName.textContent = student.displayName;
    reportList.innerHTML   = '';

    student.reports.forEach(function (report) {
      var li = document.createElement('li');
      var a  = document.createElement('a');
      a.href   = report.link;
      a.target = '_blank';
      a.rel    = 'noopener noreferrer';

      a.innerHTML =
        '<span class="report-icon" aria-hidden="true">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' +
        '</span>' +
        '<span class="report-name">' + escapeHTML(report.name) + '</span>' +
        '<span class="download-arrow" aria-hidden="true">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '</span>';

      li.appendChild(a);
      reportList.appendChild(li);
    });

    stepVerify.hidden  = true;
    stepResults.hidden = false;
    resultName.focus();
  }

  // ── Back / reset ──────────────────────────────────────────────────────────
  btnBack.addEventListener('click', function () {
    stepVerify.hidden  = true;
    stepSearch.hidden  = false;
    searchInput.focus();
  });

  btnNewSearch.addEventListener('click', function () {
    selectedKey = null;
    searchInput.value = '';
    errorMsg.hidden   = true;
    stepResults.hidden = true;
    stepSearch.hidden  = false;
    searchInput.focus();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  loadData();

})();
