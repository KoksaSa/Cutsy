// ═══════════════════════════════════════════════════════════════════════
// CPS2 FORMAT EXPORTER — браузерная версия для CypCut
// ═══════════════════════════════════════════════════════════════════════
//
// Экспорт раскроя в формат .cps2 (CypCut Laser Cutting Software).
// Формат основан на побайтовом реверс-инжиниринге реальных CPS2-файлов.
//
// ЗАВИСИМОСТИ: JSZip (загружается через CDN в index.html)
//
// ИСПОЛЬЗОВАНИЕ (из браузера):
//
//   const blob = await exportCPS2({
//     parts: [...],
//     nestedParts: [...],
//     sheetSize: { width: 3000, height: 1500 },
//   });
//   // blob — готовый Blob для скачивания
//
// ПАЛИТРА ЦВЕТОВ (ColorIndex → канал в CypCut):
//   0  = без канала
//   1  = Зелёный   (#4DFF4D) — обычно Резка
//   2  = Розовый   (#FFA6D3) — обычно Маркировка
//   3  = Жёлтый    (#FFFF79)
//   4  = Лососёвый (#FFA6A6)
//   5  = Фиолетовый(#A64DFF)
//   6  = Бирюзовый (#4DA6A6)
//   7  = Оранжевый (#FFA679)
//   8  = Оливковый (#4DA64D)
//   9  = Малиновый (#FF4DA6)
//   10 = Голубой   (#4DA6FF)
//   11 = Мятный    (#4DFFA6)
//   12 = Пурпурный (#FF4DFF)
//   13 = Синий     (#4D4DFF)
//   14 = Лавандовый(#A6A6FF)
//   15 = Серый     (#C8C8C8)
//
// ═══════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════
// ОБЪЕДИНЕНИЕ СОПРИКАСАЮЩИХСЯ ДЕТАЛЕЙ (spacing=0) — встроенный модуль
// ═══════════════════════════════════════════════════════════════════════
// Раньше был отдельным файлом cps2-touching-merger.js
// Теперь встроен в cps2-export.js чтобы упростить обновление на сервере.
//
// Принцип работы (co-edge подход CypCut):
//   1. Находим группы соприкасающихся деталей (spacing=0 у обеих, BBOX касаются)
//   2. Трансформируем геометрию каждой детали в общую систему координат
//   3. Создаём одну виртуальную деталь с контурами всех деталей группы
//      (КАЖДАЯ деталь остаётся отдельным замкнутым контуром!)
//   4. Заменяем в nestedParts N деталей на 1 виртуальную
//   5. CypCut сам распознаёт общие рёбра (co-edge) и режет их один раз
//
(function() {
// ═══════════════════════════════════════════════════════════════════════
// CPS2 TOUCHING PARTS MERGER — объединение соприкасающихся деталей (spacing=0)
// для экспорта в CPS2 как единый контур (одна врезка лазера на группу).
// ═══════════════════════════════════════════════════════════════════════
//
// ПРОБЛЕМА
// -------
// При раскрое детали с spacing=0 физически соприкасаются на листе.
// В текущем экспорте каждая деталь → отдельный Block + Insert →
// лазер делает отдельную врезку для каждой детали и идёт по общему
// ребру дважды (туда-обратно), что:
//   - удваивает время реза на общих рёбрах
//   - оставляет двойной рез на общей границе (ухудшает качество)
//   - создаёт лишние врезки (прожиги листа)
//
// РЕШЕНИЕ
// -------
// Перед формированием Block'ов:
//   1. Находим группы соприкасающихся деталей (spacing=0 у обеих + BBOX пересекаются)
//   2. Трансформируем геометрию каждой детали группы в общую систему координат
//      (поворот + сдвиг к общему началу группы)
//   3. Создаём одну виртуальную деталь с объединёнными объектами
//   4. Заменяем в nestedParts N деталей на 1 виртуальную
//
// Виртуальная деталь дальше идёт по стандартному пути экспорта:
//   mergeObjectsToContours → buildLwPolylineGeo → Block + Insert
// Сшивка контуров убирает дублирующиеся рёбра автоматически.
//
// КООРДИНАТЫ
// ----------
// Работаем в canvas-системе (Y-down) — той же, что использует cps2-export.js
// до шага Y-отражения. После объединения виртуальная деталь обрабатывается
// обычным путём (включая Y-отражение в buildBlock).
//
// ОГРАНИЧЕНИЯ
// -----------
// - Угол поворота деталей в одной группе должен быть одинаковым.
//   (Разные углы + spacing=0 — редкий случай; выводим warning и не объединяем.)
// - Касание определяется по BBOX, не по реальной геометрии.
//   (Для прямоугольных деталей это точно; для криволинейных возможны
//   ложные срабатывания, но они безопасны — просто объединяем чуть больше.)
//
// ═══════════════════════════════════════════════════════════════════════

/**
 * Главное API: обрабатывает один лист, возвращает обновлённый список
 * nestedParts и массив виртуальных деталей, которые нужно добавить в parts.
 *
 * @param {Array} nestedParts — размещения деталей на листе
 * @param {Array} parts       — определения деталей (с part.objects)
 * @param {Object} sheetSize  — { width, height } (не используется, для будущих проверок)
 * @returns {{ nestedParts: Array, mergedParts: Array }}
 *          - nestedParts: новый массив (длина ≤ исходной)
 *          - mergedParts: виртуальные детали для добавления в parts
 */
function mergeTouchingPartsForExport(nestedParts, parts, sheetSize) {
  if (!nestedParts || nestedParts.length === 0) {
    return { nestedParts: [], mergedParts: [] };
  }

  // Маппинг partId → part для быстрого поиска
  const partsMap = new Map();
  for (const p of parts) {
    partsMap.set(Number(p.id), p);
  }

  // ── Шаг 1: для каждой вложенной детали вычисляем её BBox на листе ──
  // BBox на листе = (nested.x, nested.y) + AABB повёрнутой геометрии
  const items = [];
  for (let i = 0; i < nestedParts.length; i++) {
    const np = nestedParts[i];
    const part = partsMap.get(Number(np.partId));
    if (!part || !part.objects || part.objects.length === 0) {
      // Эту деталь не можем обработать — оставляем как есть
      items.push({
        idx: i,
        nested: np,
        part: null,
        spacing: 3, // не объединяем
        bbox: null,
      });
      continue;
    }

    const angle = np.angle ?? 0;
    // Локальный BBox детали (без поворота)
    const localBBox = computeLocalBBox(part.objects);
    if (!localBBox) {
      items.push({
        idx: i,
        nested: np,
        part: null,
        spacing: 3,
        bbox: null,
      });
      continue;
    }

    // BBox с учётом поворота вокруг центра (в локальных координатах)
    const rotBBox = rotateBBox(localBBox, angle);
    // BBox на листе (canvas Y-down)
    const sheetBBox = {
      minX: (np.x ?? 0),
      minY: (np.y ?? 0),
      maxX: (np.x ?? 0) + rotBBox.w,
      maxY: (np.y ?? 0) + rotBBox.h,
      w: rotBBox.w,
      h: rotBBox.h,
    };

    items.push({
      idx: i,
      nested: np,
      part,
      angle,
      spacing: typeof part.spacing === 'number' ? part.spacing : 3,
      localBBox,
      rotBBox,
      sheetBBox,
    });
  }

  // ── Шаг 2: находим соприкасающиеся пары (spacing=0 у обеих, BBOX касаются) ──
  const TOUCH_TOLERANCE = 0.5; // мм — допуск на "касание" BBOX
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i, j) => { parent[find(i)] = find(j); };

  // Диагностика: выводим spacing и BBox каждой детали
  console.log(`🔗 [TOUCH-MERGE] Анализ ${items.length} размещений:`);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.part) {
      console.log(`  [${i}] partId=${it.nested.partId} — определение детали не найдено, пропуск`);
      continue;
    }
    const sb = it.sheetBBox;
    console.log(`  [${i}] partId=${it.nested.partId} spacing=${it.spacing} pos=(${(it.nested.x ?? 0).toFixed(1)},${(it.nested.y ?? 0).toFixed(1)}) angle=${(it.angle * 180 / Math.PI).toFixed(1)}° bbox=${sb ? `${sb.w.toFixed(1)}×${sb.h.toFixed(1)} at (${sb.minX.toFixed(1)},${sb.minY.toFixed(1)})` : 'null'}`);
  }

  let pairsCount = 0;
  let checkedPairs = 0;
  let spacingZeroCount = 0;
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.spacing !== 0 || !a.sheetBBox) continue;
    spacingZeroCount++;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.spacing !== 0 || !b.sheetBBox) continue;
      checkedPairs++;
      const touch = bboxesTouch(a.sheetBBox, b.sheetBBox, TOUCH_TOLERANCE);
      if (touch) {
        union(i, j);
        pairsCount++;
        console.log(`  ✓ Касание: [${i}] ↔ [${j}]`);
      }
    }
  }
  console.log(`🔗 [TOUCH-MERGE] Деталей с spacing=0: ${spacingZeroCount}, проверено пар: ${checkedPairs}, найдено касаний: ${pairsCount}`);

  if (pairsCount === 0) {
    // Никаких объединений — возвращаем как есть
    console.log(`🔗 [TOUCH-MERGE] Объединений нет — экспорт как обычно`);
    return { nestedParts: nestedParts.slice(), mergedParts: [] };
  }

  // ── Шаг 3: группируем по корням union-find ──
  const groupsMap = new Map();
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    if (!groupsMap.has(r)) groupsMap.set(r, []);
    groupsMap.get(r).push(items[i]);
  }

  // ── Шаг 4: для каждой группы с >1 деталью создаём виртуальную деталь ──
  const newNestedParts = [];
  const mergedParts = [];
  let mergedCounter = 0;

  for (const group of groupsMap.values()) {
    if (group.length === 1) {
      // Одиночная деталь — пропускаем без изменений
      newNestedParts.push(group[0].nested);
      continue;
    }

    // Группа для объединения
    const mergeResult = buildMergedPart(group, mergedCounter++);
    if (mergeResult) {
      mergedParts.push(mergeResult.mergedPart);
      newNestedParts.push(mergeResult.mergedNested);
    } else {
      // Объединение не удалось — возвращаем исходные детали
      for (const item of group) {
        newNestedParts.push(item.nested);
      }
    }
  }

  console.log(`🔗 [TOUCH-MERGE] Объединено пар: ${pairsCount}, групп >1 детали: ${mergedParts.length}, итоговый nestedParts: ${newNestedParts.length} (было ${nestedParts.length})`);

  return { nestedParts: newNestedParts, mergedParts };
}

// ═══════════════════════════════════════════════════════════════════════
// Внутренние функции
// ═══════════════════════════════════════════════════════════════════════

/**
 * Создаёт виртуальную деталь для группы соприкасающихся деталей.
 * Трансформирует геометрию каждой детали в общую систему координат группы.
 *
 * @param {Array} group — массив объектов { nested, part, angle, localBBox, rotBBox, sheetBBox }
 * @param {number} counter — порядковый номер (для уникального ID)
 * @returns {{ mergedPart: Object, mergedNested: Object } | null}
 */
function buildMergedPart(group, counter) {
  // Проверяем, что у всех деталей группы одинаковый угол
  // (разные углы + соприкосновение — слишком сложный случай)
  const angles = new Set(group.map(g => Math.round((g.angle ?? 0) * 10000) / 10000));
  if (angles.size > 1) {
    console.warn(`🔗 [TOUCH-MERGE] Группа #${counter}: разные углы у деталей (${[...angles].map(a => (a * 180 / Math.PI).toFixed(1) + '°').join(', ')}) — пропускаем объединение`);
    return null;
  }
  const commonAngle = group[0].angle ?? 0;

  // Находим общий BBox группы на листе
  let groupMinX = Infinity, groupMinY = Infinity;
  for (const g of group) {
    if (!g.sheetBBox) continue;
    groupMinX = Math.min(groupMinX, g.sheetBBox.minX);
    groupMinY = Math.min(groupMinY, g.sheetBBox.minY);
  }
  if (groupMinX === Infinity) return null;

  // Для каждой детали трансформируем её объекты в координаты группы
  // (относительно точки (groupMinX, groupMinY))
  const mergedObjects = [];
  for (const g of group) {
    if (!g.part) continue;
    const offsetX = (g.nested.x ?? 0) - groupMinX;
    const offsetY = (g.nested.y ?? 0) - groupMinY;
    for (const obj of g.part.objects) {
      const transformed = transformObject(obj, offsetX, offsetY, commonAngle, g.localBBox);
      if (transformed) mergedObjects.push(transformed);
    }
  }

  if (mergedObjects.length === 0) return null;

  // ── ВАЖНО: НЕ тесселируем и НЕ удаляем общие рёбра! ──
  //
  // Раньше я тесселировал все объекты в линии и удалял дубликаты общих рёбер.
  // Это приводило к слиянию всех деталей в ОДИН большой контур.
  //
  // Но пользователь хочет, чтобы каждая деталь оставалась ОТДЕЛЬНЫМ контуром
  // в одном Block-е (как в CypCut co-edge группе). Тогда:
  //   - Каждая трапеция = отдельный замкнутый контур
  //   - Каждое отверстие = отдельный замкнутый контур
  //   - Общие рёбра ОСТАЮТСЯ в геометрии (CypCut сам их убирает через co-edge)
  //   - Одна врезка лазера на весь Block (лазер идёт непрерывно)
  //
  // contour-merger обработает каждый замкнутый объект (rect, polygon, circle)
  // как отдельный замкнутый контур — именно то, что нужно.

  // Создаём виртуальную деталь
  const partIds = group.map(g => g.part ? g.part.id : '?').join('_');
  const partNames = group.map(g => g.part ? (g.part.name || `Деталь ${g.part.id}`) : '?').join(' + ');
  const mergedPart = {
    id: `__merged_${counter}__`, // уникальный строковый ID — не конфликтует с Number()
    _originalPartIds: partIds,
    name: `Merged: ${partNames}`,
    objects: mergedObjects,
    thickness: group[0]?.part?.thickness ?? 0.8,
    spacing: 0,
    _isMergedGroup: true,
  };

  // Создаём nestedPart, ссылающийся на виртуальную деталь
  const mergedNested = {
    partId: mergedPart.id,
    x: groupMinX,
    y: groupMinY,
    angle: 0, // угол уже применён к геометрии
    _mergedFrom: group.map(g => g.nested.partId), // для отладки
    _isCoEdgeGroup: true, // флаг: это co-edge группа, нужен NestGroup в XML
    _groupSize: group.length, // кол-во деталей в группе
  };

  console.log(`🔗 [TOUCH-MERGE] Группа #${counter}: объединено ${group.length} деталей (${partNames}) в позицию (${groupMinX.toFixed(1)},${groupMinY.toFixed(1)}) угол=${(commonAngle * 180 / Math.PI).toFixed(1)}°, объектов: ${mergedObjects.length}`);

  return { mergedPart, mergedNested };
}

/**
 * Вычисляет BBox массива объектов в их локальных координатах (без трансформаций).
 *
 * @param {Array} objects
 * @returns {{ minX, minY, maxX, maxY, w, h } | null}
 */
function computeLocalBBox(objects) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  for (const obj of objects || []) {
    const pts = extractObjectPoints(obj);
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      hasPoints = true;
    }
  }

  if (!hasPoints) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Извлекает опорные точки объекта (для вычисления BBox).
 * Возвращает массив { x, y }.
 */
function extractObjectPoints(obj) {
  if (!obj) return [];
  switch (obj.type) {
    case 'line':
      return [
        { x: obj.x1 ?? 0, y: obj.y1 ?? 0 },
        { x: obj.x2 ?? 0, y: obj.y2 ?? 0 },
      ];
    case 'rect': {
      const x = obj.x ?? 0, y = obj.y ?? 0;
      const w = obj.width ?? 0, h = obj.height ?? 0;
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
    }
    case 'circle':
    case 'arc': {
      const cx = obj.cx ?? 0, cy = obj.cy ?? 0, r = Math.abs(obj.radius ?? 0);
      return [
        { x: cx - r, y: cy - r },
        { x: cx + r, y: cy + r },
      ];
    }
    case 'ellipse': {
      const cx = obj.cx ?? 0, cy = obj.cy ?? 0;
      const rx = Math.abs(obj.rx ?? 0), ry = Math.abs(obj.ry ?? 0);
      return [
        { x: cx - rx, y: cy - ry },
        { x: cx + rx, y: cy + ry },
      ];
    }
    case 'polyline':
    case 'lwpolyline':
    case 'polygon':
    case 'spline':
      return (obj.points || obj.vertices || obj.fitPoints || obj.controlPoints || [])
        .filter(v => v && typeof v.x === 'number' && typeof v.y === 'number')
        .map(v => ({ x: v.x, y: v.y }));
    default:
      return [];
  }
}

/**
 * Поворачивает BBox вокруг его центра на заданный угол и возвращает
 * BBox повёрнутой геометрии.
 *
 * @param {{ minX, minY, maxX, maxY, w, h }} bbox
 * @param {number} angleRad
 * @returns {{ w, h }} — ширина и высота повёрнутого BBox
 */
function rotateBBox(bbox, angleRad) {
  if (Math.abs(angleRad) < 1e-6) {
    return { w: bbox.w, h: bbox.h };
  }
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Поворачиваем 4 угла BBox
  const corners = [
    { x: bbox.minX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.minY },
    { x: bbox.maxX, y: bbox.maxY },
    { x: bbox.minX, y: bbox.maxY },
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const dx = c.x - cx;
    const dy = c.y - cy;
    const rx = cx + dx * cosA - dy * sinA;
    const ry = cy + dx * sinA + dy * cosA;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/**
 * Проверяет, касаются ли два BBOX (с допуском).
 * "Касаются" = пересекаются ИЛИ расстояние между ними ≤ tolerance.
 */
function bboxesTouch(a, b, tolerance) {
  // Расширяем A на tolerance с каждой стороны и проверяем пересечение
  return (
    a.minX - tolerance < b.maxX &&
    a.maxX + tolerance > b.minX &&
    a.minY - tolerance < b.maxY &&
    a.maxY + tolerance > b.minY
  );
}

/**
 * Трансформирует объект: нормализует к (0,0), поворачивает вокруг центра
 * локального BBox на angle, сдвигает на (offsetX, offsetY).
 *
 * Возвращает новый объект (не мутирует исходный).
 *
 * @param {Object} obj — исходный объект детали
 * @param {number} offsetX — сдвиг по X (в координаты группы)
 * @param {number} offsetY — сдвиг по Y
 * @param {number} angleRad — угол поворота
 * @param {{ minX, minY, maxX, maxY }} localBBox — локальный BBox детали (для центра поворота)
 * @returns {Object | null} — трансформированный объект
 */
function transformObject(obj, offsetX, offsetY, angleRad, localBBox) {
  if (!obj) return null;

  // Если угол ~0 — просто сдвигаем
  if (Math.abs(angleRad) < 1e-6) {
    return shiftObject(obj, offsetX, offsetY);
  }

  // Иначе — поворот вокруг центра BBox + сдвиг
  const cx = (localBBox.minX + localBBox.maxX) / 2;
  const cy = (localBBox.minY + localBBox.maxY) / 2;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Нормализуем к (0,0), потом поворачиваем вокруг (cx-minX, cy-minY),
  // потом сдвигаем на (offsetX, offsetY).
  const normX = cx - localBBox.minX;
  const normY = cy - localBBox.minY;

  // Функция поворота точки вокруг (normX, normY) и сдвига на (offsetX, offsetY)
  const rotatePoint = (px, py) => {
    // Нормализуем
    const nx = px - localBBox.minX;
    const ny = py - localBBox.minY;
    // Поворачиваем вокруг (normX, normY)
    const dx = nx - normX;
    const dy = ny - normY;
    const rx = normX + dx * cosA - dy * sinA;
    const ry = normY + dx * sinA + dy * cosA;
    // Сдвигаем
    return { x: rx + offsetX, y: ry + offsetY };
  };

  switch (obj.type) {
    case 'line': {
      const p1 = rotatePoint(obj.x1 ?? 0, obj.y1 ?? 0);
      const p2 = rotatePoint(obj.x2 ?? 0, obj.y2 ?? 0);
      return { ...obj, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    case 'rect': {
      // Прямоугольник при повороте → 4 точки, преобразуем в polyline
      const x = obj.x ?? 0, y = obj.y ?? 0;
      const w = obj.width ?? 0, h = obj.height ?? 0;
      const corners = [
        rotatePoint(x, y),
        rotatePoint(x + w, y),
        rotatePoint(x + w, y + h),
        rotatePoint(x, y + h),
      ];
      return {
        type: 'polygon',
        points: corners,
        color: obj.color,
        colorIndex: obj.colorIndex,
        layer: obj.layer,
        closed: true,
      };
    }
    case 'circle': {
      const c = rotatePoint(obj.cx ?? 0, obj.cy ?? 0);
      return { ...obj, cx: c.x, cy: c.y };
    }
    case 'arc': {
      const c = rotatePoint(obj.cx ?? 0, obj.cy ?? 0);
      // Для дуги корректируем startAngle/endAngle на угол поворота
      const newStart = (obj.startAngle ?? 0) + angleRad;
      const newEnd = (obj.endAngle ?? (2 * Math.PI)) + angleRad;
      return { ...obj, cx: c.x, cy: c.y, startAngle: newStart, endAngle: newEnd };
    }
    case 'ellipse': {
      // Эллипс при повороте на произвольный угол — это уже не оси X/Y.
      // Простейший подход: преобразуем в polyline с точками.
      const cx = obj.cx ?? 0, cy = obj.cy ?? 0;
      const rx = Math.abs(obj.rx ?? 0), ry = Math.abs(obj.ry ?? 0);
      const segments = 36;
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        pts.push(rotatePoint(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
      }
      return {
        type: 'polygon',
        points: pts,
        color: obj.color,
        colorIndex: obj.colorIndex,
        layer: obj.layer,
        closed: true,
      };
    }
    case 'polyline':
    case 'lwpolyline':
    case 'polygon': {
      const pts = (obj.points || obj.vertices || [])
        .filter(v => v && typeof v.x === 'number' && typeof v.y === 'number')
        .map(v => rotatePoint(v.x, v.y));
      return { ...obj, points: pts, vertices: pts };
    }
    case 'spline': {
      const pts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
        .filter(v => v && typeof v.x === 'number' && typeof v.y === 'number')
        .map(v => rotatePoint(v.x, v.y));
      return { ...obj, fitPoints: pts, controlPoints: pts, points: pts, vertices: pts };
    }
    default:
      // Неизвестный тип — возвращаем как есть со сдвигом
      return shiftObject(obj, offsetX, offsetY);
  }
}

/**
 * Сдвигает объект на (dx, dy) без поворота.
 */
function shiftObject(obj, dx, dy) {
  if (!obj) return null;
  switch (obj.type) {
    case 'line':
      return {
        ...obj,
        x1: (obj.x1 ?? 0) + dx,
        y1: (obj.y1 ?? 0) + dy,
        x2: (obj.x2 ?? 0) + dx,
        y2: (obj.y2 ?? 0) + dy,
      };
    case 'rect':
      return { ...obj, x: (obj.x ?? 0) + dx, y: (obj.y ?? 0) + dy };
    case 'circle':
    case 'arc':
      return { ...obj, cx: (obj.cx ?? 0) + dx, cy: (obj.cy ?? 0) + dy };
    case 'ellipse':
      return { ...obj, cx: (obj.cx ?? 0) + dx, cy: (obj.cy ?? 0) + dy };
    case 'polyline':
    case 'lwpolyline':
    case 'polygon': {
      const pts = (obj.points || obj.vertices || []).map(v => ({ x: v.x + dx, y: v.y + dy }));
      return { ...obj, points: pts, vertices: pts };
    }
    case 'spline': {
      const pts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
        .map(v => ({ x: v.x + dx, y: v.y + dy }));
      return { ...obj, fitPoints: pts, controlPoints: pts, points: pts, vertices: pts };
    }
    default:
      return { ...obj };
  }
}

/**
 * Тесселяция: преобразует геометрию в массив линий.
 *
 * Замкнутые контуры (rect, polygon, замкнутая polyline, circle, ellipse)
 * разбиваются на отдельные линии по рёбрам/сегментам.
 * Открытые контуры (line, arc, незамкнутая polyline) тоже тесселируются
 * в линии (arc → N линий по сегментам).
 *
 * Цель: получить однородный набор линий, который contour-merger сможет
 * сшивать. Дубликаты на общих рёбрах будут удалены deduplicateSegments.
 *
 * @param {Array} objects — исходные объекты детали
 * @returns {Array} — массив объектов типа 'line'
 */
function tessellateToLines(objects) {
  const result = [];
  for (const obj of objects || []) {
    if (!obj) continue;
    const lines = tessellateObject(obj);
    result.push(...lines);
  }
  return result;
}

/**
 * Тесселирует один объект в массив линий.
 */
function tessellateObject(obj) {
  switch (obj.type) {
    case 'line':
      return [obj];

    case 'rect': {
      const x = obj.x ?? 0, y = obj.y ?? 0;
      const w = obj.width ?? 0, h = obj.height ?? 0;
      const pts = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
      return pointsToLines(pts, true, obj);
    }

    case 'polygon': {
      const pts = (obj.points || obj.vertices || [])
        .filter(v => v && typeof v.x === 'number' && typeof v.y === 'number');
      if (pts.length < 2) return [];
      return pointsToLines(pts, obj.closed !== false, obj);
    }

    case 'polyline':
    case 'lwpolyline': {
      const pts = (obj.points || obj.vertices || [])
        .filter(v => v && typeof v.x === 'number' && typeof v.y === 'number');
      if (pts.length < 2) return [];
      return pointsToLines(pts, obj.closed === true, obj);
    }

    case 'circle': {
      const cx = obj.cx ?? 0, cy = obj.cy ?? 0;
      const r = Math.abs(obj.radius ?? 0);
      if (r < 0.001) return [];
      const segments = 48;
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      return pointsToLines(pts, true, obj);
    }

    case 'arc': {
      const cx = obj.cx ?? 0, cy = obj.cy ?? 0;
      const r = Math.abs(obj.radius ?? 0);
      if (r < 0.001) return [];
      const startA = obj.startAngle ?? 0;
      const endA = obj.endAngle ?? (2 * Math.PI);

      let dir = 1;
      if (typeof obj.direction === 'string') {
        dir = obj.direction.toUpperCase() === 'CW' ? -1 : 1;
      } else if (typeof obj.direction === 'number') {
        dir = obj.direction >= 0 ? 1 : -1;
      }

      let sweep;
      if (dir >= 0) {
        sweep = endA - startA;
        if (sweep <= 0) sweep += 2 * Math.PI;
      } else {
        sweep = startA - endA;
        if (sweep <= 0) sweep += 2 * Math.PI;
      }

      const segments = 24;
      const step = sweep / segments;
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const a = startA + dir * step * i;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      return pointsToLines(pts, false, obj);
    }

    case 'ellipse': {
      const cx = obj.cx ?? 0, cy = obj.cy ?? 0;
      const rx = Math.abs(obj.rx ?? 0), ry = Math.abs(obj.ry ?? 0);
      if (rx < 0.001 || ry < 0.001) return [];
      const segments = 36;
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
      }
      return pointsToLines(pts, true, obj);
    }

    case 'spline': {
      const pts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
        .filter(v => v && typeof v.x === 'number' && typeof v.y === 'number');
      if (pts.length < 2) return [];
      return pointsToLines(pts, obj.closed === true, obj);
    }

    default:
      // Неизвестный тип — пропускаем
      return [];
  }
}

/**
 * Преобразует массив точек в массив линий.
 *
 * @param {Array} pts — массив { x, y }
 * @param {boolean} closed — если true, добавляет линию из последней точки в первую
 * @param {Object} srcObj — исходный объект (для наследования color, layer и т.д.)
 * @returns {Array} — массив объектов типа 'line'
 */
function pointsToLines(pts, closed, srcObj) {
  const lines = [];
  const common = {
    color: srcObj.color,
    colorIndex: srcObj.colorIndex,
    layer: srcObj.layer,
    _effectiveLineType: srcObj._effectiveLineType,
    _isContinuous: srcObj._isContinuous,
  };
  for (let i = 0; i < pts.length - 1; i++) {
    lines.push({
      type: 'line',
      x1: pts[i].x,
      y1: pts[i].y,
      x2: pts[i + 1].x,
      y2: pts[i + 1].y,
      ...common,
    });
  }
  if (closed && pts.length >= 3) {
    lines.push({
      type: 'line',
      x1: pts[pts.length - 1].x,
      y1: pts[pts.length - 1].y,
      x2: pts[0].x,
      y2: pts[0].y,
      ...common,
    });
  }
  return lines;
}

/**
 * Удаляет ОБЕ копии дублирующихся линий.
 *
 * В отличие от deduplicateSegments в contour-merger (который оставляет одну
 * копию), эта функция удаляет обе — потому что общее ребро соприкасающихся
 * деталей не должно резаться вообще.
 *
 * Допуск: 0.1 мм (как в contour-merger).
 *
 * @param {Array} lines — массив объектов типа 'line'
 * @returns {Array} — массив без дублирующихся пар
 */
function removeSharedEdges(lines) {
  const TOL = 0.1;
  const toRemove = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (toRemove.has(j)) continue;
      const a = lines[i];
      const b = lines[j];
      // Прямое совпадение: (a.x1,a.y1)≈(b.x1,b.y1) && (a.x2,a.y2)≈(b.x2,b.y2)
      const forward =
        Math.abs(a.x1 - b.x1) < TOL && Math.abs(a.y1 - b.y1) < TOL &&
        Math.abs(a.x2 - b.x2) < TOL && Math.abs(a.y2 - b.y2) < TOL;
      // Обратное совпадение: (a.x1,a.y1)≈(b.x2,b.y2) && (a.x2,a.y2)≈(b.x1,b.y1)
      const reverse =
        Math.abs(a.x1 - b.x2) < TOL && Math.abs(a.y1 - b.y2) < TOL &&
        Math.abs(a.x2 - b.x1) < TOL && Math.abs(a.y2 - b.y1) < TOL;

      if (forward || reverse) {
        toRemove.add(i);
        toRemove.add(j);
        console.log(`🔗 [TOUCH-MERGE] Удалено общее ребро: (${a.x1.toFixed(1)},${a.y1.toFixed(1)})→(${a.x2.toFixed(1)},${a.y2.toFixed(1)})`);
        break; // i уже помечен — переходим к следующему i
      }
    }
  }

  if (toRemove.size === 0) return lines;
  console.log(`🔗 [TOUCH-MERGE] Удалено общих рёбер: ${toRemove.size} линий (из ${lines.length})`);
  return lines.filter((_, idx) => !toRemove.has(idx));
}


if (typeof window !== 'undefined') {
  window.mergeTouchingPartsForExport = mergeTouchingPartsForExport;
}

// Для CommonJS/Node
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeTouchingPartsForExport };
}

// Регистрируем главную функцию в глобальной области
if (typeof window !== 'undefined') {
  window.mergeTouchingPartsForExport = mergeTouchingPartsForExport;
}
})();
// ═══════════════════════════════════════════════════════════════════════

// ─── Константы бинарного формата ──────────────────────────────────────

const BCMP_HEADER_SIZE = 4096;
const MAGIC_START  = 0xD1D1D1D1;
const MARKER_C1    = 0xC1C1C1C1;
const MARKER_C0    = 0xC0C0C0C0;
const MARKER_D0    = 0xD0D0D0D0;

// Размеры записей (верифицировано по реальным файлам)
const SHAPE_SIZE_LWPOLYLINE = 248; // size_field = 244
const SHAPE_SIZE_CIRCLE     = 240; // size_field = 236
const GEO_HEADER_SIZE       = 88;
const GEO_FOOTER_SIZE       = 16;
const GEO_VERTEX_SIZE       = 32;
const GEO_CIRCLE_SIZE       = 120; // size_field = 120

// ═══════════════════════════════════════════════════════════════════════
// BinaryWriter — браузерная реализация (Uint8Array + DataView)
// ═══════════════════════════════════════════════════════════════════════

class BinaryWriter {
  constructor(size) {
    this.buf = new Uint8Array(size);
    this.dv = new DataView(this.buf.buffer);
    this.off = 0;
  }

  writeUint32(val) {
    this.dv.setUint32(this.off, val >>> 0, true); // little-endian
    this.off += 4;
  }

  writeDouble(val) {
    this.dv.setFloat64(this.off, val, true); // little-endian
    this.off += 8;
  }

  writeBytes(arr) {
    for (const b of arr) this.buf[this.off++] = b;
  }

  writeString(str) {
    // Формат: 53 00 <длина> 00 + символы + паддинг до 8-байтовой границы
    this.writeBytes([0x53, 0x00, str.length, 0x00]);
    for (let i = 0; i < str.length; i++) {
      this.buf[this.off++] = str.charCodeAt(i);
    }
    const total = 4 + str.length;
    const pad = Math.ceil(total / 8) * 8 - total;
    this.off += pad;
  }

  getBytes() {
    return this.buf.subarray(0, this.off);
  }
}

// ─── BCMP-заголовок ──────────────────────────────────────────────────

function createBCMPHeader(dataSize) {
  // ВАЖНО: заголовок BCMP всегда ровно 4096 байт!
  // Bytes 0-3: "BCMP", 4-7: total size, 8-11: 1, 12-4095: нули
  const buf = new Uint8Array(BCMP_HEADER_SIZE); // все нули
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x43; buf[2] = 0x4D; buf[3] = 0x50; // "BCMP"
  dv.setUint32(4, BCMP_HEADER_SIZE + dataSize, true); // little-endian
  dv.setUint32(8, 1, true);
  return buf; // полные 4096 байт
}

// ═══════════════════════════════════════════════════════════════════════
// ПОСТРОИТЕЛИ ЗАПИСЕЙ Shapes2D/data.bin
// ═══════════════════════════════════════════════════════════════════════

/**
 * Запись LwPolyline для Shapes2D/data.bin (248 байт)
 */
function buildLwPolylineShape(handle, colorIndex) {
  const w = new BinaryWriter(SHAPE_SIZE_LWPOLYLINE);

  // Record header
  w.writeUint32(MAGIC_START);                       // [0]
  w.writeUint32(0);                                  // [4]
  w.writeUint32(SHAPE_SIZE_LWPOLYLINE - 4);          // [8] = 244
  w.writeUint32(0);                                  // [12]

  // Class name "TGksLwPolyline" (13 символов → 24 байта с паддингом)
  w.writeString('TGksLwPolyline');                   // [16-39]

  // Object subsection
  w.writeUint32(MARKER_C1);                         // [40]
  w.writeUint32(1);                                  // [44] prop count
  w.writeUint32(0x28);                               // [48] size=40
  w.writeUint32(0);                                  // [52]
  w.writeString('Object');                           // [56-71] (6 символов → 16 байт)
  w.writeUint32(handle);                             // [72]
  w.writeUint32(MARKER_C0);                         // [76]

  // Shape subsection
  w.writeUint32(MARKER_C1);                         // [80]
  w.writeUint32(5);                                  // [84] prop count
  w.writeUint32(0x50);                               // [88] size=80
  w.writeUint32(0);                                  // [92]
  w.writeString('Shape');                            // [96-111] (5 символов → 16 байт)

  // ★ ColorIndex — ключевое поле для назначения канала ★
  w.writeUint32(colorIndex);                         // [112]
  w.writeUint32(0);                                  // [116]
  w.writeUint32(0);                                  // [120]
  w.writeUint32(0);                                  // [124]
  w.writeUint32(0);                                  // [128]
  w.writeUint32(0);                                  // [132]
  w.writeUint32(0);                                  // [136]
  w.writeUint32(0);                                  // [140]
  w.writeUint32(0);                                  // [144]
  w.writeUint32(0);                                  // [148]
  w.writeUint32(0);                                  // [152]
  w.writeUint32(MARKER_C0);                         // [156] Shape end

  // Gap
  w.writeUint32(0);                                  // [160]
  w.writeUint32(0);                                  // [164]

  // Curve subsection
  w.writeUint32(MARKER_C1);                         // [168]
  w.writeUint32(2);                                  // [172] prop count
  w.writeUint32(0x48);                               // [176] size=72
  w.writeUint32(0);                                  // [180]
  w.writeString('Curve');                            // [184-199] (5 символов → 16 байт)

  // Curve properties
  w.writeUint32(0);                                  // [200]
  w.writeUint32(0);                                  // [204]
  w.writeUint32(1);                                  // [208]
  w.writeUint32(0);                                  // [212]
  w.writeUint32(0);                                  // [216]
  w.writeUint32(0);                                  // [220]
  w.writeUint32(0);                                  // [224]
  w.writeUint32(0);                                  // [228]
  w.writeUint32(6);                                  // [232]
  w.writeUint32(MARKER_C0);                         // [236] Curve end
  w.writeUint32(MARKER_D0);                         // [240] Record end
  w.writeUint32(0);                                  // [244]

  return w.getBytes();
}

/**
 * Запись Circle для Shapes2D/data.bin (240 байт)
 */
function buildCircleShape(handle, colorIndex) {
  const w = new BinaryWriter(SHAPE_SIZE_CIRCLE);

  // Record header
  w.writeUint32(MAGIC_START);                       // [0]
  w.writeUint32(0);                                  // [4]
  w.writeUint32(SHAPE_SIZE_CIRCLE - 4);              // [8] = 236
  w.writeUint32(0);                                  // [12]

  // Class name "TGksCircle" (10 символов → 16 байт с паддингом)
  w.writeString('TGksCircle');                       // [16-31]

  // Object subsection
  w.writeUint32(MARKER_C1);                         // [32]
  w.writeUint32(1);                                  // [36]
  w.writeUint32(0x28);                               // [40] size=40
  w.writeUint32(0);                                  // [44]
  w.writeString('Object');                           // [48-63]
  w.writeUint32(handle);                             // [64]
  w.writeUint32(MARKER_C0);                         // [68]

  // Shape subsection
  w.writeUint32(MARKER_C1);                         // [72]
  w.writeUint32(5);                                  // [76]
  w.writeUint32(0x50);                               // [80] size=80
  w.writeUint32(0);                                  // [84]
  w.writeString('Shape');                            // [88-103]

  // Shape properties for Circle
  w.writeUint32(1);                                  // [104] всегда 1
  w.writeUint32(colorIndex);                         // [108] ★ COLOR INDEX ★
  w.writeUint32(0);                                  // [112]
  w.writeUint32(0);                                  // [116]
  w.writeUint32(0);                                  // [120]
  w.writeUint32(0);                                  // [124]
  w.writeUint32(0);                                  // [128]
  w.writeUint32(0);                                  // [132]
  w.writeUint32(0);                                  // [136]
  w.writeUint32(0);                                  // [140]
  w.writeUint32(0);                                  // [144]
  w.writeUint32(MARKER_C0);                         // [148] Shape end

  // Gap
  w.writeUint32(0);                                  // [152]
  w.writeUint32(0);                                  // [156]

  // Curve subsection
  w.writeUint32(MARKER_C1);                         // [160]
  w.writeUint32(2);                                  // [164]
  w.writeUint32(0x48);                               // [168] size=72
  w.writeUint32(0);                                  // [172]
  w.writeString('Curve');                            // [176-191]

  // Curve properties
  w.writeUint32(0);                                  // [192]
  w.writeUint32(0);                                  // [196]
  w.writeUint32(1);                                  // [200]
  w.writeUint32(0);                                  // [204]
  w.writeUint32(0);                                  // [208]
  w.writeUint32(0);                                  // [212]
  w.writeUint32(0);                                  // [216]
  w.writeUint32(0);                                  // [220]
  w.writeUint32(6);                                  // [224]
  w.writeUint32(MARKER_C0);                         // [228] Curve end
  w.writeUint32(MARKER_D0);                         // [232] Record end
  w.writeUint32(0);                                  // [236]

  return w.getBytes();
}

// ═══════════════════════════════════════════════════════════════════════
// ПОСТРОИТЕЛИ ЗАПИСЕЙ Geometry2D/data.bin
// ═══════════════════════════════════════════════════════════════════════

/**
 * Геометрия LwPolyline: 88 + vertexCount*32 + 16 байт
 */
function buildLwPolylineGeo(closed, vertices, bulges) {
  const recSize = GEO_HEADER_SIZE + vertices.length * GEO_VERTEX_SIZE + GEO_FOOTER_SIZE;
  const w = new BinaryWriter(recSize);

  // Header
  w.writeUint32(MAGIC_START);                       // [0]
  w.writeUint32(0);                                  // [4]
  w.writeUint32(recSize - 4);                        // [8]
  w.writeUint32(0);                                  // [12]
  w.writeString('TGksLwPolyline');                   // [16-39]
  w.writeUint32(MARKER_C1);                         // [40]
  w.writeUint32(1);                                  // [44]
  w.writeUint32(recSize - 48);                       // [48] subsection size
  w.writeUint32(0);                                  // [52]
  w.writeString('LwPolyline');                       // [56-71]

  w.writeUint32(0);                                  // [72]
  w.writeUint32(0);                                  // [76]
  w.writeUint32(closed ? 1 : 0);                     // [80] closed flag
  w.writeUint32(vertices.length);                    // [84] vertex count

  // Vertex data (32 bytes each)
  for (let i = 0; i < vertices.length; i++) {
    w.writeUint32(i + 1);                            // index (1-based)
    w.writeDouble(vertices[i].x);                    // X
    w.writeDouble(vertices[i].y);                    // Y
    w.writeDouble(bulges ? (bulges[i] || 0) : 0);   // bulge
    w.writeUint32(0);                                // padding
  }

  // Footer: 0 + C0 + D0 + 0
  w.writeUint32(0);
  w.writeUint32(MARKER_C0);
  w.writeUint32(MARKER_D0);
  w.writeUint32(0);

  return w.getBytes();
}

/**
 * Геометрия Circle: 124 байта (4 + size_field=120)
 */
function buildCircleGeo(cx, cy, radius) {
  const w = new BinaryWriter(4 + GEO_CIRCLE_SIZE);

  w.writeUint32(MAGIC_START);                       // [0]
  w.writeUint32(0);                                  // [4]
  w.writeUint32(GEO_CIRCLE_SIZE);                    // [8] size=120
  w.writeUint32(0);                                  // [12]
  w.writeString('TGksCircle');                       // [16-31]
  w.writeUint32(MARKER_C1);                         // [32]
  w.writeUint32(1);                                  // [36]
  w.writeUint32(0x54);                               // [40] subsection size=84
  w.writeUint32(0);                                  // [44]
  w.writeString('Circle');                           // [48-63]

  // Circle geometry data
  w.writeUint32(0x00020010);                         // [64] flags
  w.writeDouble(cx);                                 // [68] center X
  w.writeDouble(cy);                                 // [76] center Y
  w.writeDouble(radius);                             // [84] radius
  w.writeUint32(0);                                  // [92]
  w.writeDouble(0.7853981633974483);                  // [96] start angle = π/4
  w.writeUint32(0);                                  // [104]
  w.writeUint32(0);                                  // [108]

  // End markers
  w.writeUint32(MARKER_C0);                         // [112]
  w.writeUint32(MARKER_D0);                         // [116]
  w.writeUint32(0);                                  // [120]

  return w.getBytes();
}

// ═══════════════════════════════════════════════════════════════════════
// КОНВЕРТАЦИЯ ТИПОВ ФИГУР В ВНУТРЕННЕЕ ПРЕДСТАВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════════════

// Палитра цветов Cutsy → ColorIndex CypCut
const CPS2_COLOR_MAP = {
    '#4DFF4D': 1,  // Зелёный → Резка
    '#FFA6D3': 2,  // Розовый → Маркировка
    '#FFFF79': 3,  // Жёлтый
    '#FFA6A6': 4,  // Лососёвый
    '#A64DFF': 5,  // Фиолетовый
    '#4DA6A6': 6,  // Бирюзовый
    '#FFA679': 7,  // Оранжевый
    '#4DA64D': 8,  // Оливковый
    '#FF4DA6': 9,  // Малиновый
    '#4DA6FF': 10, // Голубой
    '#4DFFA6': 11, // Мятный
    '#FF4DFF': 12, // Пурпурный
    '#4D4DFF': 13, // Тёмно-синий
    '#A6A6FF': 14, // Лавандовый
    '#C8C8C8': 15, // Серый
};

function colorToColorIndex(color, defaultChannel) {
    if (!color) return defaultChannel || 1;
    const idx = CPS2_COLOR_MAP[color.toUpperCase()];
    if (idx) return idx;
    // Для дефолтных цветов объектов (#00aadd, #000000) — назначаем канал по умолчанию
    return defaultChannel || 1;
}

function processShape(obj, handle, defaultChannel) {
  const colorIndex = obj.colorIndex ?? colorToColorIndex(obj.color, defaultChannel);

  switch (obj.type) {
    case 'line': {
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: false,
        vertices: [
          { x: obj.x1 ?? 0, y: obj.y1 ?? 0 },
          { x: obj.x2 ?? 0, y: obj.y2 ?? 0 },
        ],
        bulges: [0, 0],
      };
    }

    case 'rect': {
      const x = obj.x ?? 0, y = obj.y ?? 0;
      const rw = obj.width ?? 0, rh = obj.height ?? 0;
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: true,
        vertices: [
          { x, y },
          { x: x + rw, y },
          { x: x + rw, y: y + rh },
          { x, y: y + rh },
        ],
        bulges: [0, 0, 0, 0],
      };
    }

    case 'circle': {
      // Конвертируем круг в LwPolyline — надёжнее чем Circle binary format,
      // который вызывает Access Violation в CypCut при чтении.
      const ccx = obj.cx ?? 0, ccy = obj.cy ?? 0;
      const cr = Math.abs(obj.radius ?? 0);
      const cSegments = 48;
      const cVerts = [];
      for (let i = 0; i < cSegments; i++) {
        const a = (2 * Math.PI * i) / cSegments;
        cVerts.push({
          x: ccx + Math.cos(a) * cr,
          y: ccy + Math.sin(a) * cr,
        });
      }
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: true,
        vertices: cVerts,
        bulges: cVerts.map(() => 0),
      };
    }

    case 'polyline':
    case 'lwpolyline': {
      const pts = (obj.points || obj.vertices || []).filter(
        v => v && typeof v.x === 'number' && typeof v.y === 'number'
      );
      if (pts.length < 2) return null;
      const first = pts[0], last = pts[pts.length - 1];
      const isClosed = obj.closed ??
        (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: isClosed,
        vertices: pts,
        bulges: pts.map(() => 0),
      };
    }

    case 'polygon': {
      const pts = (obj.points || obj.vertices || []).filter(
        v => v && typeof v.x === 'number' && typeof v.y === 'number'
      );
      if (pts.length < 3) return null;
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: true,
        vertices: pts,
        bulges: pts.map(() => 0),
      };
    }

    case 'arc': {
      const acx = obj.cx ?? 0, acy = obj.cy ?? 0;
      const r = Math.abs(obj.radius ?? 0);
      const startA = obj.startAngle ?? 0;
      const endA = obj.endAngle ?? (2 * Math.PI);
      let dir = 1;
      if (typeof obj.direction === 'string') {
        dir = obj.direction.toUpperCase() === 'CW' ? -1 : 1;
      } else if (typeof obj.direction === 'number') {
        dir = obj.direction >= 0 ? 1 : -1;
      }

      let sweep;
      if (dir >= 0) {
        sweep = endA - startA;
        if (sweep <= 0) sweep += 2 * Math.PI;
      } else {
        sweep = startA - endA;
        if (sweep <= 0) sweep += 2 * Math.PI;
      }

      const segments = 24;
      const step = sweep / segments;
      const arcVerts = [];
      for (let i = 0; i <= segments; i++) {
        const a = startA + dir * step * i;
        arcVerts.push({
          x: acx + Math.cos(a) * r,
          y: acy + Math.sin(a) * r,
        });
      }

      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: false,
        vertices: arcVerts,
        bulges: arcVerts.map(() => 0),
      };
    }

    case 'ellipse': {
      const ecx = obj.cx ?? 0, ecy = obj.cy ?? 0;
      const rx = obj.rx ?? 0, ry = obj.ry ?? 0;
      const segments = 36;
      const ellipseVerts = [];
      for (let i = 0; i <= segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        ellipseVerts.push({
          x: ecx + Math.cos(a) * rx,
          y: ecy + Math.sin(a) * ry,
        });
      }
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: true,
        vertices: ellipseVerts,
        bulges: ellipseVerts.map(() => 0),
      };
    }

    case 'spline': {
      const pts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || []).filter(
        v => v && typeof v.x === 'number' && typeof v.y === 'number'
      );
      if (pts.length < 2) return null;
      const first = pts[0], last = pts[pts.length - 1];
      const isClosed = obj.closed ??
        (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);
      return {
        handle,
        className: 'LwPolyline',
        colorIndex,
        closed: isClosed,
        vertices: pts,
        bulges: pts.map(() => 0),
      };
    }

    default:
      console.warn(`CPS2: неподдерживаемый тип фигуры: ${obj.type}`);
      return null;
  }
}

// ─── Fallback: если mergeObjectsToContours не загружен ─────────────
function fallbackProcessShapes(objects, handleCounter, defaultChannel) {
  const contours = [];
  for (const obj of objects) {
    const shape = processShape(obj, handleCounter, defaultChannel);
    if (!shape) continue;
    contours.push({
      vertices: shape.vertices,
      closed: shape.closed ?? false,
      colorIndex: shape.colorIndex ?? 0,
      layerName: 'OUTLINE',
    });
  }
  return contours;
}

// ─── XML для каналов обработки ────────────────────────────────────────

function buildTechnicalChannelsXml(channels) {
  let xml = `<?xml version="1.0" encoding="utf-8"?>
<Technical Handle="2">
\t<Channels>
\t\t<Channel ParamFlag="256"/>
\t\t<Channel ChannelPort="1" ParamFlag="768" DefPwmFreqFunc="true" DefPwmRatioFunc="true">
\t\t\t<CamParams WorkSpeed="100">
\t\t\t\t<Cut Focus="0" GasPressure="5" Height="1" LaserCurrent="100" PeakPower="1000" LaserMode="0" PwmFreq="1000" PwmRatio="1"/>
\t\t\t</CamParams>
\t\t\t<PwmFreqFunc/>
\t\t\t<PwmRatioFunc/>
\t\t\t<MaterialParams/>
\t\t</Channel>`;

  for (let port = 2; port <= 15; port++) {
    const customChannel = channels && channels.find(c => c.port === port);
    if (customChannel) {
      xml += `
\t\t<Channel ChannelPort="${port}" ParamFlag="768" DefPwmFreqFunc="true" DefPwmRatioFunc="true">
\t\t\t<CamParams WorkSpeed="${customChannel.workSpeed ?? 100}">
\t\t\t\t<Cut Focus="0" GasPressure="${customChannel.gasPressure ?? 5}" Height="${customChannel.height ?? 1}" LaserCurrent="${customChannel.laserCurrent ?? 100}" PeakPower="${customChannel.peakPower ?? 1000}" LaserMode="0" PwmFreq="${customChannel.pwmFreq ?? 1000}" PwmRatio="${customChannel.pwmRatio ?? 1}"/>
\t\t\t</CamParams>
\t\t\t<PwmFreqFunc/>
\t\t\t<PwmRatioFunc/>
\t\t\t<MaterialParams/>
\t\t</Channel>`;
    } else {
      xml += `\n\t\t<Channel ChannelPort="${port}"/>`;
    }
  }

  xml += '\n\t</Channels>\n</Technical>';
  return xml;
}

// ─── UUID ─────────────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }).toUpperCase();
}

// ─── MD5 (браузерная реализация через SubtleCrypto) ───────────────────

async function md5Hex(uint8Array) {
  // SubtleCrypto не поддерживает MD5, поэтому используем простую JS-реализацию
  // Для совместимости с CypCut нужен именно MD5
  return md5(uint8Array);
}

// ─── Простая реализация MD5 (для браузера) ────────────────────────────
// Основано на RFC 1321

function md5(input) {
  // input — Uint8Array
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  function safeAdd(x, y) {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }
  function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | (~d)), a, b, x, s, t); }

  function binlMD5(x, len) {
    x[len >> 5] |= 0x80 << (len % 32);
    x[((len + 64) >>> 9 << 4) + 14] = len;

    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d;

      a = md5ff(a, b, c, d, x[i],      7, -680876936);
      d = md5ff(d, a, b, c, x[i+1],   12, -389564586);
      c = md5ff(c, d, a, b, x[i+2],   17,  606105819);
      b = md5ff(b, c, d, a, x[i+3],   22, -1044525330);
      a = md5ff(a, b, c, d, x[i+4],    7, -176418897);
      d = md5ff(d, a, b, c, x[i+5],   12,  1200080426);
      c = md5ff(c, d, a, b, x[i+6],   17, -1473231341);
      b = md5ff(b, c, d, a, x[i+7],   22, -45705983);
      a = md5ff(a, b, c, d, x[i+8],    7,  1770035416);
      d = md5ff(d, a, b, c, x[i+9],   12, -1958414417);
      c = md5ff(c, d, a, b, x[i+10],  17, -42063);
      b = md5ff(b, c, d, a, x[i+11],  22, -1990404162);
      a = md5ff(a, b, c, d, x[i+12],   7,  1804603682);
      d = md5ff(d, a, b, c, x[i+13],  12, -40341101);
      c = md5ff(c, d, a, b, x[i+14],  17, -1502002290);
      b = md5ff(b, c, d, a, x[i+15],  22,  1236535329);

      a = md5gg(a, b, c, d, x[i+1],    5, -165796510);
      d = md5gg(d, a, b, c, x[i+6],    9, -1069501632);
      c = md5gg(c, d, a, b, x[i+11],  14,  643717713);
      b = md5gg(b, c, d, a, x[i],     20, -373897302);
      a = md5gg(a, b, c, d, x[i+5],    5, -701558691);
      d = md5gg(d, a, b, c, x[i+10],   9,  38016083);
      c = md5gg(c, d, a, b, x[i+15],  14, -660478335);
      b = md5gg(b, c, d, a, x[i+4],   20, -405537848);
      a = md5gg(a, b, c, d, x[i+9],    5,  568446438);
      d = md5gg(d, a, b, c, x[i+14],   9, -1019803690);
      c = md5gg(c, d, a, b, x[i+3],   14, -187363961);
      b = md5gg(b, c, d, a, x[i+8],   20,  1163531501);
      a = md5gg(a, b, c, d, x[i+13],   5, -1444681467);
      d = md5gg(d, a, b, c, x[i+2],    9, -51403784);
      c = md5gg(c, d, a, b, x[i+7],   14,  1735328473);
      b = md5gg(b, c, d, a, x[i+12],  20, -1926607734);

      a = md5hh(a, b, c, d, x[i+5],    4, -378558);
      d = md5hh(d, a, b, c, x[i+8],   11, -2022574463);
      c = md5hh(c, d, a, b, x[i+11],  16,  1839030562);
      b = md5hh(b, c, d, a, x[i+14],  23, -35309556);
      a = md5hh(a, b, c, d, x[i+1],    4, -1530992060);
      d = md5hh(d, a, b, c, x[i+4],   11,  1272893353);
      c = md5hh(c, d, a, b, x[i+7],   16, -155497632);
      b = md5hh(b, c, d, a, x[i+10],  23, -1094730640);
      a = md5hh(a, b, c, d, x[i+13],   4,  681279174);
      d = md5hh(d, a, b, c, x[i],     11, -358537222);
      c = md5hh(c, d, a, b, x[i+3],   16, -722521979);
      b = md5hh(b, c, d, a, x[i+6],   23,  76029189);
      a = md5hh(a, b, c, d, x[i+9],    4, -640364487);
      d = md5hh(d, a, b, c, x[i+12],  11, -421815835);
      c = md5hh(c, d, a, b, x[i+15],  16,  530742520);
      b = md5hh(b, c, d, a, x[i+2],   23, -995338651);

      a = md5ii(a, b, c, d, x[i],      6, -198630844);
      d = md5ii(d, a, b, c, x[i+7],   10,  1126891415);
      c = md5ii(c, d, a, b, x[i+14],  15, -1416354905);
      b = md5ii(b, c, d, a, x[i+5],   21, -57434055);
      a = md5ii(a, b, c, d, x[i+12],   6,  1700485571);
      d = md5ii(d, a, b, c, x[i+3],   10, -1894986606);
      c = md5ii(c, d, a, b, x[i+10],  15, -1051523);
      b = md5ii(b, c, d, a, x[i+1],   21, -2054922799);
      a = md5ii(a, b, c, d, x[i+8],    6,  1873313359);
      d = md5ii(d, a, b, c, x[i+15],  10, -30611744);
      c = md5ii(c, d, a, b, x[i+6],   15, -1560198380);
      b = md5ii(b, c, d, a, x[i+13],  21,  1309151649);
      a = md5ii(a, b, c, d, x[i+4],    6, -145523070);
      d = md5ii(d, a, b, c, x[i+11],  10, -1120210379);
      c = md5ii(c, d, a, b, x[i+2],   15,  718787259);
      b = md5ii(b, c, d, a, x[i+9],   21, -343485551);

      a = safeAdd(a, olda);
      b = safeAdd(b, oldb);
      c = safeAdd(c, oldc);
      d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }

  function binl2rstr(input) {
    let output = '';
    for (let i = 0; i < input.length * 32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF);
    }
    return output;
  }

  function rstr2binl(input) {
    const output = [];
    for (let i = 0; i < input.length * 8; i += 32) { output[i >> 5] = 0; }
    for (let i = 0; i < input.length * 8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32);
    }
    return output;
  }

  function rstrMD5(s) {
    return binlMD5(rstr2binl(s), s.length * 8);
  }

  function rstr2hex(input) {
    const hexTab = '0123456789abcdef';
    let output = '';
    for (let i = 0; i < input.length * 32; i += 8) {
      const x = (input[i >> 5] >>> (i % 32)) & 0xFF;
      output += hexTab.charAt((x >>> 4) & 0x0F) + hexTab.charAt(x & 0x0F);
    }
    return output;
  }

  // Конвертируем Uint8Array → строку
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }

  return rstr2hex(rstrMD5(str)).toUpperCase();
}

// ─── Вспомогательная: склеить Uint8Array ──────────────────────────────

function concatUint8Array(...arrays) {
  let totalLength = 0;
  for (const a of arrays) totalLength += a.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// ОПТИМИЗАЦИЯ ПУТИ РЕЗА (Nearest-Neighbor TSP)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Оптимизирует порядок обхода деталей на листе для минимизации
 * холостых перемещений лазера.
 *
 * Алгоритм: Nearest-Neighbor TSP
 *   1. Для каждого размещения вычисляем "точку врезки" (pierce point) —
 *      где лазер начнёт резать эту деталь
 *   2. Для каждого размещения вычисляем "точку выхода" (lead-out) —
 *      где лазер закончит резать эту деталь
 *   3. Начинаем с размещения, ближайшего к началу координат листа (0,0)
 *   4. Каждое следующее размещение — ближайшее к точке выхода предыдущего
 *
 * Важно: порядок контуров ВНУТРИ детали не меняется
 * (отверстия режутся раньше внешнего контура — это уже задано OutlineID).
 * Меняется только порядок деталей на листе.
 *
 * @param {Array} placements — массив размещений на листе
 * @param {number} sheetW — ширина листа (для отзеркаливания по X)
 * @param {number} sheetH — высота листа (для отзеркаливания по Y)
 * @returns {Array} — переупорядоченный массив размещений
 */
function optimizeSheetPathOrder(placements, sheetW, sheetH) {
  if (!placements || placements.length <= 1) {
    return placements;
  }

  // ── Шаг 1: Вычисляем pierce/lead-out точки для каждого размещения ──
  // Система координат CypCut: (0,0) — НИЖНИЙ ЛЕВЫЙ угол (Y-up, как DXF)
  //   posX_CypCut = nested.x - refPointOffsetX   (без зеркала X)
  //   posY_CypCut = sheetH - nested.y - aabbH     (инверсия Y)
  const info = placements.map((pl, idx) => {
    const nested = pl.nested;
    const block = pl.blockEntry;
    const posX = nested.x ?? 0;
    const posY = nested.y ?? 0;
    const aabbW = block.aabbW || block.baseWidth || 0;
    const aabbH = block.aabbH || block.baseHeight || 0;
    const refOffsetX = block.refPointOffsetX || 0;

    // InsertPoint в системе координат CypCut (как в DXF: без зеркала X, инверсия Y)
    const insX = posX - refOffsetX;
    const insY = sheetH - posY - aabbH;

    // Pierce point: InsertPoint + первая вершина первого контура
    // (первый контур = первое отверстие, так как мы переупорядочили
    //  контуры так, что внешний контур — последний)
    let pierceX = insX, pierceY = insY;
    let leadOutX = insX, leadOutY = insY;

    const shapes = block.shapes || [];
    if (shapes.length > 0) {
      // Первый контур (отверстие) — pierce point
      const firstShape = shapes[0];
      if (firstShape.vertices && firstShape.vertices.length > 0) {
        const v0 = firstShape.vertices[0];
        pierceX = insX + v0.x;
        pierceY = insY + v0.y;
      }
      // Последний контур (внешний) — lead-out point
      // Для замкнутого контура последняя точка реза ≈ первая точка
      const lastShape = shapes[shapes.length - 1];
      if (lastShape.vertices && lastShape.vertices.length > 0) {
        const vN = lastShape.vertices[0];
        leadOutX = insX + vN.x;
        leadOutY = insY + vN.y;
      }
    }

    return {
      placement: pl,
      originalIdx: idx,
      pierce: { x: pierceX, y: pierceY },
      leadOut: { x: leadOutX, y: leadOutY },
    };
  });

  // ── Шаг 2: Nearest-Neighbor ──
  // Начинаем с размещения, ближайшего к началу координат (0,0) листа
  // (CypCut обычно начинает рез с HomeRef = (0,0))
  const used = new Array(info.length).fill(false);
  const ordered = [];

  let bestStartDist = Infinity;
  let currentIdx = 0;
  for (let i = 0; i < info.length; i++) {
    const d = Math.hypot(info[i].pierce.x, info[i].pierce.y);
    if (d < bestStartDist) {
      bestStartDist = d;
      currentIdx = i;
    }
  }

  ordered.push(info[currentIdx]);
  used[currentIdx] = true;
  let prevEnd = info[currentIdx].leadOut;

  for (let n = 1; n < info.length; n++) {
    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < info.length; i++) {
      if (used[i]) continue;
      const dx = info[i].pierce.x - prevEnd.x;
      const dy = info[i].pierce.y - prevEnd.y;
      const d = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      ordered.push(info[bestIdx]);
      used[bestIdx] = true;
      prevEnd = info[bestIdx].leadOut;
    }
  }

  // ── Шаг 3: Логирование результата ──
  const originalOrder = info.map(p => p.originalIdx);
  const newOrder = ordered.map(p => p.originalIdx);

  // Вычисляем длину пути до и после оптимизации
  let originalDist = 0;
  let prevX = 0, prevY = 0;
  for (const p of info) {
    originalDist += Math.hypot(p.pierce.x - prevX, p.pierce.y - prevY);
    prevX = p.leadOut.x;
    prevY = p.leadOut.y;
  }

  let optimizedDist = 0;
  prevX = 0; prevY = 0;
  for (const p of ordered) {
    optimizedDist += Math.hypot(p.pierce.x - prevX, p.pierce.y - prevY);
    prevX = p.leadOut.x;
    prevY = p.leadOut.y;
  }

  const saved = originalDist - optimizedDist;
  const savedPct = originalDist > 0 ? (saved / originalDist * 100) : 0;

  console.log(`🗺️ [PATH] Оптимизация порядка деталей на листе:`);
  console.log(`🗺️ [PATH]   Было: [${originalOrder.join(', ')}] → Стало: [${newOrder.join(', ')}]`);
  console.log(`🗺️ [PATH]   Путь: ${originalDist.toFixed(0)}мм → ${optimizedDist.toFixed(0)}мм (экономия ${saved.toFixed(0)}мм, ${savedPct.toFixed(1)}%)`);

  return ordered.map(p => p.placement);
}

// ═══════════════════════════════════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ ЭКСПОРТА
// ═══════════════════════════════════════════════════════════════════════

/**
 * Экспорт раскроя в формат CPS2 (CypCut).
 *
 * @param {Object} options — параметры экспорта
 * @returns {Promise<Blob>} — Blob с содержимым .cps2 файла
 */
async function exportCPS2(options) {
  const JSZipLib = window.JSZip;
  if (!JSZipLib) {
    alert('❌ JSZip не загружен');
    throw new Error('JSZip not loaded');
  }

  let {
    defaultChannel = 1,
    sheetSize,
    parts = [],
    nestedParts,       // Старый формат: один лист
    sheets,            // Новый формат: массив листов
    channels,
  } = options;

  // ── Нормализация: приводим к единому формату sheets[] ──────────────
  let sheetsData;
  if (sheets && Array.isArray(sheets) && sheets.length > 0) {
    sheetsData = sheets;
  } else if (nestedParts && nestedParts.length > 0) {
    sheetsData = [{ nestedParts, sheetSize: sheetSize || { width: 3000, height: 1500 } }];
  } else {
    throw new Error('Нет данных для экспорта');
  }

  // ══════════════════════════════════════════════════════════════════
  // ОБЪЕДИНЕНИЕ СОПРИКАСАЮЩИХСЯ ДЕТАЛЕЙ (spacing=0)
  // ══════════════════════════════════════════════════════════════════
  // Детали с spacing=0, физически соприкасающиеся на листе, объединяются
  // в одну виртуальную деталь → один Block + одна врезка лазера на группу.
  // Без этого лазер режет общие рёбра дважды и делает лишние врезки.
  if (typeof window.mergeTouchingPartsForExport === 'function') {
    const extraMergedParts = [];
    for (const sheet of sheetsData) {
      if (!sheet.nestedParts || sheet.nestedParts.length === 0) continue;
      const mergeRes = window.mergeTouchingPartsForExport(
        sheet.nestedParts,
        parts,
        sheet.sheetSize || { width: 3000, height: 1500 }
      );
      if (mergeRes.mergedParts.length > 0) {
        sheet.nestedParts = mergeRes.nestedParts;
        extraMergedParts.push(...mergeRes.mergedParts);
      }
    }
    if (extraMergedParts.length > 0) {
      parts = [...parts, ...extraMergedParts];
      console.log(`🔗 [TOUCH-MERGE] Добавлено виртуальных деталей в parts: ${extraMergedParts.length}`);
    }
  } else {
    console.warn('⚠️ [TOUCH-MERGE] mergeTouchingPartsForExport не загружен — объединение соприкасающихся деталей пропущено');
  }

  // ══════════════════════════════════════════════════════════════════
  // АРХИТЕКТУРА: Block + Insert (как в реальных файлах CypCut)
  //
  // - Block = определение геометрии детали (original coordinates)
  // - Insert = размещение блока на листе (position + rotation)
  // - NestPlate = контур листа
  // - NestResult = результат раскладки на одном листе
  // ══════════════════════════════════════════════════════════════════

  let nextHandle = 1001;

  // ══════════════════════════════════════════════════════════════════
  // АРХИТЕКТУРА v2: Block + Insert с разделением по (partId, angle)
  //
  // - Создаём ОДИН Block на уникальную комбинацию (partId, angle)
  // - Все размещения одной детали под одним углом делят один Block
  // - Это уменьшает количество фигур с N×M до M (как в реальных файлах CypCut)
  // - Insert ссылается на Block по имени, позиция через InsertPoint
  // ══════════════════════════════════════════════════════════════════

  const blockEntries = [];        // [{handle, name, basePoint, shapesHandle, shapes, layerNames}]
  const allProcessedShapes = [];  // Все фигуры (из блоков + контуры листов)

  // Маппинг: sheetIndex → [{nestedPart, blockEntry, insertHandle}]
  const sheetPlacements = sheetsData.map(() => []);

  // Кэш блоков: ключ = "partId_angleKey" → blockEntry
  const blockCache = new Map();

  // Собираем уникальные имена блоков
  const usedBlockNames = new Set();
  function uniqueBlockName(base) {
    let name = base.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!usedBlockNames.has(name)) { usedBlockNames.add(name); return name; }
    let i = 1;
    while (usedBlockNames.has(name + '_' + i)) i++;
    const result = name + '_' + i;
    usedBlockNames.add(result);
    return result;
  }

  for (let si = 0; si < sheetsData.length; si++) {
    const sheet = sheetsData[si];
    const sheetNP = sheet.nestedParts || [];

    for (const nested of sheetNP) {
      // Поиск детали: поддерживает как числовые ID (обычные детали),
      // так и строковые ID (виртуальные объединённые детали __merged_N__)
      const part = parts.find(p => {
        if (String(p.id) === String(nested.partId)) return true;
        const pn = Number(p.id), nn = Number(nested.partId);
        return !isNaN(pn) && !isNaN(nn) && pn === nn;
      });
      if (!part || !part.objects || part.objects.length === 0) continue;

      const angleRad = nested.angle ?? 0;
      // Ключ кэша: partId + угол (с округлением для избежания проблем с float)
      const angleKey = Math.round(angleRad * 10000) / 10000;
      const cacheKey = String(part.id) + '_' + angleKey;

      // Проверяем кэш — если блок для этой детали+угол уже создан, переиспользуем
      if (blockCache.has(cacheKey)) {
        const existingEntry = blockCache.get(cacheKey);
        const insertHandle = nextHandle++;
        sheetPlacements[si].push({ nested, blockEntry: existingEntry, insertHandle, part });
        console.log(`📤 [CPS2] Деталь "${part.name}" angle=${(angleRad*180/Math.PI).toFixed(1)}°: переиспользуем блок "${existingEntry.name}"`);
        continue;
      }

      const blockHandle = nextHandle++;
      const shapesHandle = nextHandle++;
      const blockShapes = [];
      const layerNames = [];

      // ── Сшиваем примитивы детали в замкнутые контуры (LwPolyline) ──
      // Вместо экспорта каждого примитива отдельно (линия, дуга, круг),
      // объединяем их в непрерывные контуры → одна врезка лазера на контур
      const mergerAvailable = typeof mergeObjectsToContours === 'function';
      console.log(`📤 [CPS2] Деталь "${part.name}": merger=${mergerAvailable}, objects=${part.objects.length}`);
      const contours = mergerAvailable
        ? mergeObjectsToContours(part.objects, colorToColorIndex, defaultChannel)
        : fallbackProcessShapes(part.objects, nextHandle, defaultChannel);

      console.log(`📤 [CPS2] Деталь "${part.name}": contours=${contours.length}`, contours.map(c => `${c.closed?'Z':'O'}(${c.vertices.length}v) ${c.layerName} ci=${c.colorIndex}`));

      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      for (const contour of contours) {
        const shape = {
          handle: nextHandle,
          className: 'LwPolyline',
          colorIndex: contour.colorIndex,
          closed: contour.closed,
          vertices: contour.vertices,
          bulges: contour.vertices.map(() => 0),
        };

        for (const v of shape.vertices) {
          if (v.x < minX) minX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.x > maxX) maxX = v.x;
          if (v.y > maxY) maxY = v.y;
        }

        blockShapes.push(shape);
        layerNames.push(contour.layerName || '0');
        nextHandle++;
      }

      if (minX === Infinity) minX = 0;
      if (minY === Infinity) minY = 0;
      if (maxX === -Infinity) maxX = 0;
      if (maxY === -Infinity) maxY = 0;

      // v4.57: Используем part.bounds для нормализации и вращения
      // (как делает nesting engine). Раньше использовали пересчитанные
      // minX/minY/maxX/maxY из contour vertices. Для сплайнов это давало
      // СМЕЩЕНИЕ: part.bounds (из controlPoints) ≠ contour bounds (из fitPoints).
      // nesting engine использует part.bounds → CPS2 должен использовать тот же.
      const pb = part.bounds;
      const normMinX = (pb && typeof pb.minX === 'number') ? pb.minX : minX;
      const normMinY = (pb && typeof pb.minY === 'number') ? pb.minY : minY;
      const origBW = (pb && typeof pb.width === 'number') ? pb.width : (maxX - minX);
      const origBH = (pb && typeof pb.height === 'number') ? pb.height : (maxY - minY);

      if (pb) {
        console.log(`📤 [CPS2] bounds: part.bounds=(${pb.minX?.toFixed(1)},${pb.minY?.toFixed(1)},${pb.width?.toFixed(1)}x${pb.height?.toFixed(1)}) contour=(${minX.toFixed(1)},${minY.toFixed(1)},${(maxX-minX).toFixed(1)}x${(maxY-minY).toFixed(1)}) — используем part.bounds`);
      }

      // ── Трансформация геометрии блока ──────────────────────────
      // Проблема: canvas использует Y-down, CypCut — Y-up.
      // Для прямоугольников это не важно (симметрия), но для деталей
      // с арками геометрия отображается перевёрнутой.
      //
      // Решение: пред-вращение + Y-отражение:
      // 1. Нормализуем вершины к (0,0)
      // 2. Вращаем вокруг центра (bw/2, bh/2) на nested.angle — как на canvas
      // 3. Сдвигаем чтобы AABB начинался с (0,0)
      // 4. Y-отражение: vy → aabbH - vy (canvas Y-down → CypCut Y-up)
      // 5. В Insert: Rotation=0 (геометрия уже повёрнута)

      // Шаг 1: нормализация вершин (v4.57: используем part.bounds.minX/minY)
      if (normMinX !== 0 || normMinY !== 0) {
        for (const shape of blockShapes) {
          for (const v of shape.vertices) {
            v.x -= normMinX;
            v.y -= normMinY;
          }
          if (shape.cx !== undefined) {
            shape.cx -= normMinX;
            shape.cy -= normMinY;
          }
        }
      }

      // Шаг 2: пред-вращение вокруг центра (bw/2, bh/2)
      if (Math.abs(angleRad) > 0.001) {
        const cx = origBW / 2;
        const cy = origBH / 2;
        const cosA = Math.cos(angleRad);
        const sinA = Math.sin(angleRad);
        for (const shape of blockShapes) {
          for (const v of shape.vertices) {
            const dx = v.x - cx;
            const dy = v.y - cy;
            v.x = cx + dx * cosA - dy * sinA;
            v.y = cy + dx * sinA + dy * cosA;
          }
        }
      }

      // Шаг 3: вычисляем AABB пред-повёрнутых вершин и сдвигаем к (0,0)
      let rotMinX = Infinity, rotMinY = Infinity;
      let rotMaxX = -Infinity, rotMaxY = -Infinity;
      for (const shape of blockShapes) {
        for (const v of shape.vertices) {
          if (v.x < rotMinX) rotMinX = v.x;
          if (v.y < rotMinY) rotMinY = v.y;
          if (v.x > rotMaxX) rotMaxX = v.x;
          if (v.y > rotMaxY) rotMaxY = v.y;
        }
      }
      if (rotMinX === Infinity) rotMinX = 0;
      if (rotMinY === Infinity) rotMinY = 0;
      if (rotMaxX === -Infinity) rotMaxX = 0;
      if (rotMaxY === -Infinity) rotMaxY = 0;

      const aabbW = rotMaxX - rotMinX;
      const aabbH = rotMaxY - rotMinY;

      // ── Вычисляем refPoint и смещение (как в svg-export.js / nesting.js) ──
      // refPoint = точка с наименьшей Y (потом наименьшей X) в повёрнутом bbox.
      // Это НЕ угол AABB! Это特定енный угол повёрнутого hull.
      // nested.x/y — это позиция refPoint на canvas (не AABB corner).
      // offsetX = смещение refPoint от левого края AABB (в повёрнутых canvas-координатах).
      //
      // Для 0° вращения: refPoint = верхний-левый угол AABB → offsetX = 0.
      // Для 90°/180°/270° вращения: refPoint может быть в другом углу → offsetX ≠ 0.
      //
      // ВАЖНО: вращаем 4 угла ИСХОДНОГО bbox (nested.baseWidth × nested.baseHeight)
      // вокруг центра (baseWidth/2, baseHeight/2). Это ДРУГОЙ центр, чем у
      // повёрнутой геометрии (origBW/2, origBH/2). Используем именно его,
      // чтобы совпасть с svg-export.js / nesting.js.
      //
      // Если nested.refPoint уже сохранён nesting-ом — используем его.
      let refPointOffsetX = 0;
      let refPointOffsetY = 0;

      if (nested.refPoint && typeof nested.refPoint.x === 'number') {
        // refPoint из nesting.js (правильный, без float-погрешности)
        // offsetX = refPoint.x - rotMinX (относительно повёрнутого AABB)
        refPointOffsetX = nested.refPoint.x - rotMinX;
        refPointOffsetY = nested.refPoint.y - rotMinY;
      } else {
        // Вычисляем refPoint сами — вращаем 4 угла ИСХОДНОГО bbox
        // (nested.baseWidth × nested.baseHeight) вокруг центра исходной детали.
        const baseWidth = nested.baseWidth || origBW;
        const baseHeight = nested.baseHeight || origBH;
        const cxB = baseWidth / 2;
        const cyB = baseHeight / 2;
        const cosB = Math.cos(angleRad);
        const sinB = Math.sin(angleRad);
        const baseCorners = [
          { x: 0, y: 0 },
          { x: baseWidth, y: 0 },
          { x: baseWidth, y: baseHeight },
          { x: 0, y: baseHeight },
        ];
        const rotatedCorners = baseCorners.map(p => ({
          x: cxB + (p.x - cxB) * cosB - (p.y - cyB) * sinB,
          y: cyB + (p.x - cxB) * sinB + (p.y - cyB) * cosB,
        }));
        // refPoint = smallest Y, then smallest X (с учётом float-погрешности!)
        // Для углов кратных 90° float-погрешность может дать неправильный
        // результат (особенно для 180°), поэтому используем допуск.
        const TOL = 0.01;
        let refPointRotated = rotatedCorners[0];
        for (const p of rotatedCorners) {
          const yDiff = p.y - refPointRotated.y;
          if (yDiff < -TOL) {
            // p.y строго меньше — берём p
            refPointRotated = p;
          } else if (Math.abs(yDiff) <= TOL) {
            // Y почти равны — берём меньший X
            if (p.x < refPointRotated.x - TOL) {
              refPointRotated = p;
            }
          }
        }
        // После нормализации (вычитания rotMinX, rotMinY) — получаем смещение
        // refPoint от левого верхнего угла AABB в canvas координатах.
        refPointOffsetX = refPointRotated.x - rotMinX;
        refPointOffsetY = refPointRotated.y - rotMinY;
      }

      if (Math.abs(angleRad) > 0.001) {
        console.log(`📤 [CPS2] refPoint для угла ${(angleRad * 180 / Math.PI).toFixed(1)}°: offset=(${refPointOffsetX.toFixed(2)}, ${refPointOffsetY.toFixed(2)}) aabb=(${aabbW.toFixed(1)}×${aabbH.toFixed(1)}) baseW=${nested.baseWidth || '?'} baseH=${nested.baseHeight || '?'}${nested.refPoint ? ' [из nested.refPoint]' : ' [вычислен]'}`);
      }

      if (rotMinX !== 0 || rotMinY !== 0) {
        for (const shape of blockShapes) {
          for (const v of shape.vertices) {
            v.x -= rotMinX;
            v.y -= rotMinY;
          }
        }
      }

      // Шаг 4: Y-отражение — canvas Y-down → CypCut Y-up
      // В canvas (0,0) — верхний левый угол, в CypCut (0,0) — нижний левый.
      // Без отражения арки отображаются перевёрнутыми по вертикали.
      for (const shape of blockShapes) {
        for (const v of shape.vertices) {
          v.y = aabbH - v.y;
        }
      }

      // ── Определяем OutlineID и переупорядочиваем контуры ──────────
      // Разделяем все замкнутые контуры на 2 группы:
      //   - ОТВЕРСТИЯ: контуры, bbox которых полностью содержится в bbox
      //     какого-то другого замкнутого контура
      //   - ВНЕШНИЕ: контуры, не содержащиеся ни в каком другом
      //
      // Два режима упорядочивания:
      //   1) ОДИНОЧНАЯ деталь (1 внешний контур): все отверстия → внешний
      //      (лазер сначала делает отверстия, потом вырезает внешний контур)
      //   2) CO-EDGE ГРУППА (несколько внешних контуров): парный порядок
      //      отверстие_1, контур_1, отверстие_2, контур_2, ...
      //      (лазер делает отверстия и вырезает контур каждой детали
      //       последовательно; co-edge оптимизация CypCut убирает
      //       дублирующиеся общие рёбра)
      //
      // OutlineID: только если есть ровно ОДИН внешний контур (одиночная деталь).
      // Для co-edge групп — НЕ указываем, как в реальных файлах CypCut.
      const isCoEdgeGroup = Boolean(nested._isCoEdgeGroup);

      const shapeBBoxes = blockShapes.map(shape => {
        if (!shape.closed) return null;
        let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
        for (const v of shape.vertices) {
          if (v.x < sMinX) sMinX = v.x;
          if (v.y < sMinY) sMinY = v.y;
          if (v.x > sMaxX) sMaxX = v.x;
          if (v.y > sMaxY) sMaxY = v.y;
        }
        return { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY };
      });

      // Для каждого контура проверяем, есть ли другой контур, который его содержит
      const isHole = new Array(blockShapes.length).fill(false);
      for (let i = 0; i < blockShapes.length; i++) {
        const aBBox = shapeBBoxes[i];
        if (!aBBox) continue;
        for (let j = 0; j < blockShapes.length; j++) {
          if (i === j) continue;
          const bBBox = shapeBBoxes[j];
          if (!bBBox) continue;
          const aW = aBBox.maxX - aBBox.minX;
          const aH = aBBox.maxY - aBBox.minY;
          const bW = bBBox.maxX - bBBox.minX;
          const bH = bBBox.maxY - bBBox.minY;
          if (bBBox.minX <= aBBox.minX + 0.01 &&
              bBBox.maxX >= aBBox.maxX - 0.01 &&
              bBBox.minY <= aBBox.minY + 0.01 &&
              bBBox.maxY >= aBBox.maxY - 0.01 &&
              (bW > aW + 0.01 || bH > aH + 0.01)) {
            isHole[i] = true;
            break;
          }
        }
      }

      // Разделяем на отверстия и внешние (с сохранением исходного порядка)
      const holes = [];
      const outlines = [];
      const unclosed = []; // незамкнутые (например, линия гиба)
      for (let i = 0; i < blockShapes.length; i++) {
        if (isHole[i]) {
          holes.push({ shape: blockShapes[i], layer: layerNames[i], bbox: shapeBBoxes[i] });
        } else if (blockShapes[i].closed) {
          outlines.push({ shape: blockShapes[i], layer: layerNames[i], bbox: shapeBBoxes[i] });
        } else {
          unclosed.push({ shape: blockShapes[i], layer: layerNames[i], bbox: shapeBBoxes[i] });
        }
      }

      const holeCount = holes.length;
      const outlineCount = outlines.length;
      console.log(`📤 [CPS2] Контурный анализ: ${blockShapes.length} фигур → ${holeCount} отверстий, ${outlineCount} внешних контуров${isCoEdgeGroup ? ' (CO-EDGE ГРУППА)' : ''}`);

      // Переупорядочиваем контуры
      const newBlockShapes = [];
      const newLayerNames = [];

      if (isCoEdgeGroup && outlineCount > 1) {
        // CO-EDGE режим: парный порядок — для каждой детали (внешний контур)
        // сначала её отверстия, потом сам внешний контур.
        // Отверстия привязываем к внешнему контуру по bbox-вложенности.
        const usedHoles = new Set();
        for (const outline of outlines) {
          // Находим все отверстия, вложенные в этот внешний контур
          for (let hi = 0; hi < holes.length; hi++) {
            if (usedHoles.has(hi)) continue;
            const h = holes[hi];
            if (!h.bbox || !outline.bbox) continue;
            // Проверяем, что отверстие внутри внешнего контура
            if (h.bbox.minX >= outline.bbox.minX - 0.01 &&
                h.bbox.maxX <= outline.bbox.maxX + 0.01 &&
                h.bbox.minY >= outline.bbox.minY - 0.01 &&
                h.bbox.maxY <= outline.bbox.maxY + 0.01) {
              newBlockShapes.push(h.shape);
              newLayerNames.push(h.layer);
              usedHoles.add(hi);
            }
          }
          // Сам внешний контур — после его отверстий
          newBlockShapes.push(outline.shape);
          newLayerNames.push(outline.layer);
        }
        // Незамкнутые контуры — в конец
        for (const u of unclosed) {
          newBlockShapes.push(u.shape);
          newLayerNames.push(u.layer);
        }
        console.log(`📤 [CPS2] CO-EDGE порядок: парный (отверстие→контур) для ${outlineCount} деталей`);
      } else {
        // Одиночная деталь: все отверстия → все внешние → незамкнутые
        for (const h of holes) {
          newBlockShapes.push(h.shape);
          newLayerNames.push(h.layer);
        }
        for (const o of outlines) {
          newBlockShapes.push(o.shape);
          newLayerNames.push(o.layer);
        }
        for (const u of unclosed) {
          newBlockShapes.push(u.shape);
          newLayerNames.push(u.layer);
        }
      }
      blockShapes.length = 0;
      blockShapes.push(...newBlockShapes);
      layerNames.length = 0;
      layerNames.push(...newLayerNames);

      // OutlineID: только если есть ровно один внешний контур (одиночная деталь)
      let outlineId = 0;
      if (outlineCount === 1) {
        outlineId = outlines[0].shape.handle;
        console.log(`📤 [CPS2] OutlineID=${outlineId} (одиночная деталь)`);
      } else if (outlineCount > 1) {
        console.log(`📤 [CPS2] OutlineID не указан (co-edge группа из ${outlineCount} внешних контуров)`);
      } else if (blockShapes.length > 0) {
        outlineId = blockShapes[0].handle;
      }

      // ── CO-EDGE: создаём ДВА блока (Part1 + CommonPart) ──────────
      // Структура как в оригинальных файлах CypCut:
      //   Part1 (одиночная деталь, с OutlineID) — для NestPart
      //   CommonPart (объединённая геометрия, БЕЗ OutlineID) — для Insert
      //
      // Для НЕ-co-edge деталей (одиночных) — один блок как обычно.
      if (isCoEdgeGroup) {
        // ── Part1: определение одиночной детали ──
        // Part1 содержит контуры ОДНОЙ детали (первые shapesPerPart из blockShapes).
        // Используем ПЕРВЫЕ N контуров, где N = всего_контуров / кол-во_деталей.
        const shapesPerPart = Math.floor(blockShapes.length / (nested._groupSize || 1));
        const part1Shapes = blockShapes.slice(0, shapesPerPart);
        const part1LayerNames = layerNames.slice(0, shapesPerPart);
        // OutlineID для Part1 = последний контур (внешний) в первой детали
        const part1OutlineId = part1Shapes.length > 0
          ? part1Shapes[part1Shapes.length - 1].handle
          : 0;

        const part1BlockName = uniqueBlockName(part.name || 'Part' + part.id);
        const part1Entry = {
          handle: blockHandle,
          name: part1BlockName,
          basePoint: { x: 0, y: 0 },
          shapesHandle,
          shapes: part1Shapes,
          layerNames: part1LayerNames,
          partId: part.id,
          partName: part.name || 'Part' + part.id,
          baseWidth: aabbW,
          baseHeight: aabbH,
          preRotated: true,
          aabbW,
          aabbH,
          outlineId: part1OutlineId,
          isCoEdgePart1: true, // определение одиночной детали для NestPart
          coEdgePartCount: nested._groupSize || 1,
          refPointOffsetX, // смещение refPoint от AABB left (для правильного позиционирования)
        };
        blockEntries.push(part1Entry);
        allProcessedShapes.push(...part1Shapes);
        console.log(`📤 [CPS2] Создан Part1 блок "${part1BlockName}" (${part1Shapes.length} контуров, OutlineID=${part1OutlineId})`);

        // ── CommonPart: объединённая геометрия всех деталей группы ──
        // БЕЗ OutlineID. Содержит ВСЕ контуры всех деталей группы.
        const commonHandle = nextHandle++;
        const commonShapesHandle = nextHandle++;
        const commonBlockName = 'CommonPart_' + (part.id || '0');

        // CommonPart использует ОСТАЛЬНЫЕ контуры (начиная с shapesPerPart),
        // потому что первые shapesPerPart уже в Part1
        // НЕТ! На самом деле CommonPart должен содержать ВСЕ контуры всех деталей,
        // включая первую. Иначе CypCut не увидит геометрию первой детали.
        // Part1 — это только справочное определение для NestPart, CommonPart — реальная геометрия.
        const commonEntry = {
          handle: commonHandle,
          name: commonBlockName,
          basePoint: { x: 0, y: 0 },
          shapesHandle: commonShapesHandle,
          shapes: blockShapes.slice(),  // ВСЕ контуры (копия массива)
          layerNames: layerNames.slice(),
          partId: part.id,
          partName: part.name || 'Part' + part.id,
          baseWidth: aabbW,
          baseHeight: aabbH,
          preRotated: true,
          aabbW,
          aabbH,
          outlineId: 0,  // БЕЗ OutlineID для CommonPart!
          isCoEdgeCommonPart: true, // объединённый блок для Insert
          coEdgePartCount: nested._groupSize || 1,
          refPointOffsetX, // смещение refPoint от AABB left
        };
        blockEntries.push(commonEntry);
        allProcessedShapes.push(...commonEntry.shapes);
        console.log(`📤 [CPS2] Создан CommonPart блок "${commonBlockName}" (${commonEntry.shapes.length} контуров, БЕЗ OutlineID) для Insert`);

        blockCache.set(cacheKey, commonEntry);

        const insertHandle = nextHandle++;
        // Insert ссылается на CommonPart (НЕ на Part1!)
        sheetPlacements[si].push({
          nested,
          blockEntry: commonEntry,
          insertHandle,
          part,
        });

      } else {
        // ── Обычная деталь (не co-edge) — один блок как раньше ──
        const blockName = uniqueBlockName(part.name || 'Part' + part.id);

        const entry = {
          handle: blockHandle,
          name: blockName,
          basePoint: { x: 0, y: 0 },
          shapesHandle,
          shapes: blockShapes,
          layerNames,
          partId: part.id,
          partName: part.name || 'Part' + part.id,
          baseWidth: aabbW,
          baseHeight: aabbH,
          preRotated: true,
          aabbW,
          aabbH,
          outlineId,
          isCoEdgeGroup: false,
          refPointOffsetX, // смещение refPoint от AABB left
        };

        blockEntries.push(entry);
        allProcessedShapes.push(...blockShapes);
        blockCache.set(cacheKey, entry);

        const insertHandle = nextHandle++;
        sheetPlacements[si].push({ nested, blockEntry: entry, insertHandle, part });
      }
    }
  }

  console.log(`📤 [CPS2] Блоков создано: ${blockEntries.length}, размещений: ${sheetPlacements.flat().length}`);

  // ── 1b. NestPlate — контур листа ─────────────────────────────────
  // v4.60: Если useRemnant=true и есть outerContour — используем контур остатка
  // вместо прямоугольного листа
  const _remnantRef = (typeof sheetRemnant !== 'undefined') ? sheetRemnant
    : (typeof self !== 'undefined' ? self.sheetRemnant : null)
    || (typeof window !== 'undefined' ? window.sheetRemnant : null);
  const _useRemnantFlag = (typeof useRemnant !== 'undefined') ? useRemnant
    : (typeof self !== 'undefined' ? self.useRemnant : undefined)
    || (typeof window !== 'undefined' ? window.useRemnant : false);

  const hasRemnant = _useRemnantFlag && _remnantRef?.outerContour?.length > 0;

  // v4.60: Конвертирует объекты контура остатка в вершины полилинии (Y-инверсия для CypCut)
  function _remnantToVertices(contourObjects, sheetH) {
    const vertices = [];
    const bulges = [];
    for (const obj of contourObjects) {
      if (!obj) continue;
      if (obj.type === 'line') {
        vertices.push({ x: obj.x1 ?? 0, y: sheetH - (obj.y1 ?? 0) });
        bulges.push(0);
      } else if (obj.type === 'rect') {
        const x = obj.x ?? 0, y = obj.y ?? 0, w = obj.width ?? 0, h = obj.height ?? 0;
        vertices.push({ x, y: sheetH - y });
        vertices.push({ x: x + w, y: sheetH - y });
        vertices.push({ x: x + w, y: sheetH - (y + h) });
        vertices.push({ x, y: sheetH - (y + h) });
        bulges.push(0, 0, 0, 0);
      } else if (obj.type === 'circle') {
        // Аппроксимируем круг 36 точками
        const cx = obj.cx ?? 0, cy = sheetH - (obj.cy ?? 0), r = Math.abs(obj.radius ?? 0);
        if (r > 0) {
          for (let i = 0; i < 36; i++) {
            const a = (2 * Math.PI * i) / 36;
            vertices.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
            bulges.push(0);
          }
        }
      } else if (obj.type === 'arc') {
        // Аппроксимируем дугу точками
        const cx = obj.cx ?? 0, cy = sheetH - (obj.cy ?? 0), r = Math.abs(obj.radius ?? 0);
        if (r > 0 && typeof obj.startAngle === 'number' && typeof obj.endAngle === 'number') {
          let sweep;
          if (obj.direction === 'CW') { sweep = obj.startAngle - obj.endAngle; if (sweep < 0) sweep += 2 * Math.PI; }
          else { sweep = obj.endAngle - obj.startAngle; if (sweep < 0) sweep += 2 * Math.PI; }
          const segs = Math.max(8, Math.min(48, Math.ceil(sweep / (Math.PI / 24))));
          const dir = obj.direction === 'CW' ? -1 : 1;
          for (let i = 0; i <= segs; i++) {
            const a = obj.startAngle + dir * (sweep / segs) * i;
            // Y-инверсия угла: sin(-a) = -sin(a) → отражаем Y
            vertices.push({ x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r });
            bulges.push(0);
          }
        }
      } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        const pts = obj.points || obj.vertices || [];
        for (const p of pts) {
          if (p && typeof p.x === 'number') {
            vertices.push({ x: p.x, y: sheetH - p.y });
            bulges.push(0);
          }
        }
      }
    }
    // Убираем дублирующиеся последовательные точки
    const deduped = [];
    const dedupedBulges = [];
    for (let i = 0; i < vertices.length; i++) {
      if (i > 0) {
        const prev = deduped[deduped.length - 1];
        if (Math.abs(vertices[i].x - prev.x) < 0.01 && Math.abs(vertices[i].y - prev.y) < 0.01) continue;
      }
      deduped.push(vertices[i]);
      dedupedBulges.push(bulges[i]);
    }
    return { vertices: deduped, bulges: dedupedBulges };
  }

  const nestPlateHandle = nextHandle++;
  const nestPlatePolyHandle = nextHandle++;

  const plateW = sheetsData[0].sheetSize.width;
  const plateH = sheetsData[0].sheetSize.height;

  // v4.60: Контур листа — всегда прямоугольник (контур остатка отменён)
  const nestPlateVertices = [
    { x: 0, y: 0 },
    { x: plateW, y: 0 },
    { x: plateW, y: plateH },
    { x: 0, y: plateH },
  ];
  const nestPlateBulges = [0, 0, 0, 0];

  const nestPlateShape = {
    handle: nestPlatePolyHandle,
    className: 'LwPolyline',
    colorIndex: 0,
    closed: true,
    vertices: nestPlateVertices,
    bulges: nestPlateBulges,
  };
  allProcessedShapes.push(nestPlateShape);

  // ── 1c. Контур листа для каждого NestResult ──────────────────────
  const sheetContourHandles = [];
  for (let si = 0; si < sheetsData.length; si++) {
    const h = nextHandle++;
    sheetContourHandles.push(h);
    const sw = sheetsData[si].sheetSize.width;
    const sh = sheetsData[si].sheetSize.height;

    let sheetVertices = [
        { x: 0, y: 0 },
        { x: sw, y: 0 },
        { x: sw, y: sh },
        { x: 0, y: sh },
      ];
    let sheetBulges = [0, 0, 0, 0];

    allProcessedShapes.push({
      handle: h,
      className: 'LwPolyline',
      colorIndex: 0,
      closed: true,
      vertices: sheetVertices,
      bulges: sheetBulges,
    });
  }

  // ── 1d. NestPart — по одному на тип детали ───────────────────────
  // Для co-edge групп: NestPart ссылается на Part1 (одиночный блок),
  // Amount = кол-во деталей в группе.
  // Для обычных деталей: NestPart ссылается на блок детали, Amount = кол-во размещений.
  const nestPartMap = new Map();
  for (const entry of blockEntries) {
    // Пропускаем CommonPart блоки — для них NestPart не нужен
    // (NestPart ссылается на Part1, а Insert — на CommonPart)
    if (entry.isCoEdgeCommonPart) continue;

    const pid = String(entry.partId);
    if (!nestPartMap.has(pid)) {
      // Для co-edge Part1 — Amount = кол-во деталей в группе
      // Для обычных — Amount = 1 (увеличивается ниже для неск. размещений)
      const amount = entry.isCoEdgePart1
        ? (entry.coEdgePartCount || 1)
        : 1;
      nestPartMap.set(pid, {
        nestPartHandle: nextHandle++,
        insertHandle: nextHandle++,
        count: amount,
        partName: entry.partName,
        blockName: entry.name,  // Part1 для co-edge, обычный блок для одиночных
        basePoint: entry.basePoint,
      });
    } else {
      // Если уже есть — увеличиваем count (для не-co-edge деталей с неск. размещениями)
      if (!entry.isCoEdgePart1) {
        nestPartMap.get(pid).count++;
      }
    }
  }

  // ── 2. Формирование Shapes2D/data.bin ───────────────────────────
  const shapeRecords = [];
  for (const ps of allProcessedShapes) {
    let recordData;
    if (ps.className === 'Circle') {
      recordData = buildCircleShape(ps.handle, ps.colorIndex);
    } else {
      recordData = buildLwPolylineShape(ps.handle, ps.colorIndex);
    }
    shapeRecords.push({
      handle: ps.handle,
      className: ps.className,
      colorIndex: ps.colorIndex,
      data: recordData,
    });
  }

  const shapesDataSize = shapeRecords.reduce((sum, r) => sum + r.data.length, 0);
  const shapesHeader = createBCMPHeader(shapesDataSize);
  const shapesDataBin = concatUint8Array(shapesHeader, ...shapeRecords.map(r => r.data));

  const shapeDataAddrs = new Map();
  const shapeGeoAddrs = new Map();
  let currentDataAddr = BCMP_HEADER_SIZE;
  let currentGeoAddr = BCMP_HEADER_SIZE;

  for (const record of shapeRecords) {
    shapeDataAddrs.set(record.handle, currentDataAddr);
    currentDataAddr += record.data.length;
  }

  for (const ps of allProcessedShapes) {
    shapeGeoAddrs.set(ps.handle, currentGeoAddr);
    if (ps.className === 'Circle') {
      currentGeoAddr += 4 + GEO_CIRCLE_SIZE;
    } else {
      currentGeoAddr += GEO_HEADER_SIZE + ps.vertices.length * GEO_VERTEX_SIZE + GEO_FOOTER_SIZE;
    }
  }

  // ── 3. Формирование Geometry2D/data.bin ──────────────────────────
  const geoRecords = [];
  for (const ps of allProcessedShapes) {
    if (ps.className === 'Circle') {
      geoRecords.push(buildCircleGeo(ps.cx ?? 0, ps.cy ?? 0, ps.radius ?? 0));
    } else {
      geoRecords.push(buildLwPolylineGeo(ps.closed, ps.vertices, ps.bulges));
    }
  }

  const geoDataSize = geoRecords.reduce((sum, r) => sum + r.length, 0);
  const geoHeader = createBCMPHeader(geoDataSize);
  const geoDataBin = concatUint8Array(geoHeader, ...geoRecords);

  // ── 4. Формирование XML-файлов ──────────────────────────────────

  const now = new Date().toISOString();
  const docId = uuid();
  const nestResultIds = sheetsData.map(() => uuid());
  const activeModelId = nestResultIds[nestResultIds.length - 1];

  const infoXml = '<?xml version="1.0" encoding="utf-8"?>\n<PackData>\n\t<DocVersion Major="1"/>\n\t<Application AppName="CypCut" AppVer="6.3.801.6"/>\n\t<SavedBy User="User" UserLangID="1049" Computer="PC" SysLangID="1049" SaveTime="' + now + '"/>\n</PackData>';

  const contentXml = '<?xml version="1.0" encoding="utf-8"?>\n<PackData DocType="Model2D">\n\t<Header DefaultChannel="' + defaultChannel + '" HandleSeed="' + nextHandle + '" ID="{' + docId + '}" Version="419963393">\n\t\t<InsertBase/>\n\t</Header>\n\t<Technical Handle="2"/>\n\t<Viewports Handle="3"/>\n\t<Layers Handle="5"/>\n\t<TextStyles Handle="6"/>\n\t<Blocks Handle="4"/>\n\t<Portions Handle="12" ActiveModelID="{' + activeModelId + '}"/>\n</PackData>';

  // Blocks/content.xml
  // Для CommonPart (co-edge) — БЕЗ OutlineID и БЕЗ Flags (как в оригинале CypCut)
  // Для Part1 и обычных деталей — с OutlineID и Flags="512"
  // Для пустого BasePoint — пишем <BasePoint/> без атрибутов (как в оригинале)
  const blockXmlEntries = [];
  for (const entry of blockEntries) {
    const shapeEntries = entry.shapes.map(s =>
      '\t\t\t<Shape Class="' + s.className + '" Handle="' + s.handle + '"/>'
    ).join('\n');
    const outlineAttr = entry.outlineId ? ' OutlineID="' + entry.outlineId + '"' : '';
    const flagsAttr = entry.isCoEdgeCommonPart ? '' : ' Flags="512"';
    // BasePoint: если (0,0) — пустой тег, иначе с координатами
    const baseX = entry.basePoint.x;
    const baseY = entry.basePoint.y;
    const basePointTag = (baseX === 0 && baseY === 0)
      ? '\t\t<BasePoint/>'
      : '\t\t<BasePoint X="' + baseX + '" Y="' + baseY + '"/>';
    blockXmlEntries.push('\t<Block Handle="' + entry.handle + '" Name="' + entry.name + '"' + outlineAttr + flagsAttr + '>\n' + basePointTag + '\n\t\t<Shapes Handle="' + entry.shapesHandle + '">\n' + shapeEntries + '\n\t\t</Shapes>\n\t</Block>');
  }
  const blocksXml = '<?xml version="1.0" encoding="utf-8"?>\n<Blocks>\n' + blockXmlEntries.join('\n') + '\n</Blocks>';

  // Shapes2D/content.xml — с LayerName для фигур из блоков
  const shapesXmlEntries = [];
  for (const entry of blockEntries) {
    for (let i = 0; i < entry.shapes.length; i++) {
      const s = entry.shapes[i];
      const layerName = entry.layerNames[i] || '';
      const tag = s.className === 'Circle' ? 'Circle' : 'LwPolyline';
      const layerAttr = layerName ? ' LayerName="' + layerName + '"' : '';  // CypCut использует '0' для основного слоя
      shapesXmlEntries.push('\t<' + tag + ' Handle="' + s.handle + '"' + layerAttr + ' DataAddr="' + shapeDataAddrs.get(s.handle) + '" GeoAddr="' + shapeGeoAddrs.get(s.handle) + '"/>');
    }
  }
  // Контур NestPlate (без LayerName)
  shapesXmlEntries.push('\t<LwPolyline Handle="' + nestPlatePolyHandle + '" DataAddr="' + shapeDataAddrs.get(nestPlatePolyHandle) + '" GeoAddr="' + shapeGeoAddrs.get(nestPlatePolyHandle) + '"/>');
  // Контуры листов NestResult (без LayerName)
  for (const h of sheetContourHandles) {
    shapesXmlEntries.push('\t<LwPolyline Handle="' + h + '" DataAddr="' + shapeDataAddrs.get(h) + '" GeoAddr="' + shapeGeoAddrs.get(h) + '"/>');
  }

  const shapesMd5 = md5(shapesDataBin);
  const geoMd5 = md5(geoDataBin);

  const shapes2dXml = '<?xml version="1.0" encoding="utf-8"?>\n<Shapes2D>\n' + shapesXmlEntries.join('\n') + '\n\t<MD5>' + shapesMd5 + '</MD5>\n</Shapes2D>';
  const geo2dXml = '<?xml version="1.0" encoding="utf-8"?>\n<Geometry2D>\n\t<MD5>' + geoMd5 + '</MD5>\n</Geometry2D>';

  const layersXml = '<?xml version="1.0" encoding="utf-8"?>\n<Layers Handle="5"/>';
  const textStylesXml = '<?xml version="1.0" encoding="utf-8"?>\n<TextStyles Handle="6"/>';
  const viewportsXml = '<?xml version="1.0" encoding="utf-8"?>\n<Viewports Handle="3" Active="1">\n\t<VPort Handle="1015" Name="1">\n\t\t<ViewCenter/>\n\t\t<ZoomCoeff>1</ZoomCoeff>\n\t\t<ViewHeight>100</ViewHeight>\n\t\t<AspectRatio>1</AspectRatio>\n\t\t<DisplayRect>\n\t\t\t<Right>1024</Right>\n\t\t\t<Bottom>768</Bottom>\n\t\t</DisplayRect>\n\t</VPort>\n</Viewports>';

  const techXml = buildTechnicalChannelsXml(channels);

  // ── Nest2D/Parts/content.xml
  const nestPartEntries = [];
  for (const [partId, info] of nestPartMap) {
    nestPartEntries.push('\t<NestPart Handle="' + info.nestPartHandle + '" Name="' + info.partName + '" Amount="' + info.count + '" AmountUsed="' + info.count + '" ShapeCls="Insert">\n\t\t<Insert Handle="' + info.insertHandle + '" ChannelPort="' + defaultChannel + '">\n\t\t\t<InsertPoint X="' + info.basePoint.x + '" Y="' + info.basePoint.y + '"/>\n\t\t\t<BlockName>' + info.blockName + '</BlockName>\n\t\t\t<XScale>1</XScale>\n\t\t\t<YScale>1</YScale>\n\t\t</Insert>\n\t\t<Shape Class="Insert" Handle="' + info.insertHandle + '" ChannelPort="' + defaultChannel + '">\n\t\t\t<InsertPoint X="' + info.basePoint.x + '" Y="' + info.basePoint.y + '"/>\n\t\t\t<BlockName>' + info.blockName + '</BlockName>\n\t\t\t<XScale>1</XScale>\n\t\t\t<YScale>1</YScale>\n\t\t</Shape>\n\t\t<ExtShapes/>\n\t</NestPart>');
  }
  const nestPartsXml = '<?xml version="1.0" encoding="utf-8"?>\n<Parts>\n' + nestPartEntries.join('\n') + '\n</Parts>';

  // v4.60: NestPlate XML — прямоугольник
  const nestPlateXml = '<?xml version="1.0" encoding="utf-8"?>\n<Plates>\n\t<NestPlate Handle="' + nestPlateHandle + '" Name="Rectangle" Amount="' + sheetsData.length + '" AmountUsed="' + sheetsData.length + '" ShapeCls="LwPolyline">\n\t\t<LwPolyline Handle="' + nestPlatePolyHandle + '" NestPlate="' + nestPlateHandle + '" LeadInOptimizeFlag="6" PointCount="4" PolyFlag="1">\n\t\t\t<ToolCompensation/>\n\t\t\t<Point/>\n\t\t\t<Point X="' + plateW + '"/>\n\t\t\t<Point X="' + plateW + '" Y="' + plateH + '"/>\n\t\t\t<Point Y="' + plateH + '"/>\n\t\t</LwPolyline>\n\t\t<Shape Class="LwPolyline" Handle="' + nestPlatePolyHandle + '" NestPlate="' + nestPlateHandle + '"/>\n\t\t<ExtShapes/>\n\t</NestPlate>\n</Plates>';

  // ── Nest2D/Results/content.xml
  const resultEntries = sheetsData.map((sheet, si) => {
    const placements = sheetPlacements[si];
    return '\t<NestResult Index="' + (si + 1) + '" Name="Nest result" PartCount="' + placements.length + '" Utilization="50" PlanCount="1" SizeX="' + sheet.sheetSize.width + '" SizeY="' + sheet.sheetSize.height + '" ID="{' + nestResultIds[si] + '}"/>';
  });
  const nestResultsXml = '<?xml version="1.0" encoding="utf-8"?>\n<NestResults>\n' + resultEntries.join('\n') + '\n</NestResults>';

  // ── Nest2D/Results/N/content.xml — один на каждый лист
  // ── Параллельно: создаём NestGroup для каждого co-edge CommonPart блока
  // NestGroup ссылается на NestPart N раз (N = кол-во деталей в группе).
  // В оригинале CypCut: <NestGroup><Object Handle="nestPartHandle"/>... N раз</NestGroup>
  const nestGroups = []; // [{ handle, name, nestPartHandle, count, commonPartName }]
  const nestGroupMap = new Map(); // commonPartId → nestGroupHandle

  for (const entry of blockEntries) {
    if (!entry.isCoEdgeCommonPart) continue;
    const ngHandle = nextHandle++;
    const nestPartHandle = nestPartMap.get(String(entry.partId)).nestPartHandle;
    nestGroups.push({
      handle: ngHandle,
      name: 'CoedgePart',
      nestPartHandle,
      count: entry.coEdgePartCount,
      commonPartName: entry.name,
    });
    nestGroupMap.set(String(entry.partId), ngHandle);
    console.log(`📤 [CPS2] Создан NestGroup handle=${ngHandle} → NestPart=${nestPartHandle} (${entry.coEdgePartCount} деталей), Insert → CommonPart "${entry.name}"`);
  }

  const nestResultDetails = [];
  for (let si = 0; si < sheetsData.length; si++) {
    const sheet = sheetsData[si];
    // ── ОПТИМИЗАЦИЯ ПУТИ: переупорядочиваем размещения для минимизации
    //    холостых перемещений лазера (nearest-neighbor TSP)
    //    Порядок контуров ВНУТРИ детали не меняется (отверстия → контур),
    //    меняется только порядок деталей на листе.
    const sheetW = sheet.sheetSize.width;
    const sheetH = sheet.sheetSize.height;
    const placements = optimizeSheetPathOrder(sheetPlacements[si], sheetW, sheetH);

    const insertShapes = placements.map(pl => {
      const nested = pl.nested;
      const block = pl.blockEntry;
      const insHandle = pl.insertHandle;

      const posX_Canvas = nested.x ?? 0;
      const posY_Canvas = nested.y ?? 0;
      const angleRad = nested.angle ?? 0;

      // ── КООРДИНАТНОЕ ПРЕОБРАЗОВАНИЕ (как в svg-export.js / DXF) ──
      // nested.x, nested.y — это позиция refPoint на canvas (НЕ угол AABB!).
      // refPoint = точка с наименьшей Y (потом наименьшей X) в повёрнутом bbox.
      //
      // Блок пред-повёрнут и нормализован: локальный (0,0) = нижний-левый угол AABB
      // в CypCut Y-up (после Y-отражения). refPoint находится на (refPointOffsetX, aabbH)
      // в локальных координатах блока (верхний край в Y-up).
      //
      // Формулы (соответствуют DXF экспорту):
      //   CypCut_X = nested.x - refPointOffsetX   (без зеркала X, как в DXF)
      //   CypCut_Y = sheetHeight - nested.y - aabbH  (инверсия Y, как в DXF)
      //
      // Это помещает refPoint на позицию (nested.x, sheetHeight - nested.y) в CypCut,
      // что соответствует DXF: refPoint на (nested.x, sheetHeight - nested.y).
      const aabbW = block.aabbW || block.baseWidth || 0;
      const aabbH = block.aabbH || block.baseHeight || 0;
      const refOffsetX = block.refPointOffsetX || 0;

      const posX_CypCut = posX_Canvas - refOffsetX;
      const posY_CypCut = sheetH - posY_Canvas - aabbH;

      // ── Атрибуты Insert в зависимости от типа блока ──
      // Для co-edge CommonPart: BlockName=CommonPart + NestGroup (БЕЗ NestPart!)
      // Для обычной детали: BlockName=Part + NestPart (как раньше)
      const ngHandle = nestGroupMap.get(String(block.partId));
      const isCoEdgeInsert = Boolean(ngHandle);

      let nestPartAttr, nestGroupAttr, blockNameForInsert;
      if (isCoEdgeInsert) {
        // co-edge: только NestGroup, БЕЗ NestPart
        nestPartAttr = '';
        nestGroupAttr = ` NestGroup="${ngHandle}"`;
        blockNameForInsert = block.name;  // CommonPart
      } else {
        // обычная деталь: NestPart, БЕЗ NestGroup
        const nestPartHandle = nestPartMap.get(String(block.partId)).nestPartHandle;
        nestPartAttr = ` NestPart="${nestPartHandle}"`;
        nestGroupAttr = '';
        blockNameForInsert = block.name;
      }

      console.log('📤 [CPS2] Деталь #' + nested.partId + ': canvas(' + posX_Canvas.toFixed(1) + ',' + posY_Canvas.toFixed(1) + ') angle=' + (angleRad * 180 / Math.PI).toFixed(1) + '° aabb(' + aabbW.toFixed(1) + 'x' + aabbH.toFixed(1) + ') refOffsetX=' + refOffsetX.toFixed(1) + ' → InsertPt(' + posX_CypCut.toFixed(1) + ',' + posY_CypCut.toFixed(1) + ') Rot=0' + (isCoEdgeInsert ? ` [CO-EDGE ng=${ngHandle} → CommonPart]` : ' [DXF-совместимые координаты]'));

      // Rotation=0 — геометрия уже пред-повёрнута в блоке
      return '\t\t<Shape Class="Insert" Handle="' + insHandle + '" ChannelPort="' + defaultChannel + '"' + nestPartAttr + nestGroupAttr + '>\n\t\t\t<InsertPoint X="' + posX_CypCut + '" Y="' + posY_CypCut + '"/>\n\t\t\t<BlockName>' + blockNameForInsert + '</BlockName>\n\t\t\t<XScale>1</XScale>\n\t\t\t<YScale>1</YScale>\n\t\t</Shape>';
    });

    const contourLine = '\t\t<Shape Class="LwPolyline" Handle="' + sheetContourHandles[si] + '" NestPlate="' + nestPlateHandle + '"/>';
    const resultId = nestResultIds[si];
    const resultHandle = nextHandle++;

    const resultXml = '<?xml version="1.0" encoding="utf-8"?>\n<NestResult Handle="' + resultHandle + '" Name="Nest result" ID="{' + resultId + '}" PlateAmount="1" Utilization="50" MaterialName="Material Name">\n\t<ExtMin/>\n\t<ExtMax X="' + sheetW + '" Y="' + sheetH + '"/>\n\t<HomeRef RefType="3"/>\n\t<Shapes>\n' + insertShapes.join('\n') + '\n' + contourLine + '\n\t</Shapes>\n</NestResult>';

    nestResultDetails.push({ index: si + 1, xml: resultXml });
  }

  // Nest2D/Parts/Groups/content.xml — NestGroup для каждого co-edge блока
  let nestGroupsXml = '<?xml version="1.0" encoding="utf-8"?>\n<Groups/>';
  if (nestGroups.length > 0) {
    const groupEntries = nestGroups.map(ng => {
      // В оригинале CypCut перечисляет все Object Handle = nestPartHandle
      // по количеству деталей в группе
      const objects = Array.from({ length: ng.count }, () =>
        '\t\t<Object Handle="' + ng.nestPartHandle + '"/>'
      ).join('\n');
      return '\t<NestGroup Handle="' + ng.handle + '" Name="' + ng.name + '" Amount="1" AmountUsed="1">\n' + objects + '\n\t</NestGroup>';
    });
    nestGroupsXml = '<?xml version="1.0" encoding="utf-8"?>\n<Groups>\n' + groupEntries.join('\n') + '\n</Groups>';
    console.log(`📤 [CPS2] Создано NestGroup: ${nestGroups.length}`);
  }

  // Nest2D/content.xml
  const nestContentXml = '<?xml version="1.0" encoding="utf-8"?>\n<NestInfo>\n\t<Parts Count="' + nestPartMap.size + '"/>\n\t<NestGroups Count="' + nestGroups.length + '"/>\n\t<Plates Count="' + sheetsData.length + '"/>\n\t<Results Count="' + sheetsData.length + '"/>\n</NestInfo>';

  // cutsys.state
  const cutsysXml = '<?xml version="1.0" encoding="utf-8"?>\n<SysState>\n\t<CutSystem IsPipeCut="false" CurState="0" UcsIndex="1" ReturnOrgRequired="false" TableNum="0">\n\t\t<WorkTime Base="0">0</WorkTime>\n\t\t<PlaneCut X="0" Y="0" Z="0" W="0"/>\n\t\t<NcProgram SelOnly="0">\n\t\t\t<CmdCursor CmdIndex="0" ChannelBase="0" CurveStage="0" CurveParam="0" X="0" Y="0">\n\t\t\t\t<CurPos/>\n\t\t\t</CmdCursor>\n\t\t</NcProgram>\n\t\t<MotionDriver IsCurveMode="0" CurveParam="1"/>\n\t</CutSystem>\n</SysState>';

  // ── 5. Сборка inner ZIP (document.lxds) ──────────────────────────
  const innerZip = new JSZipLib();

  innerZip.file('info.xml', infoXml);
  innerZip.file('content.xml', contentXml);
  innerZip.file('Layers/content.xml', layersXml);
  innerZip.file('TextStyles/content.xml', textStylesXml);
  innerZip.file('Viewports/content.xml', viewportsXml);
  innerZip.file('Technical/content.xml', techXml);
  innerZip.file('Blocks/content.xml', blocksXml);
  innerZip.file('Shapes2D/content.xml', shapes2dXml);
  innerZip.file('Shapes2D/data.bin', shapesDataBin);
  innerZip.file('Geometry2D/content.xml', geo2dXml);
  innerZip.file('Geometry2D/data.bin', geoDataBin);
  innerZip.file('Nest2D/content.xml', nestContentXml);
  innerZip.file('Nest2D/Parts/content.xml', nestPartsXml);
  // Groups/content.xml — NestGroup для co-edge групп (если есть)
  if (nestGroups.length > 0) {
    innerZip.file('Nest2D/Parts/Groups/content.xml', nestGroupsXml);
  }
  innerZip.file('Nest2D/Plates/content.xml', nestPlateXml);
  innerZip.file('Nest2D/Results/content.xml', nestResultsXml);

  for (const detail of nestResultDetails) {
    innerZip.file('Nest2D/Results/' + detail.index + '/content.xml', detail.xml);
  }

  const documentLxds = await innerZip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // ── 6. Сборка outer ZIP (.cps2) ──────────────────────────────────
  const outerZip = new JSZipLib();
  outerZip.file('document.lxds', documentLxds);
  outerZip.file('cutsys.state', cutsysXml);

  const cps2Data = await outerZip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return new Blob([cps2Data], { type: 'application/octet-stream' });
}

// ═══════════════════════════════════════════════════════════════════════
// МОСТ: экспорт из глобального состояния CAD-приложения
// ═══════════════════════════════════════════════════════════════════════

async function exportCPS2FromApp() {
  if (typeof nestedParts === 'undefined' || nestedParts.length === 0) {
    alert('⚠️ Нет деталей для экспорта. Сначала разложите детали на листе.');
    return;
  }

  if (typeof parts === 'undefined' || parts.length === 0) {
    alert('⚠️ Нет деталей для экспорта.');
    return;
  }

  // Сохраняем текущие детали в allSheets перед экспортом
  if (window.allSheets && window.allSheets.length > 0 && window.currentSheetIndex >= 0) {
    window.allSheets[window.currentSheetIndex].nestedParts = [...nestedParts];
    window.allSheets[window.currentSheetIndex].markupRects = [...(window.markupRects || markupRects || [])];
  }

  try {
    const allSheetsArr = window.allSheets && window.allSheets.length > 0
      ? window.allSheets
      : [{ nestedParts: [...nestedParts], sheetSize }];

    // Глобальные parts — источник определений деталей
    const globalParts = (typeof parts !== 'undefined') ? parts : (window.parts || []);

    // Собираем все уникальные partId со всех листов
    const allPartIds = new Set();
    const sheetsForExport = [];

    for (const sheet of allSheetsArr) {
      const np = sheet.nestedParts || [];
      if (np.length === 0) continue;
      np.forEach(n => allPartIds.add(Number(n.partId)));
      sheetsForExport.push({
        nestedParts: np,
        sheetSize: sheet.sheetSize || { width: 3000, height: 1500 },
      });
    }

    if (sheetsForExport.length === 0) {
      alert('⚠️ Нет деталей для экспорта ни на одном листе.');
      return;
    }

    // Формируем список деталей для экспорта
    const exportParts = [];
    for (const part of globalParts) {
      if (!allPartIds.has(Number(part.id))) continue;
      if (!part.objects || part.objects.length === 0) continue;
      exportParts.push({
        id: part.id,
        name: part.name || 'Деталь_' + part.id,
        objects: part.objects,
        bounds: part.bounds || null, // v4.57: передаём bounds для корректной нормализации
        spacing: typeof part.spacing === 'number' ? part.spacing : 3,
        thickness: part.thickness,
      });
    }

    const totalPlacements = sheetsForExport.reduce((s, sh) => s + sh.nestedParts.length, 0);
    console.log('📤 [CPS2] Экспорт: ' + exportParts.length + ' типов деталей, ' + totalPlacements + ' размещений, ' + sheetsForExport.length + ' листов');

    const blob = await exportCPS2({
      parts: exportParts,
      sheets: sheetsForExport,
      defaultChannel: 1,
    });

    // Скачиваем файл
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'раскладка_' + sheetsForExport.length + 'л_' + new Date().toISOString().slice(0,10) + '.cps2';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('✅ [CPS2] Файл успешно экспортирован (' + sheetsForExport.length + ' листов)');

  } catch (err) {
    console.error('❌ [CPS2] Ошибка экспорта:', err);
    alert('❌ Ошибка при экспорте CPS2: ' + err.message);
  }
}
// ─── Привязка обработчика кнопки ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('exportCPS2');
  if (btn) {
    btn.addEventListener('click', exportCPS2FromApp);
    console.log('✅ [CPS2] Кнопка экспорта привязана');
  } else {
    // Если кнопка ещё не в DOM (скрипт загружается раньше), пробуем позже
    setTimeout(() => {
      const btn2 = document.getElementById('exportCPS2');
      if (btn2) {
        btn2.addEventListener('click', exportCPS2FromApp);
        console.log('✅ [CPS2] Кнопка экспорта привязана (повторная попытка)');
      } else {
        console.warn('⚠️ [CPS2] Кнопка #exportCPS2 не найдена в DOM');
      }
    }, 1000);
  }
});