// ═══════════════════════════════════════════════════════════════════
// CPS2 CONTOUR MERGER — объединяет примитивы детали в замкнутые LwPolyline
// ═══════════════════════════════════════════════════════════════════
// Проблема: при экспорте каждый примитив (линия, дуга) отдельный объект
// в Block → CypCut делает врезку для каждого → десятки лишних врезок.
//
// Решение: сшиваем все примитивы, образующие замкнутый контур,
// в одну LwPolyline с closed=true → одна врезка на контур.
//
// v2: Улучшения — разделение по слоям, принудительное замыкание,
//     устранение дублей, детальное логирование
// ═══════════════════════════════════════════════════════════════════

/**
 * Основная функция: принимает массив объектов детали (part.objects)
 * и возвращает массив замкнутых/незамкнутых контуров.
 *
 * Каждый контур: { vertices: [{x,y}], closed: boolean, colorIndex: number, layerName: string }
 *
 * @param {Array} objects — массив примитивов детали (line, arc, circle, rect, polyline, etc.)
 * @param {Function} colorToColorIndexFn — функция для определения colorIndex
 * @param {number} defaultChannel — канал по умолчанию
 * @returns {Array<{vertices, closed, colorIndex, layerName}>} массив контуров
 */
function mergeObjectsToContours(objects, colorToColorIndexFn, defaultChannel) {
  if (!objects || objects.length === 0) return [];

  // ── Шаг 1: Конвертируем каждый примитив в полилинию (массив точек) ──
  const segments = [];

  for (let oi = 0; oi < objects.length; oi++) {
    const obj = objects[oi];
    const colorIndex = obj.colorIndex ?? colorToColorIndexFn(obj.color, defaultChannel);
    const layerName = getLayerName(obj);

    if (obj.type === 'line') {
      const p1 = { x: obj.x1 ?? 0, y: obj.y1 ?? 0 };
      const p2 = { x: obj.x2 ?? 0, y: obj.y2 ?? 0 };
      // Пропускаем нулевые линии (start ≈ end)
      if (pointsClose(p1, p2, 0.01)) {
                continue;
      }
      segments.push({
        points: [p1, p2],
        colorIndex,
        layerName,
        alreadyClosed: false,
        sourceType: 'line',
        sourceIndex: oi,
      });
    } else if (obj.type === 'arc') {
      const arcPts = arcToPoints(obj);
      if (arcPts.length < 2) continue;
      segments.push({
        points: arcPts,
        colorIndex,
        layerName,
        alreadyClosed: false,
        sourceType: 'arc',
        sourceIndex: oi,
      });
    } else if (obj.type === 'circle') {
      const circlePts = circleToPoints(obj);
      segments.push({
        points: circlePts,
        colorIndex,
        layerName,
        alreadyClosed: true,
        sourceType: 'circle',
        sourceIndex: oi,
      });
    } else if (obj.type === 'rect') {
      const x = obj.x ?? 0, y = obj.y ?? 0;
      const rw = obj.width ?? 0, rh = obj.height ?? 0;
      segments.push({
        points: [
          { x, y },
          { x: x + rw, y },
          { x: x + rw, y: y + rh },
          { x, y: y + rh },
        ],
        colorIndex,
        layerName,
        alreadyClosed: true,
        sourceType: 'rect',
        sourceIndex: oi,
      });
    } else if (obj.type === 'polygon') {
      const pts = (obj.points || obj.vertices || []).filter(
        v => v && typeof v.x === 'number' && typeof v.y === 'number'
      );
      if (pts.length >= 3) {
        segments.push({
          points: pts,
          colorIndex,
          layerName,
          alreadyClosed: true,
          sourceType: 'polygon',
          sourceIndex: oi,
        });
      }
    } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
      const pts = (obj.points || obj.vertices || []).filter(
        v => v && typeof v.x === 'number' && typeof v.y === 'number'
      );
      if (pts.length >= 2) {
        const first = pts[0], last = pts[pts.length - 1];
        const isClosed = obj.closed ??
          (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);
        segments.push({
          points: pts,
          colorIndex,
          layerName,
          alreadyClosed: isClosed,
          sourceType: obj.type,
          sourceIndex: oi,
        });
      }
    } else if (obj.type === 'ellipse') {
      const ellipsePts = ellipseToPoints(obj);
      segments.push({
        points: ellipsePts,
        colorIndex,
        layerName,
        alreadyClosed: true,
        sourceType: 'ellipse',
        sourceIndex: oi,
      });
    } else if (obj.type === 'spline') {
      const pts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || []).filter(
        v => v && typeof v.x === 'number' && typeof v.y === 'number'
      );
      if (pts.length >= 2) {
        const first = pts[0], last = pts[pts.length - 1];
        const isClosed = obj.closed ??
          (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01);
        segments.push({
          points: pts,
          colorIndex,
          layerName,
          alreadyClosed: isClosed,
          sourceType: 'spline',
          sourceIndex: oi,
        });
      }
    }
  }

  if (segments.length === 0) return [];

  
  // ── Шаг 2: Устраняем дублирующиеся сегменты ──
  // Два сегмента считаются дубликатами, если их start и end совпадают
  // (в прямом или обратном порядке)
  const deduped = deduplicateSegments(segments);

  // ── Шаг 2b: Устраняем коллинеарные под-сегменты ──
  // Сегмент A — под-сегмент сегмента B, если:
  //   - A и B коллинеарны (лежат на одной прямой)
  //   - A полностью содержится в B (по проекции)
  // Удаляем более короткий (A).
  // Это убирает "ложные T-узлы" — точки, где короткая линия лежит поверх
  // длинной, создавая разветвление в алгоритме сшивки.
  const noSubSegs = removeCollinearSubSegments(deduped);

  // ── Шаг 3: Разделяем уже замкнутые контуры и открытые сегменты ──
  const closedContours = [];
  const openSegments = [];

  for (const seg of noSubSegs) {
    if (seg.alreadyClosed) {
      closedContours.push({
        vertices: seg.points,
        closed: true,
        colorIndex: seg.colorIndex,
        layerName: seg.layerName,
      });
    } else {
      openSegments.push(seg);
    }
  }

  
  // ── Шаг 4: Группируем открытые сегменты по layerName ──
  // НЕ смешиваем сегменты разных слоёв — иначе линия гиба сцепится
  // с контуром реза и появится лишняя линия
  const layerGroups = new Map();
  for (const seg of openSegments) {
    const layer = seg.layerName;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer).push(seg);
  }

  
  // ── Шаг 5: Сшиваем открытые сегменты в контуры (по группам) ──
  const allMergedContours = [];
  for (const [layer, layerSegs] of layerGroups) {
    const merged = chainOpenSegments(layerSegs);
        allMergedContours.push(...merged);
  }

  // ── Шаг 6: Принудительное замыкание почти-замкнутых контуров ──
  const FORCE_CLOSE_TOLERANCE = 2.0; // мм — допуск для принудительного замыкания
  for (const contour of allMergedContours) {
    if (contour.closed) continue;
    if (contour.vertices.length < 3) continue;

    const first = contour.vertices[0];
    const last = contour.vertices[contour.vertices.length - 1];
    const dist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2);

    if (dist < FORCE_CLOSE_TOLERANCE) {
      contour.closed = true;
    }
  }

  // ── Шаг 7: Удаляем дублирующуюся последнюю точку для замкнутых контуров ──
  for (const contour of [...closedContours, ...allMergedContours]) {
    if (!contour.closed) continue;
    if (contour.vertices.length < 3) continue;
    const first = contour.vertices[0];
    const last = contour.vertices[contour.vertices.length - 1];
    if (pointsClose(first, last, 0.01)) {
      contour.vertices.pop();
    }
  }

  // ── Шаг 8: Объединяем результаты ──
  const result = [...closedContours, ...allMergedContours];

  
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Устранение дублирующихся сегментов
// ═══════════════════════════════════════════════════════════════════

/**
 * Устраняет дубликаты сегментов — два сегмента с одинаковыми
 * начальной и конечной точками (в прямом или обратном порядке).
 * Оставляем первый, помечаем второй как дубликат.
 */
function deduplicateSegments(segments) {
  const DEDUP_TOLERANCE = 0.1; // мм
  const result = [];
  const duplicates = new Set();

  for (let i = 0; i < segments.length; i++) {
    if (duplicates.has(i)) continue;

    const segI = segments[i];
    const iStart = segI.points[0];
    const iEnd = segI.points[segI.points.length - 1];

    for (let j = i + 1; j < segments.length; j++) {
      if (duplicates.has(j)) continue;

      const segJ = segments[j];
      const jStart = segJ.points[0];
      const jEnd = segJ.points[segJ.points.length - 1];

      // Проверяем совпадение в прямом порядке: iStart≈jStart && iEnd≈jEnd
      const forwardMatch =
        pointsClose(iStart, jStart, DEDUP_TOLERANCE) &&
        pointsClose(iEnd, jEnd, DEDUP_TOLERANCE);

      // Проверяем совпадение в обратном порядке: iStart≈jEnd && iEnd≈jStart
      const reverseMatch =
        pointsClose(iStart, jEnd, DEDUP_TOLERANCE) &&
        pointsClose(iEnd, jStart, DEDUP_TOLERANCE);

      if (forwardMatch || reverseMatch) {
        // Дубликат найден — пропускаем более короткий или второй сегмент
                duplicates.add(j);
      }
    }

    result.push(segI);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Устранение коллинеарных под-сегментов
// ═══════════════════════════════════════════════════════════════════

/**
 * Устраняет сегменты, которые являются под-сегментами других сегментов.
 *
 * Сегмент A — под-сегмент сегмента B, если:
 *   1. A и B — линейные сегменты (2 точки)
 *   2. A и B коллинеарны (лежат на одной прямой)
 *   3. A полностью содержится в B по проекции на прямую
 *
 * Такие под-сегменты создают "ложные T-узлы" — точки, где конец короткой
 * линии лежит на середине длинной, создавая разветвление в алгоритме
 * сшивки. Это приводит к тому, что сшивка идёт по короткой линии вместо
 * длинной, и контур не замыкается.
 *
 * Пример: контур Г-образной детали
 *   line[5]: (12,0) → (80,0)   — нижняя грань (длинная)
 *   line[3]: (12,0) → (40,0)   — часть нижней грани (короткая, под-сегмент)
 * Без удаления: в точке (40,0) сшивка может пойти не туда.
 * С удалением: line[3] убирается, остаётся только line[5].
 */
function removeCollinearSubSegments(segments) {
  const TOL = 0.1; // мм — допуск коллинеарности и перекрытия
  const toRemove = new Set();

  // Работаем только с линейными сегментами (2 точки)
  // Дуги и полилинии с >2 точками не рассматриваем
  const lineSegs = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].points.length === 2) {
      lineSegs.push({ idx: i, seg: segments[i] });
    }
  }

  for (let a = 0; a < lineSegs.length; a++) {
    if (toRemove.has(lineSegs[a].idx)) continue;
    const segA = lineSegs[a].seg;
    const aStart = segA.points[0];
    const aEnd = segA.points[1];
    const aDx = aEnd.x - aStart.x;
    const aDy = aEnd.y - aStart.y;
    const aLen = Math.sqrt(aDx * aDx + aDy * aDy);
    if (aLen < TOL) continue;
    // Единичный направляющий вектор A
    const aUx = aDx / aLen;
    const aUy = aDy / aLen;

    for (let b = 0; b < lineSegs.length; b++) {
      if (a === b) continue;
      if (toRemove.has(lineSegs[b].idx)) continue;
      const segB = lineSegs[b].seg;
      const bStart = segB.points[0];
      const bEnd = segB.points[1];
      const bLen = Math.sqrt((bEnd.x - bStart.x) ** 2 + (bEnd.y - bStart.y) ** 2);
      if (bLen < TOL) continue;

      // Проверяем коллинеарность: обе точки B должны лежать на прямой A
      // Кросс-произведение (A_dir × (B_point - A_start)) ≈ 0
      const d1x = bStart.x - aStart.x;
      const d1y = bStart.y - aStart.y;
      const cross1 = aDx * d1y - aDy * d1x;
      const d2x = bEnd.x - aStart.x;
      const d2y = bEnd.y - aStart.y;
      const cross2 = aDx * d2y - aDy * d2x;

      if (Math.abs(cross1) > TOL || Math.abs(cross2) > TOL) continue;

      // Коллинеарны! Проецируем точки B на параметризацию A: t ∈ [0, aLen]
      const t1 = d1x * aUx + d1y * aUy; // проекция bStart
      const t2 = d2x * aUx + d2y * aUy; // проекция bEnd
      const tMin = Math.min(t1, t2);
      const tMax = Math.max(t1, t2);

      // A занимает [0, aLen]. B — под-сегмент A, если B ⊂ [−TOL, aLen+TOL]
      if (tMin >= -TOL && tMax <= aLen + TOL) {
        if (bLen <= aLen + TOL) {
          toRemove.add(lineSegs[b].idx);
        }
      }
    }
  }

  return segments.filter((_, idx) => !toRemove.has(idx));
}

// ═══════════════════════════════════════════════════════════════════
// Вспомогательные функции
// ═══════════════════════════════════════════════════════════════════

const SNAP_TOLERANCE = 0.5;  // мм — допуск для сшивки endpoints
const SNAP_TOLERANCE_SQ = SNAP_TOLERANCE * SNAP_TOLERANCE; // оптимизация

/**
 * Конвертация дуги в массив точек
 */
function arcToPoints(obj) {
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
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = startA + dir * step * i;
    pts.push({
      x: acx + Math.cos(a) * r,
      y: acy + Math.sin(a) * r,
    });
  }
  return pts;
}

/**
 * Конвертация круга в массив точек (замкнутый)
 */
function circleToPoints(obj) {
  const ccx = obj.cx ?? 0, ccy = obj.cy ?? 0;
  const cr = Math.abs(obj.radius ?? 0);
  const cSegments = 48;
  const pts = [];
  for (let i = 0; i < cSegments; i++) {
    const a = (2 * Math.PI * i) / cSegments;
    pts.push({
      x: ccx + Math.cos(a) * cr,
      y: ccy + Math.sin(a) * cr,
    });
  }
  return pts;
}

/**
 * Конвертация эллипса в массив точек (замкнутый)
 */
function ellipseToPoints(obj) {
  const ecx = obj.cx ?? 0, ecy = obj.cy ?? 0;
  const rx = obj.rx ?? 0, ry = obj.ry ?? 0;
  const segments = 36;
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push({
      x: ecx + Math.cos(a) * rx,
      y: ecy + Math.sin(a) * ry,
    });
  }
  return pts;
}

/**
 * Определение имени слоя для объекта
 */
function getLayerName(obj) {
  const objLayer = (obj.layer || '').toString().trim().toUpperCase();
  const objLT = (obj._effectiveLineType || '').toString().trim().toUpperCase();
  if (/^BEND/.test(objLayer) || /^BEND/.test(objLT)) return 'BEND';
  if (/^OPALKA/.test(objLayer) || /^OPALKA/.test(objLT)) return 'OPALKA';
  if (/^DASHED/.test(objLT) || obj._isContinuous === false) return 'DASHED';
  return 'OUTLINE';
}

/**
 * Проверка близости двух точек
 */
function pointsClose(p1, p2, tol) {
  return Math.abs(p1.x - p2.x) < tol && Math.abs(p1.y - p2.y) < tol;
}

/**
 * Расстояние между двумя точками
 */
function pointDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Сшивка открытых сегментов в замкнутые/незамкнутые контуры.
 * v2: Ищем ближайшего соседа вместо первого попавшегося.
 *
 * Алгоритм:
 * 1. Каждый сегмент — цепочка точек от start до end
 * 2. Ищем ближайший сегмент, чей start/end совпадает с текущим end/start
 * 3. Присоединяем (с переворотом если нужно)
 * 4. Если start цепочки совпадает с end — замыкаем
 */
function chainOpenSegments(segments) {
  if (segments.length === 0) return [];

  const used = new Array(segments.length).fill(false);
  const contours = [];

  for (let startIdx = 0; startIdx < segments.length; startIdx++) {
    if (used[startIdx]) continue;

    // Начинаем новую цепочку с этого сегмента
    used[startIdx] = true;
    const chain = [...segments[startIdx].points];
    let chainColorIndex = segments[startIdx].colorIndex;
    let chainLayerName = segments[startIdx].layerName;
    let chainEnd = chain[chain.length - 1];
    let chainStart = chain[0];

    let found = true;
    while (found) {
      found = false;

      let bestDist = Infinity;
      let bestIdx = -1;
      let bestMode = ''; // 'end-start', 'end-end', 'start-end', 'start-start'

      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const seg = segments[i];
        const segStart = seg.points[0];
        const segEnd = seg.points[seg.points.length - 1];

        // Пробуем присоединить к концу цепочки (segStart → chainEnd)
        if (pointsClose(chainEnd, segStart, SNAP_TOLERANCE)) {
          const d = pointDistance(chainEnd, segStart);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
            bestMode = 'end-start';
          }
        }

        // Пробуем присоединить перевёрнутый сегмент к концу (segEnd → chainEnd)
        if (pointsClose(chainEnd, segEnd, SNAP_TOLERANCE)) {
          const d = pointDistance(chainEnd, segEnd);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
            bestMode = 'end-end';
          }
        }

        // Пробуем присоединить к началу цепочки (segEnd → chainStart)
        if (pointsClose(chainStart, segEnd, SNAP_TOLERANCE)) {
          const d = pointDistance(chainStart, segEnd);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
            bestMode = 'start-end';
          }
        }

        // Пробуем присоединить перевёрнутый сегмент к началу (segStart → chainStart)
        if (pointsClose(chainStart, segStart, SNAP_TOLERANCE)) {
          const d = pointDistance(chainStart, segStart);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
            bestMode = 'start-start';
          }
        }
      }

      if (bestIdx >= 0) {
        const seg = segments[bestIdx];
        switch (bestMode) {
          case 'end-start':
            // Добавляем точки сегмента в прямом порядке (без первой — она совпадает с chainEnd)
            for (let j = 1; j < seg.points.length; j++) {
              chain.push(seg.points[j]);
            }
            break;

          case 'end-end':
            // Добавляем точки сегмента в обратном порядке (без последней — она совпадает с chainEnd)
            for (let j = seg.points.length - 2; j >= 0; j--) {
              chain.push(seg.points[j]);
            }
            break;

          case 'start-end':
            // Вставляем точки сегмента в начало в прямом порядке (без последней — она совпадает с chainStart)
            for (let j = seg.points.length - 2; j >= 0; j--) {
              chain.unshift(seg.points[j]);
            }
            break;

          case 'start-start':
            // Вставляем точки сегмента в начало в обратном порядке (без первой — она совпадает с chainStart)
            for (let j = 1; j < seg.points.length; j++) {
              chain.unshift(seg.points[j]);
            }
            break;
        }

        chainEnd = chain[chain.length - 1];
        chainStart = chain[0];
        used[bestIdx] = true;
        found = true;
      }
    }

    // Проверяем, замкнулась ли цепочка
    const isClosed = chain.length >= 3 && pointsClose(chain[0], chain[chain.length - 1], SNAP_TOLERANCE);

    if (isClosed) {
      // Убираем последнюю точку если она дублирует первую (для замкнутой полилинии)
      if (pointsClose(chain[0], chain[chain.length - 1], 0.01)) {
        chain.pop();
      }
    }

    if (chain.length >= 2) {
      contours.push({
        vertices: chain,
        closed: isClosed,
        colorIndex: chainColorIndex,
        layerName: chainLayerName,
      });
    }
  }

  return contours;
}