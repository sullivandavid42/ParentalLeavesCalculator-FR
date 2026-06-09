// Excel export via SheetJS

const EXCEL_COLORS = {
  naissance:     'FFD966',
  'pater-oblig': 'F4A460',
  'pater-frac':  'FFB347',
  maternite:     'FFB6C1',
  'nouveau-conge': 'AEE1E1',
  cp:            '90EE90',
  rtt:           '98FB98',
  anc:           'DDA0DD',
  ferie:         'D3D3D3',
  weekend:       'F5F5F5',
  work:          'FFFFFF',
  header:        '1A1A2E',
};

function hexToARGB(hex) { return 'FF' + hex.toUpperCase(); }

function makeCellStyle(bgHex, bold = false, fontSize = 10, wrapText = true, hAlign = 'center') {
  return {
    fill: { fgColor: { rgb: hexToARGB(bgHex) } },
    font: { bold, sz: fontSize, color: { rgb: bold ? 'FFFFFFFF' : 'FF000000' } },
    alignment: { horizontal: hAlign, vertical: 'center', wrapText },
    border: {
      top: { style: 'thin', color: { rgb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { rgb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { rgb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { rgb: 'FFD0D0D0' } },
    }
  };
}

function getExcelCellInfo(d, dayMap, hset) {
  const k = dayKey(d);
  if (dayMap.has(k)) {
    const e = dayMap.get(k);
    if (isHoliday(d, hset) && e.type !== 'work') return { color: EXCEL_COLORS.ferie, label: 'Férié' };
    return { color: EXCEL_COLORS[e.type] || 'FFFFFF', label: SHORT_LABELS[e.type] || '' };
  }
  if (isHoliday(d, hset)) return { color: EXCEL_COLORS.ferie, label: 'Férié' };
  if (isWeekend(d)) return { color: EXCEL_COLORS.weekend, label: '' };
  return { color: EXCEL_COLORS.work, label: '' };
}

function numToCol(n) {
  let s = '';
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

function setCell(ws, col, row, value, style) {
  const addr = numToCol(col) + (row + 1);
  ws[addr] = { v: value, t: 's', s: style };
  if (!ws['!ref']) { ws['!ref'] = addr + ':' + addr; return; }
  // extend ref
  const range = XLSX.utils.decode_range(ws['!ref']);
  const cell = XLSX.utils.decode_cell(addr);
  if (cell.r < range.s.r) range.s.r = cell.r;
  if (cell.c < range.s.c) range.s.c = cell.c;
  if (cell.r > range.e.r) range.e.r = cell.r;
  if (cell.c > range.e.c) range.e.c = cell.c;
  ws['!ref'] = XLSX.utils.encode_range(range);
}

function buildSheet1(result, birthDate) {
  const ws = {};
  const { year, dayMap, hset } = result;
  const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const startMonth = birthDate.getMonth();
  let currentRow = 0;
  const colCount = 7;
  const merges = [];

  for (let m = startMonth; m <= 11; m++) {
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const monthLabel = firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    // Month header (merged across 7 cols)
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 6 } });
    setCell(ws, 0, currentRow, monthLabel.toUpperCase(),
      makeCellStyle('1A1A2E', true, 12));
    for (let c = 1; c < 7; c++) setCell(ws, c, currentRow, '', makeCellStyle('1A1A2E', true, 12));
    currentRow++;

    // DOW header
    DOW.forEach((d, c) => setCell(ws, c, currentRow, d, makeCellStyle('E8ECF0', true, 10)));
    currentRow++;

    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    let rowCells = [];
    for (let i = 0; i < startDow; i++) rowCells.push(null);

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, m, day);
      if (d < birthDate) { rowCells.push(null); }
      else {
        const { color, label } = getExcelCellInfo(d, dayMap, hset);
        rowCells.push({ day, color, label });
      }
      if (rowCells.length === 7) {
        rowCells.forEach((cell, c) => {
          if (cell === null) setCell(ws, c, currentRow, '', makeCellStyle('FFFFFF', false, 10));
          else setCell(ws, c, currentRow, `${cell.day}\n${cell.label}`, makeCellStyle(cell.color, false, 10));
        });
        currentRow++;
        rowCells = [];
      }
    }
    if (rowCells.length > 0) {
      while (rowCells.length < 7) rowCells.push(null);
      rowCells.forEach((cell, c) => {
        if (cell === null) setCell(ws, c, currentRow, '', makeCellStyle('FFFFFF', false, 10));
        else setCell(ws, c, currentRow, `${cell.day}\n${cell.label}`, makeCellStyle(cell.color, false, 10));
      });
      currentRow++;
    }
    currentRow++; // blank row between months
  }

  ws['!merges'] = merges;
  ws['!cols'] = Array(7).fill({ wch: 18 });
  return ws;
}

function buildSheet2(result, birthDate) {
  const ws = {};
  const { year, dayMap, hset } = result;
  const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const startMonth = birthDate.getMonth();
  let currentRow = 0;
  const merges = [];

  // Header
  setCell(ws, 0, currentRow, 'Mois', makeCellStyle('1A1A2E', true, 10));
  DOW.forEach((d, i) => setCell(ws, i + 1, currentRow, d, makeCellStyle('E8ECF0', true, 10)));
  currentRow++;

  for (let m = startMonth; m <= 11; m++) {
    const firstDay = new Date(year, m, 1);
    const lastDay = new Date(year, m + 1, 0);
    const monthLabel = firstDay.toLocaleDateString('fr-FR', { month: 'long' });

    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    let rowCells = [];
    for (let i = 0; i < startDow; i++) rowCells.push(null);

    const monthStartRow = currentRow;

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, m, day);
      if (d < birthDate) { rowCells.push(null); }
      else {
        const { color, label } = getExcelCellInfo(d, dayMap, hset);
        rowCells.push({ day, color, label });
      }
      if (rowCells.length === 7) {
        setCell(ws, 0, currentRow, '', makeCellStyle('F0F2F5', false, 10));
        rowCells.forEach((cell, c) => {
          if (cell === null) setCell(ws, c + 1, currentRow, '', makeCellStyle('FFFFFF', false, 10));
          else setCell(ws, c + 1, currentRow, `${cell.day} ${cell.label}`, makeCellStyle(cell.color, false, 10));
        });
        currentRow++;
        rowCells = [];
      }
    }
    if (rowCells.length > 0) {
      while (rowCells.length < 7) rowCells.push(null);
      setCell(ws, 0, currentRow, '', makeCellStyle('F0F2F5', false, 10));
      rowCells.forEach((cell, c) => {
        if (cell === null) setCell(ws, c + 1, currentRow, '', makeCellStyle('FFFFFF', false, 10));
        else setCell(ws, c + 1, currentRow, `${cell.day} ${cell.label}`, makeCellStyle(cell.color, false, 10));
      });
      currentRow++;
    }

    // Merge month label column
    if (currentRow - 1 > monthStartRow) {
      merges.push({ s: { r: monthStartRow, c: 0 }, e: { r: currentRow - 1, c: 0 } });
    }
    setCell(ws, 0, monthStartRow, monthLabel.toUpperCase(), makeCellStyle('E8ECF0', true, 10));
  }

  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 12 }, ...Array(7).fill({ wch: 16 })];
  return ws;
}

function buildSheet3(result) {
  const ws = {};
  let row = 0;

  // Title
  setCell(ws, 0, row, 'SYNTHÈSE & LÉGENDE', makeCellStyle('1A1A2E', true, 14));
  for (let c = 1; c < 5; c++) setCell(ws, c, row, '', makeCellStyle('1A1A2E', true, 14));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  row += 2;

  // Summary table header
  ['Type', 'Durée', 'Du', 'Au', 'Couleur'].forEach((h, c) =>
    setCell(ws, c, row, h, makeCellStyle('E8ECF0', true, 10)));
  row++;

  result.periods.forEach(p => {
    const color = EXCEL_COLORS[p.type] || 'FFFFFF';
    setCell(ws, 0, row, p.label, makeCellStyle('FFFFFF', false, 10, true, 'left'));
    setCell(ws, 1, row, p.unit, makeCellStyle('FFFFFF', false, 10));
    setCell(ws, 2, row, fmt(p.start), makeCellStyle('FFFFFF', false, 10));
    setCell(ws, 3, row, fmt(p.end), makeCellStyle('FFFFFF', false, 10));
    setCell(ws, 4, row, '', makeCellStyle(color, false, 10));
    row++;
  });

  // Reprise
  setCell(ws, 0, row, 'Reprise du travail', makeCellStyle('F0F2F5', true, 10, true, 'left'));
  setCell(ws, 1, row, '', makeCellStyle('F0F2F5', false, 10));
  setCell(ws, 2, row, fmt(result.reprise), makeCellStyle('F0F2F5', true, 10));
  setCell(ws, 3, row, '', makeCellStyle('F0F2F5', false, 10));
  setCell(ws, 4, row, '', makeCellStyle('F0F2F5', false, 10));
  row += 2;

  // Warnings
  if (result.warnings.length) {
    setCell(ws, 0, row, 'AVERTISSEMENTS', makeCellStyle('FFF8E1', true, 11));
    for (let c = 1; c < 5; c++) setCell(ws, c, row, '', makeCellStyle('FFF8E1', false, 11));
    ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 4 } });
    row++;
    result.warnings.forEach(w => {
      setCell(ws, 0, row, '⚠ ' + w, makeCellStyle('FFF8E1', false, 10, true, 'left'));
      for (let c = 1; c < 5; c++) setCell(ws, c, row, '', makeCellStyle('FFF8E1', false, 10));
      ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 4 } });
      row++;
    });
    row++;
  }

  // Legend
  setCell(ws, 0, row, 'LÉGENDE', makeCellStyle('1A1A2E', true, 11));
  for (let c = 1; c < 5; c++) setCell(ws, c, row, '', makeCellStyle('1A1A2E', false, 11));
  ws['!merges'].push({ s: { r: row, c: 0 }, e: { r: row, c: 4 } });
  row++;

  const LEGEND_ITEMS = [
    ['Congé naissance', 'FFD966'],
    ['Paternité obligatoire', 'F4A460'],
    ['Paternité fractionnable', 'FFB347'],
    ['Congé maternité post-natal', 'FFB6C1'],
    ['Nouveau congé de naissance', 'AEE1E1'],
    ['Congés payés', '90EE90'],
    ['RTT', '98FB98'],
    ['Ancienneté', 'DDA0DD'],
    ['Jour férié', 'D3D3D3'],
    ['Week-end', 'F5F5F5'],
    ['Jour travaillé', 'FFFFFF'],
  ];
  LEGEND_ITEMS.forEach(([label, color]) => {
    setCell(ws, 0, row, label, makeCellStyle('FFFFFF', false, 10, false, 'left'));
    setCell(ws, 1, row, '', makeCellStyle(color, false, 10));
    for (let c = 2; c < 5; c++) setCell(ws, c, row, '', makeCellStyle('FFFFFF', false, 10));
    row++;
  });

  ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  return ws;
}

function exportExcel(result, birthDate) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet1(result, birthDate), 'Calendrier par mois');
  XLSX.utils.book_append_sheet(wb, buildSheet2(result, birthDate), 'Calendrier continu');
  XLSX.utils.book_append_sheet(wb, buildSheet3(result), 'Synthèse & Légende');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([wbout], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calendrier-conges-${birthDate.getFullYear()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
