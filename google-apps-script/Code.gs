/**
 * SIAP Dashboard backend for Netlify-hosted React frontend.
 *
 * Script Properties:
 * - SPREADSHEET_ID          required; Google Sheet converted/imported from SIAP Data.xlsx
 * - SIAP_SHEET_NAME         optional; defaults to "SIAP Data"
 * - STOPS_SHEET_NAME        optional; defaults to "Stops"
 * - DASHBOARD_TOKEN         optional; weak access gate only. Do not treat it as secret in Netlify.
 * - CACHE_SECONDS           optional; defaults to 600
 * - DASHBOARD_CACHE_VERSION optional; changed automatically by clearDashboardCache()
 *
 * Web app deployment: Execute as Me, Who has access: Anyone with the link.
 * The backend returns aggregates only. It must not expose intern names or other row-level PII.
 */

var DEFAULT_TZ = 'Asia/Singapore';
var DEFAULT_CACHE_SECONDS = 600;
var WORK_HOURS_PER_DAY = 8;
var ROW_CACHE_PREFIX = 'siap-rows:v1';
var ROW_CACHE_CHUNK_SIZE = 80000;

var COL = {
  endorsementNo: 'SIAP ENDORSEMENT No',
  region: 'Region',
  lastName: 'Last Name',
  firstName: 'First Name',
  sex: 'Sex',
  hei: 'Full Name of HEI',
  typeOfHei: 'Type Of HEI',
  program: 'Full Title of the Program Enrolled In',
  host: 'Name of Foreign Host Establishment or Organization (FHE/O)',
  country: 'Country',
  endorsementDate: 'Date of CHED Endorsement to the Bureau of Immigration (BI)',
  startDate: 'Start of Internship',
  endDate: 'End of Internship',
  fromCity: 'from City',
  toCity: 'to City',
  originLat: 'Origin Latitude',
  originLng: 'Origin Longitude',
  destLat: 'Destination Latitude',
  destLng: 'Destination Longitude',
  pathKey: 'Path Key',
  pathId: 'Path ID',
  odKey: 'Path ID (OD)'
};

function doGet() {
  return json_({ ok: true, message: 'SIAP dashboard backend is running.' });
}

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var props = PropertiesService.getScriptProperties();
    verifyToken_(payload.dashboardToken || '', props);
    var action = String(payload.action || '').trim();
    if (action === 'dashboardData') return dashboardData_(payload.filters || {}, payload.section || 'overview', payload.includeOptions === true, props);
    throw new Error('Unsupported action.');
  } catch (err) {
    return json_({ ok: false, message: errorMessage_(err) });
  }
}

function dashboardData_(filters, section, includeOptions, props) {
  var startedAt = Date.now();
  filters = normalizeFilters_(filters || {});
  section = normalizeSection_(section);
  var config = getConfig_(props);
  var cacheSeconds = getCacheSeconds_(config);
  var cache = CacheService.getScriptCache();
  var cacheKey = 'dashboard:v3:' + config.cacheVersion + ':' + section + ':' + (includeOptions ? 'options:' : '') + Utilities.base64EncodeWebSafe(JSON.stringify(filters)).slice(0, 160);
  var cached = cacheSeconds ? cache.get(cacheKey) : null;
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

  var rawRows = getSiapRows_(config, cache, cacheSeconds);
  var filtered = rawRows.filter(function(row) { return passesFilters_(row, filters); });

  var response = {
    ok: true,
    lastUpdatedAt: Utilities.formatDate(new Date(), DEFAULT_TZ, 'yyyy-MM-dd HH:mm:ss'),
    filters: filters,
    section: section
  };

  if (includeOptions) response.options = buildOptions_(rawRows);
  if (section === 'overview') response.overview = buildOverview_(filtered);
  if (section === 'timeline') response.timeline = buildTimeline_(filtered);
  if (section === 'hei') {
    var countries = sortAsc_(unique_(filtered.map(function(row) { return row.country; })).filter(Boolean));
    response.hei = buildHeiRisk_(filtered, countries);
  }
  if (section === 'geography') response.geography = buildGeography_(filtered);
  response.serverElapsedMs = Date.now() - startedAt;

  var body = JSON.stringify(response);
  if (cacheSeconds) cache.put(cacheKey, body, cacheSeconds);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function getConfig_(props) {
  props = props || PropertiesService.getScriptProperties();
  return {
    spreadsheetId: requiredProp_(props, 'SPREADSHEET_ID'),
    siapSheetName: props.getProperty('SIAP_SHEET_NAME') || 'SIAP Data',
    stopsSheetName: props.getProperty('STOPS_SHEET_NAME') || 'Stops',
    token: props.getProperty('DASHBOARD_TOKEN') || '',
    cacheSeconds: Number(props.getProperty('CACHE_SECONDS') || DEFAULT_CACHE_SECONDS),
    cacheVersion: props.getProperty('DASHBOARD_CACHE_VERSION') || '1'
  };
}

function requiredProp_(props, key) {
  var value = props.getProperty(key);
  if (!value) throw new Error('Missing Script Property: ' + key);
  return value;
}

function getCacheSeconds_(config) {
  var n = config.cacheSeconds;
  if (!isFinite(n) || n < 0) return DEFAULT_CACHE_SECONDS;
  return Math.min(21600, Math.floor(n));
}

function verifyToken_(token, props) {
  var expected = (props || PropertiesService.getScriptProperties()).getProperty('DASHBOARD_TOKEN') || '';
  if (!expected) return;
  if (String(token || '') !== expected) throw new Error('Unauthorized dashboard request.');
}

function getSiapRows_(config, cache, cacheSeconds) {
  if (!cacheSeconds) return readSiapRowsFromSheet_(config);

  var cached = readCachedRows_(cache, config);
  if (cached) return cached;

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(5000);
  try {
    if (locked) {
      cached = readCachedRows_(cache, config);
      if (cached) return cached;
    }
    var rows = readSiapRowsFromSheet_(config);
    try { writeCachedRows_(cache, config, rows, cacheSeconds); } catch (cacheError) { /* Cache is an optimization only. */ }
    return rows;
  } finally {
    if (locked) lock.releaseLock();
  }
}

function readSiapRowsFromSheet_(config) {
  var ss = SpreadsheetApp.openById(config.spreadsheetId);
  var sheet = ss.getSheetByName(config.siapSheetName);
  if (!sheet) throw new Error('Sheet not found: ' + config.siapSheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function(h) { return String(h || '').trim(); });
  var index = {};
  headers.forEach(function(h, i) { if (h) index[h] = i; });
  requireColumns_(index, [COL.endorsementNo, COL.region, COL.sex, COL.hei, COL.typeOfHei, COL.program, COL.host, COL.country, COL.endorsementDate, COL.startDate, COL.endDate]);

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!rowHasContent_(row)) continue;
    var endorsementDate = toDate_(valueAt_(row, index, COL.endorsementDate));
    var startDate = toDate_(valueAt_(row, index, COL.startDate));
    var endDate = toDate_(valueAt_(row, index, COL.endDate));
    var referenceDate = endorsementDate || startDate || endDate;
    var startDayMs = startDate ? startOfDay_(startDate).getTime() : null;
    var endDayMs = endDate ? startOfDay_(endDate).getTime() : null;
    var item = {
      endorsementNo: clean_(valueAt_(row, index, COL.endorsementNo)),
      region: clean_(valueAt_(row, index, COL.region)),
      sex: clean_(valueAt_(row, index, COL.sex)),
      hei: clean_(valueAt_(row, index, COL.hei)),
      typeOfHei: clean_(valueAt_(row, index, COL.typeOfHei)),
      program: clean_(valueAt_(row, index, COL.program)),
      host: clean_(valueAt_(row, index, COL.host)),
      country: clean_(valueAt_(row, index, COL.country)),
      endorsementDate: endorsementDate,
      startDate: startDate,
      endDate: endDate,
      fromCity: clean_(valueAt_(row, index, COL.fromCity)),
      toCity: clean_(valueAt_(row, index, COL.toCity)),
      originLat: toNumber_(valueAt_(row, index, COL.originLat)),
      originLng: toNumber_(valueAt_(row, index, COL.originLng)),
      destLat: toNumber_(valueAt_(row, index, COL.destLat)),
      destLng: toNumber_(valueAt_(row, index, COL.destLng)),
      pathKey: clean_(valueAt_(row, index, COL.pathKey)),
      pathId: clean_(valueAt_(row, index, COL.pathId)),
      odKey: clean_(valueAt_(row, index, COL.odKey)),
      filterYear: yearOf_(referenceDate),
      filterQuarter: quarterOf_(referenceDate),
      endorsementYearMonth: ym_(endorsementDate),
      startYearMonth: startDate ? ym_(startDate) : '',
      endYearMonth: endDate ? ym_(endDate) : '',
      startDayMs: startDayMs,
      endDayMs: endDayMs,
      leadTimeDays: endorsementDate && startDate ? daysBetween_(endorsementDate, startDate) : null,
      durationWorkHours: durationWorkHoursFromDates_(startDate, endDate)
    };
    rows.push(item);
  }
  return rows;
}

function rowCacheKey_(config) {
  return ROW_CACHE_PREFIX + ':' + config.cacheVersion;
}

function readCachedRows_(cache, config) {
  try {
    var prefix = rowCacheKey_(config);
    var metaText = cache.get(prefix + ':meta');
    if (!metaText) return null;
    var meta = JSON.parse(metaText);
    if (!meta.chunkCount) return null;
    var keys = [];
    for (var i = 0; i < meta.chunkCount; i++) keys.push(prefix + ':' + i);
    var chunks = cache.getAll(keys);
    var encoded = '';
    for (var c = 0; c < keys.length; c++) {
      if (!chunks[keys[c]]) return null;
      encoded += chunks[keys[c]];
    }
    var compressed = Utilities.newBlob(Utilities.base64Decode(encoded));
    var json = Utilities.ungzip(compressed).getDataAsString('UTF-8');
    var rows = JSON.parse(json);
    rows.forEach(reviveCachedRow_);
    return rows;
  } catch (err) {
    return null;
  }
}

function writeCachedRows_(cache, config, rows, cacheSeconds) {
  var prefix = rowCacheKey_(config);
  var json = JSON.stringify(rows);
  var compressed = Utilities.gzip(Utilities.newBlob(json));
  var encoded = Utilities.base64Encode(compressed.getBytes());
  var chunks = {};
  var chunkCount = Math.ceil(encoded.length / ROW_CACHE_CHUNK_SIZE);
  for (var i = 0; i < chunkCount; i++) chunks[prefix + ':' + i] = encoded.slice(i * ROW_CACHE_CHUNK_SIZE, (i + 1) * ROW_CACHE_CHUNK_SIZE);
  cache.putAll(chunks, cacheSeconds);
  cache.put(prefix + ':meta', JSON.stringify({ chunkCount: chunkCount, rowCount: rows.length }), cacheSeconds);
}

function reviveCachedRow_(row) {
  row.endorsementDate = row.endorsementDate ? new Date(row.endorsementDate) : null;
  row.startDate = row.startDate ? new Date(row.startDate) : null;
  row.endDate = row.endDate ? new Date(row.endDate) : null;
}

function valueAt_(row, index, col) {
  return index[col] == null ? '' : row[index[col]];
}

function requireColumns_(index, names) {
  var missing = names.filter(function(n) { return index[n] == null; });
  if (missing.length) throw new Error('Missing required columns: ' + missing.join(', '));
}

function rowHasContent_(row) {
  for (var i = 0; i < Math.min(row.length, 20); i++) if (row[i] !== '' && row[i] != null) return true;
  return false;
}

function clean_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function toNumber_(value) {
  if (value === '' || value == null) return null;
  var n = Number(value);
  return isFinite(n) ? n : null;
}

function toDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return value;
  if (!value) return null;
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeFilters_(filters) {
  return {
    year: clean_(filters.year),
    quarter: clean_(filters.quarter),
    country: clean_(filters.country),
    region: clean_(filters.region),
    sex: clean_(filters.sex)
  };
}

function normalizeSection_(section) {
  section = clean_(section || 'overview').toLowerCase();
  if (['overview', 'timeline', 'hei', 'geography'].indexOf(section) === -1) throw new Error('Unsupported dashboard section.');
  return section;
}

function passesFilters_(row, filters) {
  if (filters.year && row.filterYear !== filters.year) return false;
  if (filters.quarter && row.filterQuarter !== filters.quarter) return false;
  if (filters.country && row.country !== filters.country) return false;
  if (filters.region && row.region !== filters.region) return false;
  if (filters.sex && row.sex !== filters.sex) return false;
  return true;
}

function yearOf_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, DEFAULT_TZ, 'yyyy');
}

function quarterOf_(date) {
  if (!date) return '';
  var m = Number(Utilities.formatDate(date, DEFAULT_TZ, 'M'));
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

function ym_(date) {
  return date ? Utilities.formatDate(date, DEFAULT_TZ, 'yyyy-MM') : 'Unknown';
}

function buildOptions_(rows) {
  return {
    years: sortDesc_(unique_(rows.map(function(r) { return r.filterYear; })).filter(Boolean)),
    countries: sortAsc_(unique_(rows.map(function(r) { return r.country; })).filter(Boolean)),
    regions: sortAsc_(unique_(rows.map(function(r) { return r.region; })).filter(Boolean)),
    sexes: sortAsc_(unique_(rows.map(function(r) { return r.sex; })).filter(Boolean))
  };
}

function buildOverview_(rows) {
  return {
    totalInterns: rows.length,
    totalEndorsements: countUnique_(rows, 'endorsementNo'),
    activeInternshipsToday: activeInternships_(rows, new Date()),
    avgLeadTimeDays: round2_(avg_(rows.map(leadTimeDays_).filter(isFiniteNumber_))),
    avgDurationWorkHours: round2_(avg_(rows.map(durationWorkHours_).filter(isFiniteNumber_))),
    internsByRegion: groupInterns_(rows, 'region', 10),
    internsByCountry: groupInterns_(rows, 'country', 10),
    internsByProgram: groupInterns_(rows, 'program', 12),
    endorsementsByMonth: groupEndorsementsByMonth_(rows)
  };
}

function buildTimeline_(rows) {
  var now = startOfDay_(new Date());
  var next30 = addDays_(now, 30);
  var next60 = addDays_(now, 60);
  var nowMs = now.getTime();
  var next30Ms = next30.getTime();
  var next60Ms = next60.getTime();
  return {
    endingNext30Days: rows.filter(function(r) { return r.endDayMs != null && r.endDayMs >= nowMs && r.endDayMs <= next30Ms; }).length,
    endingNext60Days: rows.filter(function(r) { return r.endDayMs != null && r.endDayMs >= nowMs && r.endDayMs <= next60Ms; }).length,
    countrySummary: groupCountrySummary_(rows),
    startsEndsByMonth: startsEndsByMonth_(rows)
  };
}

function buildHeiRisk_(rows, countries) {
  return {
    internsByHei: groupInterns_(rows, 'hei', 12),
    endorsementsByHeiCountry: groupEndorsementsByHeiCountry_(rows, countries || []),
    endorsementsByRegion: groupEndorsements_(rows, 'region', 12),
    bySex: groupInterns_(rows, 'sex', 10),
    byTypeOfHei: groupInterns_(rows, 'typeOfHei', 10),
    table: heiTable_(rows)
  };
}

function buildGeography_(rows) {
  return {
    internsByCountry: groupInterns_(rows, 'country', 10),
    hosts: groupInterns_(rows, 'host', 15),
    routes: routeSummary_(rows)
  };
}

function groupInterns_(rows, key, limit) {
  var map = {};
  rows.forEach(function(r) {
    var name = r[key] || 'Unknown';
    if (!map[name]) map[name] = { name: name, totalInterns: 0 };
    map[name].totalInterns += 1;
  });
  return top_(Object.keys(map).map(function(k) { return map[k]; }), 'totalInterns', limit);
}

function groupEndorsements_(rows, key, limit) {
  var map = {};
  rows.forEach(function(r) {
    var name = r[key] || 'Unknown';
    if (!map[name]) map[name] = { name: name, _ids: {}, totalEndorsements: 0 };
    if (r.endorsementNo) map[name]._ids[r.endorsementNo] = true;
  });
  var out = Object.keys(map).map(function(k) {
    var ids = Object.keys(map[k]._ids).length;
    return { name: map[k].name, totalEndorsements: ids };
  });
  return top_(out, 'totalEndorsements', limit);
}

function groupEndorsementsByMonth_(rows) {
  var map = {};
  rows.forEach(function(r) {
    var key = r.endorsementYearMonth;
    if (!map[key]) map[key] = { yearMonth: key, _ids: {}, totalEndorsements: 0 };
    if (r.endorsementNo) map[key]._ids[r.endorsementNo] = true;
  });
  return Object.keys(map).sort().map(function(k) {
    return { yearMonth: k, totalEndorsements: Object.keys(map[k]._ids).length };
  });
}

function groupCountrySummary_(rows) {
  var map = {};
  rows.forEach(function(r) {
    var name = r.country || 'Unknown';
    if (!map[name]) map[name] = { name: name, _ids: {}, totalInterns: 0, _duration: [] };
    map[name].totalInterns += 1;
    if (r.endorsementNo) map[name]._ids[r.endorsementNo] = true;
    var dur = durationWorkHours_(r);
    if (isFiniteNumber_(dur)) map[name]._duration.push(dur);
  });
  return top_(Object.keys(map).map(function(k) {
    return {
      name: map[k].name,
      totalEndorsements: Object.keys(map[k]._ids).length,
      totalInterns: map[k].totalInterns,
      avgDurationWorkHours: round2_(avg_(map[k]._duration))
    };
  }), 'totalInterns', 20);
}

function startsEndsByMonth_(rows) {
  var map = {};
  rows.forEach(function(r) {
    if (r.startYearMonth) {
      var sKey = r.startYearMonth;
      if (!map[sKey]) map[sKey] = { yearMonth: sKey, internStarts: 0, internEnds: 0 };
      map[sKey].internStarts += 1;
    }
    if (r.endYearMonth) {
      var eKey = r.endYearMonth;
      if (!map[eKey]) map[eKey] = { yearMonth: eKey, internStarts: 0, internEnds: 0 };
      map[eKey].internEnds += 1;
    }
  });
  return Object.keys(map).sort().map(function(k) { return map[k]; });
}

function groupEndorsementsByHeiCountry_(rows, countries) {
  var map = {};
  rows.forEach(function(r) {
    var hei = r.hei || 'Unknown';
    var c = r.country || 'Unknown';
    if (!map[hei]) {
      map[hei] = { name: hei, totalEndorsements: 0, _ids: {} };
      countries.forEach(function(country) { map[hei][country] = 0; map[hei]['_ids_' + country] = {}; });
    }
    if (!map[hei]['_ids_' + c]) map[hei]['_ids_' + c] = {};
    if (r.endorsementNo) {
      map[hei]._ids[r.endorsementNo] = true;
      map[hei]['_ids_' + c][r.endorsementNo] = true;
    }
  });
  var out = Object.keys(map).map(function(hei) {
    var item = map[hei];
    item.totalEndorsements = Object.keys(item._ids).length;
    Object.keys(item).forEach(function(k) {
      if (k.indexOf('_ids_') === 0) {
        var country = k.replace('_ids_', '');
        item[country] = Object.keys(item[k]).length;
      }
    });
    var cleaned = { name: item.name, totalEndorsements: item.totalEndorsements };
    countries.forEach(function(c) { cleaned[c] = item[c] || 0; });
    return cleaned;
  });
  return top_(out, 'totalEndorsements', 10);
}

function heiTable_(rows) {
  var map = {};
  rows.forEach(function(r) {
    var hei = r.hei || 'Unknown';
    if (!map[hei]) map[hei] = { name: hei, _ids: {}, totalInterns: 0, _countries: {}, _hosts: {} };
    map[hei].totalInterns += 1;
    if (r.endorsementNo) map[hei]._ids[r.endorsementNo] = true;
    if (r.country) map[hei]._countries[r.country] = true;
    if (r.host) map[hei]._hosts[r.host] = true;
  });
  return top_(Object.keys(map).map(function(k) {
    return {
      name: map[k].name,
      totalEndorsements: Object.keys(map[k]._ids).length,
      totalInterns: map[k].totalInterns,
      countries: Object.keys(map[k]._countries).length,
      hostOrgs: Object.keys(map[k]._hosts).length
    };
  }), 'totalInterns', 50);
}

function routeSummary_(rows) {
  var map = {};
  rows.forEach(function(r) {
    if (!isFiniteNumber_(r.originLat) || !isFiniteNumber_(r.originLng) || !isFiniteNumber_(r.destLat) || !isFiniteNumber_(r.destLng)) return;
    var key = [r.country || 'Unknown', r.originLat, r.originLng, r.destLat, r.destLng].join('|');
    if (!map[key]) {
      map[key] = {
        key: key,
        country: r.country || 'Unknown',
        origin: r.fromCity || 'Origin',
        destination: r.toCity || r.host || 'Destination',
        originLat: r.originLat,
        originLng: r.originLng,
        destLat: r.destLat,
        destLng: r.destLng,
        totalInterns: 0,
        _ids: {}
      };
    }
    map[key].totalInterns += 1;
    if (r.endorsementNo) map[key]._ids[r.endorsementNo] = true;
  });
  return top_(Object.keys(map).map(function(k) {
    var r = map[k];
    return {
      key: r.key,
      country: r.country,
      origin: r.origin,
      destination: r.destination,
      originLat: r.originLat,
      originLng: r.originLng,
      destLat: r.destLat,
      destLng: r.destLng,
      totalInterns: r.totalInterns,
      totalEndorsements: Object.keys(r._ids).length
    };
  }), 'totalInterns', 250);
}

function activeInternships_(rows, today) {
  var dayMs = startOfDay_(today).getTime();
  return rows.filter(function(r) {
    return r.startDayMs != null && r.endDayMs != null && r.startDayMs <= dayMs && r.endDayMs >= dayMs;
  }).length;
}

function leadTimeDays_(r) {
  return Object.prototype.hasOwnProperty.call(r, 'leadTimeDays') ? r.leadTimeDays : null;
}

function durationWorkHours_(r) {
  if (Object.prototype.hasOwnProperty.call(r, 'durationWorkHours')) return r.durationWorkHours;
  r.durationWorkHours = durationWorkHoursFromDates_(r.startDate, r.endDate);
  return r.durationWorkHours;
}

function durationWorkHoursFromDates_(startDate, endDate) {
  if (!startDate || !endDate) return null;
  return networkDaysInclusive_(startDate, endDate) * WORK_HOURS_PER_DAY;
}

function networkDaysInclusive_(start, end) {
  var s = startOfDay_(start);
  var e = startOfDay_(end);
  if (e < s) return 0;
  var totalDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  var fullWeeks = Math.floor(totalDays / 7);
  var remainder = totalDays % 7;
  var startWeekday = Number(Utilities.formatDate(s, DEFAULT_TZ, 'u')) - 1; // 0 Mon ... 6 Sun
  var weekdaysBeforeWeekend = Math.max(0, 5 - startWeekday);
  var firstWeek = Math.min(remainder, weekdaysBeforeWeekend);
  var wrappedWeek = Math.max(0, startWeekday + remainder - 7);
  return fullWeeks * 5 + firstWeek + wrappedWeek;
}

function daysBetween_(start, end) {
  var s = startOfDay_(start).getTime();
  var e = startOfDay_(end).getTime();
  return Math.round((e - s) / 86400000);
}

function startOfDay_(date) {
  var y = Utilities.formatDate(date, DEFAULT_TZ, 'yyyy');
  var m = Utilities.formatDate(date, DEFAULT_TZ, 'MM');
  var d = Utilities.formatDate(date, DEFAULT_TZ, 'dd');
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function addDays_(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function countUnique_(rows, key) {
  var seen = {};
  rows.forEach(function(r) { if (r[key]) seen[r[key]] = true; });
  return Object.keys(seen).length;
}

function unique_(arr) {
  var seen = {};
  arr.forEach(function(v) { if (v !== '' && v != null) seen[v] = true; });
  return Object.keys(seen);
}

function sortAsc_(arr) {
  return arr.sort(function(a, b) { return String(a).localeCompare(String(b)); });
}

function sortDesc_(arr) {
  return arr.sort(function(a, b) { return String(b).localeCompare(String(a)); });
}

function top_(arr, key, limit) {
  return arr.sort(function(a, b) { return Number(b[key] || 0) - Number(a[key] || 0) || String(a.name || '').localeCompare(String(b.name || '')); }).slice(0, limit || arr.length);
}

function avg_(arr) {
  if (!arr.length) return 0;
  return arr.reduce(function(sum, n) { return sum + Number(n || 0); }, 0) / arr.length;
}

function isFiniteNumber_(n) {
  return typeof n === 'number' && isFinite(n);
}

function round2_(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorMessage_(err) {
  return err && err.message ? err.message : String(err || 'Unknown error');
}

/** Optional utility after importing a fresh XLSX into Google Sheets. */
function clearDashboardCache() {
  var version = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('DASHBOARD_CACHE_VERSION', version);
  return version;
}

/** Optional utility for a time-driven trigger or immediately after cache clearing. */
function warmDashboardCache() {
  var props = PropertiesService.getScriptProperties();
  var config = getConfig_(props);
  var cacheSeconds = getCacheSeconds_(config);
  if (!cacheSeconds) return 0;
  return getSiapRows_(config, CacheService.getScriptCache(), cacheSeconds).length;
}
