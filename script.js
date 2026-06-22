(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var students = {};   // normalisedName → { displayName, payCode, reports: [{name, filename}] }
  var selectedKey = null;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var searchInput     = document.getElementById('student-search');
  var suggestionsList = document.getElementById('suggestions-list');

  var stepSearch  = document.getElementById('step-search');
  var stepVerify  = document.getElementById('step-verify');
  var stepResults = document.getElementById('step-results');

  var selectedNameDisplay = document.getElementById('selected-name-display');
  var verifyForm          = document.getElementById('verify-form');
  var payCodeInput        = document.getElementById('pay-code-input');
  var errorMsg            = document.getElementById('error-msg');

  var resultName  = document.getElementById('results-name');
  var reportList  = document.getElementById('report-list');

  var btnBack      = document.getElementById('btn-back');
  var btnNewSearch = document.getElementById('btn-new-search');

  document.getElementById('footer-year').textContent = new Date().getFullYear();

  // ── Load both CSV files in parallel ────────────────────────────────────────
  var payCodes  = {};  // normalisedName → { displayName, payCode }
  var filenames = [];  // raw filenames from manifest.csv
  var pending   = 2;

  function onLoaded() {
    pending--;
    if (pending === 0) buildStudents();
  }

  function loadAll() {
    fetchText('schpaycodes.csv')
      .then(function (text) { payCodes = parsePayCodes(text); })
      .catch(function () {})
      .then(onLoaded);

    fetchText('report-cards/manifest.csv')
      .then(function (text) { filenames = parseManifest(text); })
      .catch(function () {})
      .then(onLoaded);
  }

  function fetchText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('not found');
      return res.text();
    });
  }

  // ── Parse schpaycodes.csv ──────────────────────────────────────────────────
  function parsePayCodes(text) {
    var result  = {};
    var lines   = text.split(/\r?\n/);
    var headers = splitCSVLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var iName   = headers.indexOf('student_name');
    var iCode   = headers.indexOf('school_pay_code');
    if (iName === -1 || iCode === -1) return result;

    for (var i = 1; i < lines.length; i++) {
      var cols = splitCSVLine(lines[i]);
      var name = (cols[iName] || '').trim();
      var code = (cols[iCode] || '').trim();
      if (name && code) {
        result[normalise(name)] = { displayName: name, payCode: code };
      }
    }
    return result;
  }

  // ── Parse manifest.csv ─────────────────────────────────────────────────────
  function parseManifest(text) {
    var result = [];
    var lines  = text.split(/\r?\n/);
    // First line is a header ("filename"), skip it
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line) result.push(line);
    }
    return result;
  }

  // ── Build student data ────────────────────────────────────────────────────
  // Filename format: Student Name_Report Card Name_RandomNumber.pdf
  // Separator between the three parts is underscore (_)
  // Spaces are fine within each part; do not use underscores within names
  function buildStudents() {
    var reportsByKey = {};

    filenames.forEach(function (filename) {
      var parts = filename.split('_');
      if (parts.length < 3) return;

      var studentName = parts[0].trim();
      var lastPart    = parts[parts.length - 1];
      var reportName  = parts.slice(1, -1).join('_').trim();

      if (!studentName || !reportName || !lastPart) return;

      var key = normalise(studentName);
      if (!reportsByKey[key]) reportsByKey[key] = [];
      reportsByKey[key].push({ name: reportName, filename: filename });
    });

    Object.keys(payCodes).forEach(function (key) {
      var info = payCodes[key];
      students[key] = {
        displayName: info.displayName,
        payCode:     info.payCode,
        reports:     reportsByKey[key] || []
      };
    });
  }

  // ── CSV line splitter (handles quoted commas) ──────────────────────────────
  function splitCSVLine(line) {
    if (!line) return [];
    var result = [], cur = '', inQuotes = false;
    for (var c = 0; c < line.length; c++) {
      var ch = line[c];
      if (ch === '"') {
        if (inQuotes && line[c + 1] === '"') { cur += '"'; c++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(cur); cur = '';
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

  // ── Autocomplete ──────────────────────────────────────────────────────────
  var activeIndex = -1;

  searchInput.addEventListener('input', function () {
    var query = searchInput.value.trim();
    errorMsg.hidden = true;
    if (!query) { hideSuggestions(); return; }

    var qNorm   = normalise(query);
    var matches = Object.keys(students).filter(function (key) {
      return key.indexOf(qNorm) !== -1;
    });

    if (!matches.length) { hideSuggestions(); return; }

    matches.sort(function (a, b) {
      var aS = a.indexOf(qNorm) === 0 ? 0 : 1;
      var bS = b.indexOf(qNorm) === 0 ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return students[a].displayName.localeCompare(students[b].displayName);
    });

    renderSuggestions(matches, qNorm);
  });

  function renderSuggestions(keys, query) {
    suggestionsList.innerHTML = '';
    activeIndex = -1;

    keys.slice(0, 10).forEach(function (key) {
      var student = students[key];
      var li = document.createElement('li');
      li.className = 'suggestion-item';
      li.setAttribute('role', 'option');
      li.setAttribute('data-key', key);

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
        e.preventDefault();
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
      selectStudent(items[activeIndex].getAttribute('data-key'));
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  function updateActiveItem(items) {
    items.forEach(function (item, idx) {
      item.classList.toggle('active', idx === activeIndex);
    });
    if (activeIndex >= 0) items[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('click', function (e) {
    if (!searchInput.contains(e.target) && !suggestionsList.contains(e.target)) {
      hideSuggestions();
    }
  });

  // ── Select student ────────────────────────────────────────────────────────
  function selectStudent(key) {
    selectedKey = key;
    var student = students[key];
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
    var student = students[selectedKey];
    var entered = payCodeInput.value.trim();

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

    if (student.reports.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'no-reports-msg';
      empty.textContent = 'No report cards are available yet for this student.';
      reportList.appendChild(empty);
    } else {
      student.reports.forEach(function (report) {
        var li = document.createElement('li');
        var a  = document.createElement('a');
        var encodedPath = 'report-cards/' + encodeURIComponent(report.filename);
        a.href   = encodedPath;
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
    }

    stepVerify.hidden  = true;
    stepResults.hidden = false;
    resultName.focus();
  }

  // ── Back / reset ──────────────────────────────────────────────────────────
  btnBack.addEventListener('click', function () {
    stepVerify.hidden = true;
    stepSearch.hidden = false;
    searchInput.focus();
  });

  btnNewSearch.addEventListener('click', function () {
    selectedKey = null;
    searchInput.value = '';
    errorMsg.hidden    = true;
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
  loadAll();

})();
