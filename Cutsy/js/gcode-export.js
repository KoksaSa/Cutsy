// ═══════════════════════════════════════════════════════════════
// gcode-export.js — v4.62 — Подготовка контуров для G-code Editor
// ═══════════════════════════════════════════════════════════════
// Использует mergeObjectsToContours из cps2-contour-merger.js
// для сшивки примитивов в замкнутые контуры (как в CPS2 export).
// Затем трансформирует контуры в листовые координаты.
//
// v4.52: Пост-фильтрация артефактов сшивки — открытые контуры на
//        режущем слое (OUTLINE) принудительно замыкаются (gap<3мм)
//        или пропускаются (артефакты — обрывки дуг/линий, которые
//        CypCut не отображает, но gcode-editor рисует как лишние линии).
//
// v4.53: 1) Fix rotation positioning — используем np.width/np.height
//           (rotated AABB) для позиционирования центра, а НЕ part.bounds
//           (original). Иначе повёрнутые детали смещаются с листа.
//        2) Адаптивный force-close: gap < max(5мм, 15% bbox диагонали)
//           вместо фиксированных 3мм — не теряем легитимные контуры.
//
// v4.62: 1) Fix "деталь превращается в круг" — когда скруглённый
//           прямоугольник с внутренним отверстием не сшивается в
//           замкнутый контур (одна дуга не прицепилась), он попадал
//           в "пропущенные артефакты" → оставался только круг-отверстие.
//           Теперь существенные контуры (≥20 вершин) принудительно
//           замыкаются прямой линией вместо пропуска.
//        2) Защита от ложного определения круга — добавлена проверка
//           углового покрытия (max angular gap < 45°). Раньше проверялась
//           только радиальная равномерность, что могло ложно сработать
//           для контуров с точками, равноудалёнными от центроида, но не
//           покрывающими 360° (частичные дуги, скруглённые квадраты с
//           большим радиусом).
// ═══════════════════════════════════════════════════════════════

function openGcodeEditor() {
    if (typeof nestedParts === 'undefined' || !nestedParts || nestedParts.length === 0) {
        alert('⚠️ Сначала сделайте раскладку деталей на листе.');
        return;
    }

    // Проверяем что mergeObjectsToContours доступна
    if (typeof mergeObjectsToContours !== 'function') {
        console.error('[GCODE-EXPORT] mergeObjectsToContours не найдена! Убедитесь что cps2-contour-merger.js загружен.');
        alert('❌ Ошибка: cps2-contour-merger.js не загружен.');
        return;
    }

    console.log('[GCODE-EXPORT] Подготовка данных для G-code Editor...');

    const exportObjects = [];
    const sheetWidth = (typeof sheetSize !== 'undefined') ? sheetSize.width : 1250;
    const sheetHeight = (typeof sheetSize !== 'undefined') ? sheetSize.height : 2500;

    for (let i = 0; i < nestedParts.length; i++) {
        const np = nestedParts[i];
        if (!np) continue;

        const part = (typeof parts !== 'undefined') ? parts.find(p => p.id === np.partId) : null;
        if (!part || !part.objects || part.objects.length === 0) {
            continue;
        }

        // Сшиваем примитивы в контуры (в part-local координатах)
        const rawContours = mergeObjectsToContours(part.objects, () => 0, 1);
        console.log(`[GCODE-EXPORT] Деталь #${i} "${part.name || part.id}": ${rawContours.length} контуров из ${part.objects.length} примитивов`);

        // ── Пост-фильтрация: устранение артефактов сшивки ──
        // mergeObjectsToContours иногда не может идеально сшить дуги с линиями
        // (особенно в закруглённых углах) — остаются "висящие" открытые сегменты.
        // CypCut их не отображает, но gcode-editor рисует все контуры → лишние линии.
        //
        // Стратегия (v4.53 — адаптивная):
        // 1. Замкнутые контуры → оставляем все (внешние + отверстия)
        // 2. Открытые контуры на BEND/OPALKA/DASHED → оставляем (намеренные линии гиба/гравировки)
        // 3. Открытые контуры на OUTLINE ( cutting layer):
        //    a. Вычисляем gap (расстояние start→end) и bbox-диагональ контура
        //    b. Если gap < max(5мм, 15% диагонали) и ≥3 вершин → принудительно замыкаем
        //       (почти-замкнутый легитимный контур — просто не хватило допуска сшивки)
        //    c. Иначе → пропускаем (это артефакт — обрывок дуги/линии, gap≈диагональ)
        const FORCE_CLOSE_ABS = 5.0;   // мм — абсолютный допуск
        const FORCE_CLOSE_RATIO = 0.15; // 15% от bbox-диагонали — относительный допуск
        // v4.62: порог вершин для определения "существенного" контура.
        // Скруглённый прямоугольник (4 линии + 4 дуги) даёт ~100 вершин после сшивки.
        // Артефакты сшивки — обычно 2-7 вершин. Порог 20 безопасно разделяет их.
        const SUBSTANTIAL_CONTOUR_MIN_VERTS = 20;
        const contours = [];
        let skippedArtifacts = 0;
        let forceClosed = 0;

        for (const c of rawContours) {
            if (c.closed) {
                contours.push(c);
                continue;
            }

            const layer = (c.layerName || '').toUpperCase();
            const isCuttingLayer = (layer === 'OUTLINE' || layer === '0' || layer === '');

            if (!isCuttingLayer) {
                // Линия гиба / гравировки — оставляем открытой
                contours.push(c);
                continue;
            }

            // Открытый контур на режущем слое
            if (c.vertices.length >= 3) {
                const first = c.vertices[0];
                const last = c.vertices[c.vertices.length - 1];
                const gap = Math.hypot(first.x - last.x, first.y - last.y);

                // BBox-диагональ контура
                let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
                for (const v of c.vertices) {
                    if (v.x < bMinX) bMinX = v.x;
                    if (v.y < bMinY) bMinY = v.y;
                    if (v.x > bMaxX) bMaxX = v.x;
                    if (v.y > bMaxY) bMaxY = v.y;
                }
                const diag = Math.hypot(bMaxX - bMinX, bMaxY - bMinY);
                const adaptiveTol = Math.max(FORCE_CLOSE_ABS, diag * FORCE_CLOSE_RATIO);

                if (gap < adaptiveTol) {
                    // Почти замкнут — принудительно замыкаем
                    contours.push({ ...c, closed: true });
                    forceClosed++;
                    console.log(`[GCODE-EXPORT] Force-closed (gap=${gap.toFixed(2)}мм, tol=${adaptiveTol.toFixed(2)}мм, diag=${diag.toFixed(1)}мм, ${c.vertices.length}v) layer=${layer} на детали #${i}`);
                    continue;
                }

                // v4.62: Существенный открытый контур (≥20 вершин) с большим gap —
                // это скруглённый прямоугольник, у которого не сшилась одна дуга.
                // НЕ пропускаем как артефакт — замыкаем прямой линией (gap-сегмент),
                // иначе деталь с отверстием превращается в один только круг-отверстие.
                // Артефакты сшивки имеют 2-7 вершин и не попадают под этот порог.
                if (c.vertices.length >= SUBSTANTIAL_CONTOUR_MIN_VERTS) {
                    contours.push({ ...c, closed: true });
                    forceClosed++;
                    console.log(`[GCODE-EXPORT] Force-closed substantial contour (gap=${gap.toFixed(2)}мм, diag=${diag.toFixed(1)}мм, ${c.vertices.length}v) layer=${layer} на детали #${i} — замыкаем прямой линией`);
                    continue;
                }
            }

            // Артефакт — пропускаем
            skippedArtifacts++;
            const v0 = c.vertices[0], vN = c.vertices[c.vertices.length - 1];
            console.log(`[GCODE-EXPORT] Skipped artifact (${c.vertices.length}v, layer=${layer}) на детали #${i}: [${v0.x.toFixed(1)},${v0.y.toFixed(1)}] → [${vN.x.toFixed(1)},${vN.y.toFixed(1)}]`);
        }

        console.log(`[GCODE-EXPORT] Деталь #${i}: ${rawContours.length}→${contours.length} контуров (force-closed: ${forceClosed}, skipped artifacts: ${skippedArtifacts})`);

        // v4.57: Вычисляем bounds из contour vertices (fitPoints для сплайнов).
        // part.bounds может отличаться для сплайнов (если вычислен из controlPoints).
        // Используем contour bounds для нормализации — гарантирует совпадение
        // с реальной геометрией контуров.
        let contourMinX = Infinity, contourMinY = Infinity;
        let contourMaxX = -Infinity, contourMaxY = -Infinity;
        for (const c of contours) {
            for (const v of c.vertices) {
                if (v.x < contourMinX) contourMinX = v.x;
                if (v.y < contourMinY) contourMinY = v.y;
                if (v.x > contourMaxX) contourMaxX = v.x;
                if (v.y > contourMaxY) contourMaxY = v.y;
            }
        }
        if (contourMinX === Infinity) contourMinX = 0;
        if (contourMinY === Infinity) contourMinY = 0;
        if (contourMaxX === -Infinity) contourMaxX = 0;
        if (contourMaxY === -Infinity) contourMaxY = 0;
        const contourW = contourMaxX - contourMinX;
        const contourH = contourMaxY - contourMinY;

        // Трансформация part-local → sheet
        // ВАЖНО: np.x/np.y — top-left ПОВЁРНУТОГО AABB на листе,
        //         np.width/np.height — размеры ПОВЁРНУТОГО AABB.
        //         part.bounds.width/height — ОРИГИНАЛЬНЫЕ (до поворота).
        //
        // v4.57: Используем part.bounds (как nesting engine), но если
        //         part.bounds сильно отличается от contour bounds (сплайны),
        //         используем contour bounds — гарантирует правильное
        //         позиционирование контуров на листе.
        const angle = np.angle || 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const px = np.x || 0;
        const py = np.y || 0;

        // Определяем bounds для нормализации
        // Приоритет: part.bounds (если совпадает с contour bounds в пределах 5мм)
        // Иначе: contour bounds (реальная геометрия)
        const pb = part.bounds;
        const BOUNDS_TOLERANCE = 5.0; // мм — допуск совпадения
        let normX, normY, origW, origH;

        if (pb && typeof pb.minX === 'number' && typeof pb.width === 'number' &&
            Math.abs(pb.minX - contourMinX) < BOUNDS_TOLERANCE &&
            Math.abs(pb.minY - contourMinY) < BOUNDS_TOLERANCE &&
            Math.abs(pb.width - contourW) < BOUNDS_TOLERANCE &&
            Math.abs(pb.height - contourH) < BOUNDS_TOLERANCE) {
            // part.bounds совпадает с contour bounds — используем part.bounds
            normX = pb.minX;
            normY = pb.minY;
            origW = pb.width;
            origH = pb.height;
        } else {
            // part.bounds не совпадает (сплайны) — используем contour bounds
            if (pb) {
                console.log(`[GCODE-EXPORT] Деталь #${i}: part.bounds=(${pb.minX?.toFixed(1)},${pb.minY?.toFixed(1)},${pb.width?.toFixed(1)}×${pb.height?.toFixed(1)}) ≠ contour=(${contourMinX.toFixed(1)},${contourMinY.toFixed(1)},${contourW.toFixed(1)}×${contourH.toFixed(1)}) — используем contour bounds`);
            }
            normX = contourMinX;
            normY = contourMinY;
            origW = contourW;
            origH = contourH;
        }

        const rcx = origW / 2;  // rotation center (local)
        const rcy = origH / 2;

        // ПОВЁРНУТЫЕ размеры — для позиционирования на листе
        // np.width/np.height уже учитывают поворот (set в 17-nesting.js:1170-1171)
        const rotW = np.width || origW;
        const rotH = np.height || origH;
        const scx = px + rotW / 2;  // sheet center (rotated AABB center)
        const scy = py + rotH / 2;

        function toSheet(lx, ly) {
            // Смещение от оригинального центра (в part-local)
            const dx = lx - normX - rcx;
            const dy = ly - normY - rcy;
            // Вращение + позиционирование на листе через повёрнутый центр
            return {
                x: scx + dx * cos - dy * sin,
                y: scy + dx * sin + dy * cos
            };
        }

        // Вычисляем площадь для сортировки
        const withArea = contours.map(c => {
            let area = 0;
            const v = c.vertices;
            for (let j = 0; j < v.length; j++) {
                const k = (j + 1) % v.length;
                area += v[j].x * v[k].y - v[k].x * v[j].y;
            }
            return { contour: c, area: Math.abs(area / 2) };
        });

        // Сортируем: меньшие (отверстия) — первыми
        withArea.sort((a, b) => a.area - b.area);

        for (const { contour, area } of withArea) {
            // Трансформируем точки в листовые координаты
            const sheetPoints = contour.vertices.map(v => toSheet(v.x, v.y));

            // Проверяем — является ли контур кругом
            // v4.62: добавлена проверка углового покрытия. Раньше проверялась
            // только радиальная равномерность ((rMax-rMin)/rMax < 3%), что могло
            // ложно сработать для скруглённых прямоугольников с большим радиусом
            // скругления (r ≈ W/2) — все точки оказывались почти равноудалены от
            // центра. Теперь дополнительно требуем, чтобы точки покрывали ~360°
            // (максимальный угловой разрыв < 45°). Частичная дуга (90°/180°/270°)
            // имеет большой угловой разрыв и не пройдёт проверку.
            let isCircle = false;
            let circleCx = 0, circleCy = 0, circleR = 0;
            if (sheetPoints.length >= 12 && contour.closed) {
                let cxSum = 0, cySum = 0;
                for (const p of sheetPoints) { cxSum += p.x; cySum += p.y; }
                circleCx = cxSum / sheetPoints.length;
                circleCy = cySum / sheetPoints.length;
                let rMin = Infinity, rMax = 0;
                for (const p of sheetPoints) {
                    const r = Math.hypot(p.x - circleCx, p.y - circleCy);
                    rMin = Math.min(rMin, r);
                    rMax = Math.max(rMax, r);
                }
                const radialUniform = rMax > 0 && (rMax - rMin) / rMax < 0.03;

                // v4.62: Проверка углового покрытия — точки должны охватывать ~360°
                let angularCoverageOK = false;
                if (radialUniform && rMax > 0) {
                    // Вычисляем угол каждой точки относительно центроида, нормализуем в [0, 2π)
                    const angles = sheetPoints.map(p => {
                        let a = Math.atan2(p.y - circleCy, p.x - circleCx);
                        return a < 0 ? a + 2 * Math.PI : a;
                    });
                    angles.sort((a, b) => a - b);
                    // Находим максимальный разрыв между соседними углами (включая wrap-around)
                    let maxGap = 0;
                    for (let k = 0; k < angles.length; k++) {
                        const next = (k + 1) % angles.length;
                        let g = angles[next] - angles[k];
                        if (next === 0) g += 2 * Math.PI; // wrap-around
                        if (g > maxGap) maxGap = g;
                    }
                    // Полный круг: maxGap < 45° (π/4). Частичная дуга (90°/270°) — maxGap > 90°.
                    // Скруглённый прямоугольник с МАЛЫМ r: 4 дуги покрывают только углы,
                    // большие разрывы по рёбрам → maxGap > 45° → НЕ круг. ✓
                    // Скруглённый прямоугольник с r≈W/2 (почти круг): дуги покрывают ~360°,
                    // малые разрывы → проходит (но это и есть почти круг). ✓
                    angularCoverageOK = maxGap < (Math.PI / 4);
                }

                if (radialUniform && angularCoverageOK) {
                    isCircle = true;
                    circleR = (rMin + rMax) / 2;
                }
            }

            if (isCircle) {
                exportObjects.push({
                    type: 'circle',
                    cx: circleCx,
                    cy: circleCy,
                    radius: circleR,
                    partIndex: i,
                    closed: true
                });
            } else {
                exportObjects.push({
                    type: 'polyline',
                    points: sheetPoints,
                    partIndex: i,
                    closed: contour.closed
                });
            }
        }
    }

    const sheetData = {
        sheetWidth: sheetWidth,
        sheetHeight: sheetHeight,
        nestedParts: nestedParts.map((np, i) => ({
            partId: np.partId,
            x: np.x || 0,
            y: np.y || 0,
            width: np.width || 0,
            height: np.height || 0,
            angle: np.angle || 0,
            rotation: np.rotation || 0,
            partIndex: i
        })),
        exportObjects: exportObjects
    };

    try {
        const jsonStr = JSON.stringify(sheetData);
        console.log('[GCODE-EXPORT] Data size:', jsonStr.length, 'bytes');

        if (jsonStr.length > 4 * 1024 * 1024 && typeof LZString !== 'undefined') {
            const compressed = 'LZ16:' + LZString.compressToUTF16(jsonStr);
            localStorage.setItem('cutsy_gcode_sheet', compressed);
        } else {
            localStorage.setItem('cutsy_gcode_sheet', jsonStr);
        }
    } catch (e) {
        if (typeof LZString !== 'undefined') {
            try {
                const compressed = 'LZ16:' + LZString.compressToUTF16(JSON.stringify(sheetData));
                localStorage.setItem('cutsy_gcode_sheet', compressed);
            } catch (e2) {
                alert('❌ Недостаточно места для данных.');
                return;
            }
        } else {
            alert('❌ Ошибка сохранения: ' + e.message);
            return;
        }
    }

    console.log(`[GCODE-EXPORT] Готово: ${exportObjects.length} контуров, ${nestedParts.length} деталей`);
    window.open('gcode-editor.html', '_blank');
}

// Привязка обработчика
if (typeof document !== 'undefined') {
    function _bindGcodeBtn() {
        const btn = document.getElementById('openGcodeEditor');
        if (btn) {
            btn.addEventListener('click', openGcodeEditor);
            console.log('[GCODE-EXPORT] Button openGcodeEditor connected');
            return true;
        }
        return false;
    }
    if (!_bindGcodeBtn()) {
        document.addEventListener('DOMContentLoaded', _bindGcodeBtn);
        window.addEventListener('load', _bindGcodeBtn);
    }
}

if (typeof window !== 'undefined') {
    window.openGcodeEditor = openGcodeEditor;
}