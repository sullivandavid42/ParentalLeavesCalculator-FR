// ── Date helpers ─────────────────────────────────────────────────────────────

function fmt(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtShort(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Pâques (Meeus/Jones/Butcher) ─────────────────────────────────────────────

function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getLegalHolidays(year) {
  const easter = easterDate(year);
  const list = [
    new Date(year, 0, 1),
    addDays(easter, 1),
    new Date(year, 4, 1),
    new Date(year, 4, 8),
    addDays(easter, 39),
    addDays(easter, 50),
    new Date(year, 6, 14),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 10, 11),
    new Date(year, 11, 25),
  ];
  return list;
}

function buildHolidaySet(year, extraDates) {
  const all = getLegalHolidays(year);
  // Include Jan 1 of next year so reprise skips New Year
  all.push(new Date(year + 1, 0, 1));
  extraDates.forEach(d => all.push(d));
  const set = new Set();
  all.forEach(d => set.add(dayKey(d)));
  return set;
}

function isHoliday(d, hset) { return hset.has(dayKey(d)); }
function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
function isSaturday(d) { return d.getDay() === 6; }

// Jour ouvrable = lun–sam hors fériés
function isOuvrable(d, hset) { return !isHoliday(d, hset) && d.getDay() !== 0; }
// Jour ouvré = lun–ven hors fériés
function isOuvre(d, hset) { return !isHoliday(d, hset) && d.getDay() !== 0 && d.getDay() !== 6; }

// Advance to next ouvrable day (inclusive if already ouvrable)
function nextOuvrable(d, hset) {
  let cur = new Date(d);
  while (!isOuvrable(cur, hset)) cur = addDays(cur, 1);
  return cur;
}

// Add N ouvrable days starting from startDay (startDay counts as day 1 if ouvrable)
function addOuvrableDays(startDay, n, hset) {
  let cur = new Date(startDay);
  let count = 0;
  while (count < n) {
    if (isOuvrable(cur, hset)) count++;
    if (count < n) cur = addDays(cur, 1);
  }
  return cur; // last day of the period
}

// Add N ouvré days starting from startDay (startDay counts as day 1 if ouvré)
function addOuvreDays(startDay, n, hset) {
  let cur = new Date(startDay);
  let count = 0;
  while (count < n) {
    if (isOuvre(cur, hset)) count++;
    if (count < n) cur = addDays(cur, 1);
  }
  return cur;
}

// Find the N-th ouvré day from the end of a year (dec 31 going back)
function nthLastOuvreOfYear(year, n, hset) {
  let cur = new Date(year, 11, 31);
  let count = 0;
  while (count < n) {
    if (isOuvre(cur, hset)) count++;
    if (count < n) cur = addDays(cur, -1);
  }
  return cur; // first day of the bloc
}

function addCalendarMonths(startDate, n) {
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + n);
  end.setDate(end.getDate() - 1);
  return end;
}

// ── Core calculation ──────────────────────────────────────────────────────────

function calculate(params) {
  const { birthDate, cp, rtt, anc, extraHolidays, mode, nouveauConge, closurePeriods } = params;
  const year = birthDate.getFullYear();
  const hset = buildHolidaySet(year, extraHolidays);

  const result = { year, warnings: [], hset, periods: [], mode };

  console.group('📅 Calcul calendrier');
  console.log('━━ Paramètres ━━');
  console.log('  Mode        :', mode);
  console.log('  Naissance   :', fmt(birthDate));
  console.log('  CP / RTT / ANC :', cp, '/', rtt, '/', anc);
  console.log('  Nouveau congé :', nouveauConge, 'mois');
  console.log('  Fermetures  :', (closurePeriods || []).map(p => `${fmt(p.start)}→${fmt(p.end)} (${p.label || ''})`).join(', ') || 'aucune');
  console.log('  Fériés extra :', extraHolidays.map(d => fmt(d)).join(', ') || 'aucun');

  let lastCongeEnd;

  if (mode === 'mater') {
    // ── Congé maternité post-natal — 10 semaines calendaires
    const materStart = birthDate;
    const materEnd = addDays(birthDate, 69); // 10 × 7 = 70 jours, début inclus
    result.periods.push({ type: 'maternite', label: 'Congé maternité post-natal', start: materStart, end: materEnd, unit: '10 semaines cal.' });
    lastCongeEnd = materEnd;
    console.log('━━ Maternité ━━');
    console.log('  Maternité   :', fmt(materStart), '→', fmt(materEnd));

    if (materEnd >= new Date(year, 11, 31)) {
      result.warnings.push("Le congé maternité dépasse le 31 décembre. Les CP/RTT/ANC devront être reportés sur l'année suivante.");
    }
  } else {
    // ── 1. Congé naissance — 3 jours ouvrables
    const nascStart = nextOuvrable(birthDate, hset);
    const nascEnd = addOuvrableDays(nascStart, 3, hset);
    result.periods.push({ type: 'naissance', label: 'Congé naissance', start: nascStart, end: nascEnd, unit: '3 j ouvrables' });

    // ── 2. Congé paternité obligatoire — 4 jours calendaires
    const paterObligStart = addDays(nascEnd, 1);
    const paterObligEnd = addDays(paterObligStart, 3);
    result.periods.push({ type: 'pater-oblig', label: 'Paternité obligatoire', start: paterObligStart, end: paterObligEnd, unit: '4 j calendaires' });

    // ── 3. Congé paternité fractionnable — 21 jours calendaires
    // Si le lendemain du congé oblig est un week-end, on démarre le lundi suivant
    let paterFracStart = addDays(paterObligEnd, 1);
    while (paterFracStart.getDay() === 0 || paterFracStart.getDay() === 6) paterFracStart = addDays(paterFracStart, 1);
    const paterFracEnd = addDays(paterFracStart, 20);
    result.periods.push({ type: 'pater-frac', label: 'Paternité fractionnable', start: paterFracStart, end: paterFracEnd, unit: '21 j calendaires' });

    lastCongeEnd = paterFracEnd;
    console.log('━━ Congés obligatoires ━━');
    console.log('  Congé naissance   :', fmt(nascStart), '→', fmt(nascEnd), '(3j ouvrables)');
    console.log('  Pater. obligatoire:', fmt(paterObligStart), '→', fmt(paterObligEnd), '(4j cal)');
    console.log('  Pater. frac.      :', fmt(paterFracStart), '→', fmt(paterFracEnd), '(21j cal)');
  }

  const mandatoryLeaveEnd = lastCongeEnd;
  console.log('  → Fin congés obligatoires :', fmt(mandatoryLeaveEnd));

  // ── Optimisation : trouver la position du nouveau congé qui couvre le plus de fermeture ──
  let ncStart = null, ncEnd = null;
  if (nouveauConge > 0) {
    const minNcStart = addDays(mandatoryLeaveEnd, 1);
    ncStart = new Date(minNcStart);

    if ((closurePeriods || []).length > 0) {
      // Jours de fermeture ouvrés non couverts par les congés obligatoires
      const coveredByMandatory = new Set();
      result.periods.forEach(p => {
        let cur = new Date(p.start);
        while (cur <= p.end) { coveredByMandatory.add(dayKey(cur)); cur = addDays(cur, 1); }
      });
      const closureOuvreDates = [];
      (closurePeriods || []).forEach(({ start, end }) => {
        let cur = new Date(start);
        while (cur <= end) {
          if (isOuvre(cur, hset) && !coveredByMandatory.has(dayKey(cur)))
            closureOuvreDates.push(new Date(cur));
          cur = addDays(cur, 1);
        }
      });

      if (closureOuvreDates.length > 0) {
        let bestCovered = 0;
        let candidate = new Date(minNcStart);
        while (candidate <= new Date(year, 11, 31)) {
          const candEnd = addCalendarMonths(candidate, nouveauConge);
          let covered = 0;
          for (const d of closureOuvreDates) {
            if (d >= candidate && d <= candEnd) covered++;
          }
          if (covered > bestCovered) {
            bestCovered = covered;
            ncStart = new Date(candidate);
          }
          candidate = addDays(candidate, 1);
        }
        if (ncStart > minNcStart && bestCovered > 0) {
          result.warnings.push(`✅ Nouveau congé décalé au ${fmt(ncStart)} : couvre ${bestCovered} j de fermeture obligatoire (économie : ${bestCovered} j CP).`);
        }
      }
    }
    ncEnd = addCalendarMonths(ncStart, nouveauConge);
    console.log('━━ Nouveau congé ━━');
    console.log('  Position       :', fmt(ncStart), '→', fmt(ncEnd));
    console.log('  Décalé (optim) :', ncStart > addDays(mandatoryLeaveEnd, 1) ? 'OUI' : 'non');
  }

  // ── Fermeture — jours ouvrés non couverts par (obligatoires + nouveau congé) ──
  const coveredByLeave = new Set();
  result.periods.forEach(p => {
    let cur = new Date(p.start);
    while (cur <= p.end) { coveredByLeave.add(dayKey(cur)); cur = addDays(cur, 1); }
  });
  if (ncStart && ncEnd) {
    let cur = new Date(ncStart);
    while (cur <= ncEnd) { coveredByLeave.add(dayKey(cur)); cur = addDays(cur, 1); }
  }

  const fermetureKeys = new Set();
  const fermetureSegments = [];
  (closurePeriods || []).forEach(({ start, end, label }) => {
    let segStart = null, segCount = 0;
    let cur = new Date(start);
    while (cur <= end) {
      const free = isOuvre(cur, hset) && !coveredByLeave.has(dayKey(cur));
      if (free) {
        if (!segStart) segStart = new Date(cur);
        fermetureKeys.add(dayKey(cur));
        segCount++;
      } else if (segStart) {
        fermetureSegments.push({ type: 'fermeture', label: label || 'Fermeture', start: segStart, end: addDays(cur, -1), unit: `${segCount} j CP consommés` });
        segStart = null; segCount = 0;
      }
      cur = addDays(cur, 1);
    }
    if (segStart) fermetureSegments.push({ type: 'fermeture', label: label || 'Fermeture', start: segStart, end: new Date(end), unit: `${segCount} j CP consommés` });
  });

  const fermetureCount = fermetureKeys.size;
  console.log('━━ Fermetures ━━');
  console.log('  Jours fermeture ouvrés non couverts :', fermetureCount);
  if (fermetureSegments.length) fermetureSegments.forEach(s => console.log('  Segment:', fmt(s.start), '→', fmt(s.end), s.unit));

  // ── Bloc CP + RTT + ANC ──
  const cpCount = Math.floor(cp);
  const cpAdjusted = Math.max(0, cpCount - fermetureCount);
  const totalOuvre = cpAdjusted + rtt + anc;
  console.log('━━ Bloc CP/RTT/ANC ━━');
  console.log('  CP saisi / arrondi / ajusté :', cp, '/', cpCount, '/', cpAdjusted);
  console.log('  RTT / ANC                   :', rtt, '/', anc);
  console.log('  Total ouvrés à placer       :', totalOuvre);

  let cpEnd;
  if (totalOuvre > 0) {
    // Jours nc toujours inclus dans effectiveHset : nthLastOuvreOfYear les saute
    // → le bloc CP se cale automatiquement dans les ouvrés disponibles (avant ou après nc)
    const nouveauCongeKeys = new Set();
    if (ncStart && ncEnd) {
      let cur = new Date(ncStart);
      while (cur <= ncEnd) { nouveauCongeKeys.add(dayKey(cur)); cur = addDays(cur, 1); }
    }
    const effectiveHset = new Set([...hset, ...fermetureKeys, ...nouveauCongeKeys]);

    const naturalBlocStart = nthLastOuvreOfYear(year, totalOuvre, effectiveHset);
    console.log('  naturalBlocStart            :', fmt(naturalBlocStart));

    let blocStart = naturalBlocStart;
    if (naturalBlocStart <= mandatoryLeaveEnd) {
      blocStart = addDays(mandatoryLeaveEnd, 1);
      while (!isOuvre(blocStart, effectiveHset)) blocStart = addDays(blocStart, 1);
    }
    console.log('  blocStart                   :', fmt(blocStart));

    // nc est "après le bloc CP" si ncStart > blocStart (CP d'abord, puis nc)
    const ncIsAfterBloc = ncStart != null && ncStart > blocStart;
    console.log('  ncIsAfterBloc               :', ncIsAfterBloc);

    if (ncStart && !ncIsAfterBloc) {
      // nc AVANT le bloc CP — travail de mandatoryLeaveEnd+1 à ncStart-1 si décalé
      const preNcWorkStart = addDays(mandatoryLeaveEnd, 1);
      const preNcWorkEnd = addDays(ncStart, -1);
      if (preNcWorkStart <= preNcWorkEnd) {
        let wdays = 0, wcur = new Date(preNcWorkStart);
        while (wcur <= preNcWorkEnd) { if (isOuvre(wcur, hset)) wdays++; wcur = addDays(wcur, 1); }
        if (wdays > 0) result.periods.push({ type: 'work', label: 'Retour au travail', start: preNcWorkStart, end: preNcWorkEnd, unit: `${wdays} j ouvrés travaillés` });
      }
      result.periods.push({ type: 'nouveau-conge', label: `Nouveau congé de naissance (${nouveauConge} mois)`, start: ncStart, end: ncEnd, unit: `${nouveauConge} mois cal.` });
    }

    // Fermeture avant le bloc
    fermetureSegments.forEach(s => { if (s.start < blocStart) result.periods.push(s); });

    // Travail avant le bloc CP
    // Si nc est avant CP : de ncEnd+1 à blocStart-1 ; sinon de mandatoryLeaveEnd+1 à blocStart-1
    const travailStart = (ncStart && !ncIsAfterBloc) ? addDays(ncEnd, 1) : addDays(mandatoryLeaveEnd, 1);
    const travailEnd = addDays(blocStart, -1);
    if (travailStart <= travailEnd) {
      let wdays = 0, wcur = new Date(travailStart);
      while (wcur <= travailEnd) { if (isOuvre(wcur, hset)) wdays++; wcur = addDays(wcur, 1); }
      if (wdays > 0) result.periods.push({ type: 'work', label: 'Retour au travail', start: travailStart, end: travailEnd, unit: `${wdays} j ouvrés travaillés` });
    }

    let cur = blocStart;
    if (anc > 0) {
      const ancEnd = addOuvreDays(cur, anc, effectiveHset);
      result.periods.push({ type: 'anc', label: 'Ancienneté', start: cur, end: ancEnd, unit: `${anc} j ouvré${anc > 1 ? 's' : ''}` });
      cur = addDays(ancEnd, 1);
      while (!isOuvre(cur, effectiveHset)) cur = addDays(cur, 1);
    }
    if (rtt > 0) {
      const rttEnd = addOuvreDays(cur, rtt, effectiveHset);
      result.periods.push({ type: 'rtt', label: 'RTT', start: cur, end: rttEnd, unit: `${rtt} j ouvrés` });
      cur = addDays(rttEnd, 1);
      while (!isOuvre(cur, effectiveHset)) cur = addDays(cur, 1);
    }
    if (cpAdjusted > 0) {
      cpEnd = addOuvreDays(cur, cpAdjusted, effectiveHset);
      result.periods.push({ type: 'cp', label: 'Congés payés', start: cur, end: cpEnd, unit: `${cpAdjusted} j ouvrés` });
      console.log('  CP                          :', fmt(cur), '→', fmt(cpEnd), `(${cpAdjusted}j)`);
      if (cp % 1 !== 0) result.warnings.push(`${cp - cpCount} j CP restant à reporter sur l'année suivante.`);
      if (cpEnd > new Date(year, 11, 31)) {
        let daysJan = 0, w = new Date(year + 1, 0, 1);
        while (w <= cpEnd) { if (isOuvre(w, hset)) daysJan++; w = addDays(w, 1); }
        result.warnings.push(`${daysJan} j de CP reportés en janvier ${year + 1}.`);
      }
    }

    // Fermeture après le bloc
    fermetureSegments.forEach(s => { if (s.start >= blocStart) result.periods.push(s); });

    // nc APRÈS le bloc CP
    if (ncStart && ncIsAfterBloc) {
      const gapStart = cpEnd ? addDays(cpEnd, 1) : addDays(mandatoryLeaveEnd, 1);
      const gapEnd = addDays(ncStart, -1);
      if (gapStart <= gapEnd) {
        let gdays = 0, gc = new Date(gapStart);
        while (gc <= gapEnd) { if (isOuvre(gc, hset)) gdays++; gc = addDays(gc, 1); }
        if (gdays > 0) result.periods.push({ type: 'work', label: 'Retour au travail', start: gapStart, end: gapEnd, unit: `${gdays} j ouvrés travaillés` });
      }
      result.periods.push({ type: 'nouveau-conge', label: `Nouveau congé de naissance (${nouveauConge} mois)`, start: ncStart, end: ncEnd, unit: `${nouveauConge} mois cal.` });
    }
  } else {
    // Pas de bloc CP/RTT/ANC
    if (ncStart) {
      result.periods.push({ type: 'nouveau-conge', label: `Nouveau congé de naissance (${nouveauConge} mois)`, start: ncStart, end: ncEnd, unit: `${nouveauConge} mois cal.` });
    }
    fermetureSegments.forEach(s => result.periods.push(s));
  }

  if (fermetureCount > 0) {
    result.warnings.push(`${fermetureCount} j ouvrés de fermeture consomment du CP (non couverts par un autre congé).`);
  }

  // Reprise — premier jour ouvré après la fin du dernier congé (CP ou nouveau congé)
  const finalEnd = [cpEnd, ncEnd].filter(Boolean).reduce((a, b) => (a > b ? a : b), mandatoryLeaveEnd);
  const reprBase = addDays(finalEnd, 1);
  let reprCur = new Date(reprBase);
  while (!isOuvre(reprCur, hset)) reprCur = addDays(reprCur, 1);
  result.reprise = reprCur;

  console.log('━━ Résumé final ━━');
  const sorted = [...result.periods].sort((a, b) => a.start - b.start);
  sorted.forEach(p => console.log(' ', p.type.padEnd(14), fmt(p.start), '→', fmt(p.end), ' ', p.unit));
  console.log('  reprise'.padEnd(16), fmt(result.reprise));
  if (result.warnings.length) console.log('  ⚠ warnings:', result.warnings);
  console.groupEnd();

  result.dayMap = buildDayMap(result, hset);
  return result;
}

// CP, RTT, ANC, fermeture are counted in ouvré days — weekends must not be colored
const OUVRE_TYPES = new Set(['cp', 'rtt', 'anc', 'fermeture']);

function buildDayMap(result, hset) {
  const map = new Map();

  // Pour CP/RTT/ANC, les jours du nouveau congé (calendaire) ne doivent pas être colorés
  // même si le calcul a étendu la période CP au-delà du début du nc
  const ncBlockDays = new Set();
  result.periods.forEach(p => {
    if (p.type === 'nouveau-conge') {
      let cur = new Date(p.start);
      while (cur <= p.end) { ncBlockDays.add(dayKey(cur)); cur = addDays(cur, 1); }
    }
  });
  const cpHset = ncBlockDays.size > 0 ? new Set([...hset, ...ncBlockDays]) : hset;

  result.periods.forEach(p => {
    let cur = new Date(p.start);
    while (cur <= p.end) {
      let ok;
      if (!OUVRE_TYPES.has(p.type)) {
        ok = true; // types calendaires : tous les jours
      } else if (p.type === 'fermeture') {
        ok = isOuvre(cur, hset); // fermeture : hset de base
      } else {
        ok = isOuvre(cur, cpHset); // cp/rtt/anc : exclure les jours nc
      }
      if (ok) {
        const k = dayKey(cur);
        if (!map.has(k)) map.set(k, { type: p.type, label: p.label });
      }
      cur = addDays(cur, 1);
    }
  });
  return map;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  fermeture:       '#FF9E9E',
  'nouveau-conge': '#AEE1E1',
  naissance:   '#FFD966',
  'pater-oblig': '#F4A460',
  'pater-frac':  '#FFB347',
  maternite:   '#FFB6C1',
  cp:          '#90EE90',
  rtt:         '#98FB98',
  anc:         '#DDA0DD',
  ferie:       '#D3D3D3',
  weekend:     '#F5F5F5',
  work:        '#ffffff',
};

const TYPE_CSS = {
  fermeture:       'c-fermeture',
  'nouveau-conge': 'c-nouveau-conge',
  naissance:   'c-naissance',
  'pater-oblig': 'c-pater-oblig',
  'pater-frac':  'c-pater-frac',
  maternite:   'c-maternite',
  cp:          'c-cp',
  rtt:         'c-rtt',
  anc:         'c-anc',
  ferie:       'c-ferie',
  weekend:     'c-weekend',
  work:        'c-work',
};

const SHORT_LABELS = {
  fermeture:       'Fermeture',
  'nouveau-conge': 'Nouv. congé',
  naissance: 'Congé naissance',
  'pater-oblig': 'Pater. oblig.',
  'pater-frac': 'Pater. frac.',
  maternite: 'Maternité',
  cp: 'CP',
  rtt: 'RTT',
  anc: 'Ancienneté',
  ferie: 'Férié',
  weekend: '',
  work: '',
};

function getCellInfo(d, dayMap, hset) {
  const k = dayKey(d);
  if (dayMap.has(k)) {
    const e = dayMap.get(k);
    // If it's a holiday, show holiday color on top
    if (isHoliday(d, hset) && e.type !== 'work') return { cssClass: 'c-ferie', label: 'Férié' };
    return { cssClass: TYPE_CSS[e.type] || 'c-work', label: SHORT_LABELS[e.type] || '' };
  }
  if (isHoliday(d, hset)) return { cssClass: 'c-ferie', label: 'Férié' };
  if (isWeekend(d)) return { cssClass: 'c-weekend', label: '' };
  return { cssClass: 'c-work', label: '' };
}

const LEGEND_PATER = [
  { type: 'naissance',   label: 'Congé naissance' },
  { type: 'pater-oblig', label: 'Paternité obligatoire' },
  { type: 'pater-frac',  label: 'Paternité fractionnable' },
];
const LEGEND_MATER = [
  { type: 'maternite',   label: 'Congé maternité post-natal' },
];
const LEGEND_COMMON = [
  { type: 'cp',      label: 'Congés payés' },
  { type: 'rtt',     label: 'RTT' },
  { type: 'anc',     label: 'Ancienneté' },
  { type: 'ferie',   label: 'Jour férié' },
  { type: 'weekend', label: 'Week-end' },
];

function renderLegend(mode, result) {
  const specific = mode === 'mater' ? LEGEND_MATER : LEGEND_PATER;
  const ncEntry = result.periods.some(p => p.type === 'nouveau-conge')
    ? [{ type: 'nouveau-conge', label: 'Nouveau congé de naissance' }]
    : [];
  const ftEntry = result.periods.some(p => p.type === 'fermeture')
    ? [{ type: 'fermeture', label: 'Fermeture (CP obligatoire)' }]
    : [];
  const items = [...specific, ...ncEntry, ...ftEntry, ...LEGEND_COMMON];
  const container = document.getElementById('legend');
  container.innerHTML = items.map(({ type, label }) => {
    const color = TYPE_COLORS[type];
    const border = type === 'weekend' ? ' border:1px solid #ddd;' : '';
    return `<div class="legend-item"><div class="legend-swatch" style="background:${color};${border}"></div>${label}</div>`;
  }).join('');
}

function renderMonthBlock(container, y, m, dayMap, hset, minDate) {
  const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);

  const block = document.createElement('div');
  block.className = 'month-block';

  const title = document.createElement('h3');
  title.textContent = firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  block.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  DOW.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-header-cell';
    h.textContent = d;
    grid.appendChild(h);
  });

  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  for (let i = 0; i < startDow; i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell empty';
    grid.appendChild(e);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(y, m, day);
    if (minDate && d < minDate) {
      const e = document.createElement('div');
      e.className = 'cal-cell empty';
      grid.appendChild(e);
      continue;
    }
    const { cssClass, label } = getCellInfo(d, dayMap, hset);
    const cell = document.createElement('div');
    cell.className = `cal-cell ${cssClass}`;
    const num = document.createElement('div');
    num.className = 'cal-day-num';
    num.textContent = day;
    cell.appendChild(num);
    if (label) {
      const lbl = document.createElement('div');
      lbl.className = 'cal-label';
      lbl.textContent = label;
      cell.appendChild(lbl);
    }
    grid.appendChild(cell);
  }

  block.appendChild(grid);
  container.appendChild(block);
}

function renderCalendar(result, birthDate) {
  const { year, dayMap, hset } = result;
  const container = document.getElementById('calendar-months');
  container.innerHTML = '';

  for (let m = birthDate.getMonth(); m <= 11; m++) {
    renderMonthBlock(container, year, m, dayMap, hset, birthDate);
  }

  // Afficher janvier de l'année suivante si des périodes y débordent
  const needsJan = result.periods.some(p => p.end.getFullYear() > year);
  if (needsJan) {
    renderMonthBlock(container, year + 1, 0, dayMap, hset, null);
  }
}

function renderSummary(result) {
  const tbody = document.querySelector('#summary-table tbody');
  tbody.innerHTML = '';
  const sorted = [...result.periods].sort((a, b) => a.start - b.start);
  sorted.forEach(p => {
    const tr = document.createElement('tr');
    const color = TYPE_COLORS[p.type] || '#fff';
    tr.innerHTML = `
      <td><span class="color-swatch" style="background:${color}"></span>${p.label}</td>
      <td>${p.unit}</td>
      <td>${fmt(p.start)}</td>
      <td>${fmt(p.end)}</td>`;
    tbody.appendChild(tr);
  });
  // Reprise row
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><strong>Reprise du travail</strong></td><td></td><td><strong>${fmt(result.reprise)}</strong></td><td></td>`;
  tbody.appendChild(tr);
}

function renderWarnings(result) {
  const el = document.getElementById('warnings');
  el.innerHTML = '';
  result.warnings.forEach(w => {
    const d = document.createElement('div');
    const isInfo = w.startsWith('✅');
    d.className = isInfo ? 'warning warning-info' : 'warning';
    d.textContent = isInfo ? w : '⚠️ ' + w;
    el.appendChild(d);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

let currentResult = null;
let closurePeriods = [];

function renderFermetureTags() {
  const container = document.getElementById('fermeture-tags');
  container.innerHTML = '';
  closurePeriods.forEach((p, i) => {
    const tag = document.createElement('span');
    tag.className = 'ferie-tag';
    const lbl = p.label ? ` — ${p.label}` : '';
    tag.innerHTML = `${fmtShort(p.start)} → ${fmtShort(p.end)}${lbl} <button onclick="removeClosurePeriod(${i})" title="Supprimer">×</button>`;
    container.appendChild(tag);
  });
}

function removeClosurePeriod(i) {
  closurePeriods.splice(i, 1);
  renderFermetureTags();
}

let extraHolidayDates = [
  new Date(new Date().getFullYear(), 10, 11),
  new Date(new Date().getFullYear(), 11, 24),
  new Date(new Date().getFullYear(), 11, 25),
];

function renderExtraHolidays() {
  const container = document.getElementById('feries-tags');
  container.innerHTML = '';
  extraHolidayDates.forEach((d, i) => {
    const tag = document.createElement('span');
    tag.className = 'ferie-tag';
    tag.innerHTML = `${fmtShort(d)} <button onclick="removeHoliday(${i})" title="Supprimer">×</button>`;
    container.appendChild(tag);
  });
}

function removeHoliday(i) {
  extraHolidayDates.splice(i, 1);
  renderExtraHolidays();
}

document.getElementById('btn-add-fermeture').addEventListener('click', () => {
  const startVal = document.getElementById('fermeture-start').value;
  const endVal   = document.getElementById('fermeture-end').value;
  if (!startVal || !endVal) return;
  const start = new Date(startVal + 'T00:00:00');
  const end   = new Date(endVal   + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return;
  const label = document.getElementById('fermeture-label').value.trim();
  closurePeriods.push({ start, end, label });
  renderFermetureTags();
  document.getElementById('fermeture-start').value = '';
  document.getElementById('fermeture-end').value   = '';
  document.getElementById('fermeture-label').value  = '';
});

document.getElementById('btn-add-ferie').addEventListener('click', () => {
  const val = document.getElementById('ferie-input').value;
  if (!val) return;
  const d = new Date(val + 'T00:00:00');
  if (isNaN(d)) return;
  extraHolidayDates.push(d);
  renderExtraHolidays();
  document.getElementById('ferie-input').value = '';
});

document.getElementById('btn-calc').addEventListener('click', () => {
  const birthStr = document.getElementById('birth-date').value;
  if (!birthStr) { alert('Veuillez saisir une date de naissance.'); return; }
  const birthDate = new Date(birthStr + 'T00:00:00');
  if (isNaN(birthDate)) { alert('Date invalide.'); return; }

  const cpRaw  = parseFloat(document.getElementById('cp').value);
  const rttRaw = parseInt(document.getElementById('rtt').value);
  const ancRaw = parseInt(document.getElementById('anc').value);
  const cp  = Number.isFinite(cpRaw)  ? cpRaw  : 20.5;
  const rtt = Number.isFinite(rttRaw) ? rttRaw : 7;
  const anc = Number.isFinite(ancRaw) ? ancRaw : 1;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const nouveauConge = parseInt(document.querySelector('input[name="nouveau-conge"]:checked').value);

  const yr = birthDate.getFullYear();
  const adjusted = extraHolidayDates.map(d => new Date(yr, d.getMonth(), d.getDate()));
  const syncedClosures = closurePeriods.map(p => ({
    start: new Date(yr, p.start.getMonth(), p.start.getDate()),
    end:   new Date(yr, p.end.getMonth(),   p.end.getDate()),
    label: p.label,
  }));

  currentResult = calculate({ birthDate, cp, rtt, anc, extraHolidays: adjusted, mode, nouveauConge, closurePeriods: syncedClosures });

  renderWarnings(currentResult);
  renderSummary(currentResult);
  renderCalendar(currentResult, birthDate);
  renderLegend(mode, currentResult);

  document.getElementById('results').style.display = 'block';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
});

document.addEventListener('DOMContentLoaded', () => {
  renderExtraHolidays();
  renderFermetureTags();
});
