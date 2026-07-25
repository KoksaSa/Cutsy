// ═══════════════════════════════════════════════════════════
// nested-part-operations.js — РЕФАКТОРИНГ
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// УНИФИЦИРОВАННОЕ СРАВНЕНИЕ ID ДЕТАЛЕЙ
// ═══════════════════════════════════════════════════════════
if (typeof samePartId !== 'function') {
    function samePartId(a, b) {
        return Number(a) === Number(b);
    }
}

// ═══════════════════════════════════════════════════════════
// ИМЕНОВАННЫЕ КОНСТАНТЫ
// ═══════════════════════════════════════════════════════════
const GROUP_TOLERANCE_RATIO = 0.35;   // Допуск группировки (доля от среднего размера)
const GROUP_TOLERANCE_MIN_MM = 8;     // Минимальный допуск группировки в мм
const PRECISE_ROTATION_STEP = 2;      // Шаг точного поворота в градусах
const PRECISE_ROTATION_INTERVAL = 50; // Интервал точного поворота в мс
const DEFAULT_NESTING_SPACING = 3;    // Отступ между деталями по умолчанию (мм)

// ═══════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: безопасное добавление обработчиков
// ═══════════════════════════════════════════════════════════
function safeAddEventListener(id, event, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener(event, handler);
    } else {
        console.warn('Элемент #' + id + ' не найден в DOM');
    }
    return element;
}

// ═══════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (защита от ReferenceError)
// ═══════════════════════════════════════════════════════════
if (typeof allowOverlap === 'undefined') {
    window.allowOverlap = false;
}

// ═══════════════════════════════════════════════════════════
// ОБЩИЕ ХЕЛПЕРЫ
// ═══════════════════════════════════════════════════════════

/** Ограничить позицию детали в пределах листа */
function clampToSheet(detail) {
    const sheetW = (typeof sheetSize !== 'undefined') ? sheetSize.width : Infinity;
    const sheetH = (typeof sheetSize !== 'undefined') ? sheetSize.height : Infinity;
    const w = detail.width || detail.baseWidth || 0;
    const h = detail.height || detail.baseHeight || 0;
    detail.x = Math.max(0, Math.min(detail.x, sheetW - w));
    detail.y = Math.max(0, Math.min(detail.y, sheetH - h));
}

/** Синхронизировать nestedParts с allSheets */
function syncAllSheetsNestedParts() {
    const targetSheets = window.allSheets || (typeof allSheets !== 'undefined' ? allSheets : null);
    const targetIndex = window.currentSheetIndex !== undefined ? window.currentSheetIndex : (typeof currentSheetIndex !== 'undefined' ? currentSheetIndex : 0);
    if (targetSheets && targetSheets[targetIndex]) {
        // v4.39 FIX N3: deep-clone polygon, outline, refPoint, objects.
        // Раньше только polygon и refPoint клонировались (shallow) → outline и objects
        // оставались по ссылке → при следующем вращении изменялась геометрия в allSheets.
        targetSheets[targetIndex].nestedParts = nestedParts.map(function(n) {
            return Object.assign({}, n, {
                polygon: n.polygon ? n.polygon.map(function(p) { return { x: p.x, y: p.y }; }) : undefined,
                outline: n.outline ? n.outline.map(function(poly) { return poly.map(function(p) { return { x: p.x, y: p.y }; }); }) : undefined,
                refPoint: n.refPoint ? { x: n.refPoint.x, y: n.refPoint.y } : undefined,
                objects: n.objects ? n.objects.map(function(o) { return Object.assign({}, o); }) : undefined
            });
        });
        if (typeof allSheets !== 'undefined') allSheets = targetSheets;
        window.allSheets = targetSheets;
    }
}

/** Установить oneCutEnabled для выбранных деталей */
function setOneCutEnabled(selectedDetails) {
    const connectedPartIds = {};
    selectedDetails.forEach(function(d) { connectedPartIds[d.partId] = true; });
    Object.keys(connectedPartIds).forEach(function(partId) {
        const part = parts.find(function(p) { return samePartId(p.id, Number(partId)); });
        if (part) {
            part.oneCutEnabled = true;
        }
        selectedDetails.forEach(function(d) {
            if (samePartId(d.partId, Number(partId))) {
                d.oneCutEnabled = true;
            }
        });
    });
}

/** Безопасный сброс выделения и обновление UI */
function resetSelectionAndRefresh() {
    selectedNestedParts = [];
    const infoEl = document.getElementById('nestedSelectInfo');
    if (infoEl) {
        infoEl.style.display = 'none';
    }
    if (typeof render === 'function') render();
    if (typeof updateSheetNavigation === 'function') updateSheetNavigation();
    if (typeof updatePartsList === 'function') updatePartsList();
}

// ═══════════════════════════════════════════════════════════
// ОБЩАЯ ЛОГИКА ПОВОРОТА ДЕТАЛЕЙ
// ═══════════════════════════════════════════════════════════

/**
 * Применяет поворот к списку деталей вокруг общего центра группы.
 * @param {Array} details — массив объектов nested-деталей
 * @param {number} angleRad — угол поворота в радианах
 */
function applyRotationToDetails(details, angleRad) {
    if (!details || details.length === 0) return;

    // Центр группы — bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    details.forEach(function(nested) {
        minX = Math.min(minX, nested.x);
        minY = Math.min(minY, nested.y);
        maxX = Math.max(maxX, nested.x + nested.width);
        maxY = Math.max(maxY, nested.y + nested.height);
    });
    const groupCenterX = (minX + maxX) / 2;
    const groupCenterY = (minY + maxY) / 2;

    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    details.forEach(function(nested) {
        // Центр детали — bounding box
        const oldCenterX = nested.x + nested.width / 2;
        const oldCenterY = nested.y + nested.height / 2;

        // Вращаем центр детали вокруг центра группы
        const dx = oldCenterX - groupCenterX;
        const dy = oldCenterY - groupCenterY;
        const newCenterX = groupCenterX + dx * cos - dy * sin;
        const newCenterY = groupCenterX + dx * sin + dy * cos;

        // Новый угол (с нормализацией)
        const newAngle = (((nested.angle || 0) + angleRad) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

        // v4.39 FIX N1: используем РЕАЛЬНЫЙ hull детали, а не bbox-прямоугольник.
        // Раньше hull = [{0,0}, {baseW,0}, {baseW,baseH}, {0,baseH}] — это bbox,
        // который для Г-образных/треугольных/круглых деталей НЕ соответствует
        // реальному контуру → после вращения коллизионная геометрия неверна.
        // Теперь берём hull из nested.polygon (если есть) или из N.getPartBoundingHull(part).
        const baseW = nested.baseWidth || nested.width;
        const baseH = nested.baseHeight || nested.height;
        let hull;
        // Пытаемся получить реальный hull из движка
        const N = (typeof Nesting !== 'undefined') ? Nesting : (typeof window !== 'undefined' ? window.Nesting : null);
        const part = (typeof parts !== 'undefined') ? parts.find(function(p) { return samePartId(p.id, nested.partId); }) : null;
        if (part && N && typeof N.getPartBoundingHull === 'function') {
            try {
                hull = N.getPartBoundingHull(part);
                if (!hull || hull.length < 3) hull = null;
            } catch (e) { hull = null; }
        }
        // Fallback: используем существующий nested.polygon (позиционированный hull)
        if (!hull && nested.polygon && nested.polygon.length >= 3) {
            // nested.polygon — в sheet-координатах, нужно перевести в part-local
            hull = nested.polygon.map(function(p) { return { x: p.x - (nested.x || 0), y: p.y - (nested.y || 0) }; });
        }
        // Final fallback: bbox-прямоугольник (старое поведение)
        if (!hull || hull.length < 3) {
            hull = [{ x: 0, y: 0 }, { x: baseW, y: 0 }, { x: baseW, y: baseH }, { x: 0, y: baseH }];
        }
        const cx = baseW / 2, cy = baseH / 2;

        const rotatedHull = (typeof rotatePolygon === 'function')
            ? rotatePolygon(hull, newAngle, cx, cy)
            : hull.map(function(p) {
                return {
                    x: cx + (p.x - cx) * Math.cos(newAngle) - (p.y - cy) * Math.sin(newAngle),
                    y: cy + (p.x - cx) * Math.sin(newAngle) + (p.y - cy) * Math.cos(newAngle)
                };
            });

        const ref = (typeof getReferencePoint === 'function')
            ? getReferencePoint(rotatedHull)
            : rotatedHull.reduce(function(r, p) {
                return (p.y < r.y || (p.y === r.y && p.x < r.x)) ? p : r;
            }, rotatedHull[0]);

        const shifted = rotatedHull.map(function(p) { return { x: p.x - ref.x, y: p.y - ref.y }; });

        const temp = (typeof getBoundingBox === 'function')
            ? getBoundingBox(shifted)
            : shifted.reduce(function(b, p) {
                return {
                    minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y),
                    maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y),
                    width: Math.max(b.maxX, p.x) - Math.min(b.minX, p.x),
                    height: Math.max(b.maxY, p.y) - Math.min(b.minY, p.y)
                };
            }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const finalHull = shifted.map(function(p) { return { x: p.x - temp.minX, y: p.y - temp.minY }; });
        const newRef = { x: ref.x + temp.minX, y: ref.y + temp.minY };

        // Позиционирование — bounding box центр
        nested.x = Math.max(0, Math.min(newCenterX - temp.width / 2, (typeof sheetSize !== 'undefined' ? sheetSize.width : Infinity) - temp.width));
        nested.y = Math.max(0, Math.min(newCenterY - temp.height / 2, (typeof sheetSize !== 'undefined' ? sheetSize.height : Infinity) - temp.height));
        nested.angle = newAngle;
        nested.width = temp.width;
        nested.height = temp.height;
        nested.polygon = finalHull.map(p => ({ x: p.x + nested.x, y: p.y + nested.y })); // v4.74: sheet coords
        nested.refPoint = newRef;

        // v4.39 FIX N2: обновляем outline через computePositionedPolygons.
        // Раньше outline оставался в старой позиции → отрисовка контуров
        // рассинхронизировалась с polygon после вращения.
        if (part && N && typeof N.computePositionedPolygons === 'function') {
            try {
                nested.outline = N.computePositionedPolygons(part, nested.x, nested.y, newAngle);
            } catch (e) {
                // Silent fail — outline обновится при следующей раскладке
            }
        }
    });

    if (typeof render === 'function') render();
}

// ═══════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ ОТРАЖЕНИЯ ДЕТАЛЕЙ
// ═══════════════════════════════════════════════════════════

safeAddEventListener('flipPartX', 'click', function() {
    if (selectedNestedParts.length > 0 && nestedParts.length > 0) {
        if (typeof flipNestedPart !== 'function') {
            console.error('Функция flipNestedPart не определена!');
            return;
        }
        if (typeof saveState === 'function') saveState();

        selectedNestedParts.forEach(function(nestedIndex) {
            const nested = nestedParts[nestedIndex];
            if (nested) {
                flipNestedPart(nested, 'X', sheetSize.width, sheetSize.height, nestedParts, parts);
            }
        });

        if (typeof render === 'function') render();
    }
});

safeAddEventListener('flipPartY', 'click', function() {
    if (selectedNestedParts.length > 0 && nestedParts.length > 0) {
        if (typeof flipNestedPart !== 'function') {
            console.error('Функция flipNestedPart не определена!');
            return;
        }
        if (typeof saveState === 'function') saveState();

        selectedNestedParts.forEach(function(nestedIndex) {
            const nested = nestedParts[nestedIndex];
            if (nested) {
                flipNestedPart(nested, 'Y', sheetSize.width, sheetSize.height, nestedParts, parts);
            }
        });

        if (typeof render === 'function') render();
    }
});

safeAddEventListener('rotatePartCCW', 'click', function() {
    if (selectedNestedParts.length > 0 && nestedParts.length > 0) {
        rotateSelectedAsGroup(-90);
    }
});

safeAddEventListener('rotatePartCW', 'click', function() {
    if (selectedNestedParts.length > 0 && nestedParts.length > 0) {
        rotateSelectedAsGroup(90);
    }
});

// ═══════════════════════════════════════════════════════════
// ПОВОРОТ ГРУППЫ ДЕТАЛЕЙ ВОКРУГ ОБЩЕГО ЦЕНТРА
// ═══════════════════════════════════════════════════════════
function rotateSelectedAsGroup(rotationDegrees) {
    if (selectedNestedParts.length === 0) return;

    if (typeof rotationDegrees !== 'number' || !isFinite(rotationDegrees) || rotationDegrees === 0) {
        console.warn('rotateSelectedAsGroup: некорректный угол:', rotationDegrees);
        return;
    }

    if (typeof saveState === 'function') saveState();

    const selectedDetails = selectedNestedParts.map(function(idx) { return nestedParts[idx]; }).filter(function(n) { return n; });
    if (selectedDetails.length === 0) return;

    const angleRad = rotationDegrees * Math.PI / 180;
    applyRotationToDetails(selectedDetails, angleRad);
}

// ═══════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ ТОЧНОГО ВРАЩЕНИЯ ДЕТАЛИ
// ═══════════════════════════════════════════════════════════

let preciseRotationInterval = null;
let preciseRotationSelectedDetails = [];

function clearPreciseRotation() {
    if (preciseRotationInterval) {
        clearInterval(preciseRotationInterval);
        preciseRotationInterval = null;
        preciseRotationSelectedDetails = [];
    }
}

document.addEventListener('mouseup', clearPreciseRotation);
document.addEventListener('mouseleave', clearPreciseRotation);
window.addEventListener('beforeunload', clearPreciseRotation);

// ═══════════════════════════════════════════════════════════
// ТОЧНОЕ ВРАЩЕНИЕ ПО ЧАСОВОЙ (зажатие кнопки)
// ═══════════════════════════════════════════════════════════
safeAddEventListener('rotatePartPreciseCW', 'mousedown', function(e) {
    e.preventDefault();
    if (preciseRotationInterval) clearPreciseRotation();
    if (selectedNestedParts.length > 0 && nestedParts.length > 0) {
        preciseRotationSelectedDetails = selectedNestedParts.map(function(idx) { return nestedParts[idx]; }).filter(function(n) { return n; });
        if (preciseRotationSelectedDetails.length === 0) return;
        if (typeof saveState === 'function') saveState();
        performPreciseGroupRotation(PRECISE_ROTATION_STEP);
        preciseRotationInterval = setInterval(function() { performPreciseGroupRotation(PRECISE_ROTATION_STEP); }, PRECISE_ROTATION_INTERVAL);
    }
});
safeAddEventListener('rotatePartPreciseCW', 'mouseup', clearPreciseRotation);
safeAddEventListener('rotatePartPreciseCW', 'mouseleave', clearPreciseRotation);

// ═══════════════════════════════════════════════════════════
// ТОЧНОЕ ВРАЩЕНИЕ ПРОТИВ ЧАСОВОЙ (зажатие кнопки)
// ═══════════════════════════════════════════════════════════
safeAddEventListener('rotatePartPreciseCCW', 'mousedown', function(e) {
    e.preventDefault();
    if (preciseRotationInterval) clearPreciseRotation();
    if (selectedNestedParts.length > 0 && nestedParts.length > 0) {
        preciseRotationSelectedDetails = selectedNestedParts.map(function(idx) { return nestedParts[idx]; }).filter(function(n) { return n; });
        if (preciseRotationSelectedDetails.length === 0) return;
        if (typeof saveState === 'function') saveState();
        performPreciseGroupRotation(-PRECISE_ROTATION_STEP);
        preciseRotationInterval = setInterval(function() { performPreciseGroupRotation(-PRECISE_ROTATION_STEP); }, PRECISE_ROTATION_INTERVAL);
    }
});
safeAddEventListener('rotatePartPreciseCCW', 'mouseup', clearPreciseRotation);
safeAddEventListener('rotatePartPreciseCCW', 'mouseleave', clearPreciseRotation);

// ═══════════════════════════════════════════════════════════
// ТОЧНЫЙ ПОВОРОТ ГРУППЫ
// ═══════════════════════════════════════════════════════════
function performPreciseGroupRotation(angleDegrees) {
    if (preciseRotationSelectedDetails.length === 0) return;

    // Проверяем актуальность ссылок
    preciseRotationSelectedDetails = preciseRotationSelectedDetails.filter(function(n) {
        return nestedParts.indexOf(n) !== -1;
    });
    if (preciseRotationSelectedDetails.length === 0) {
        clearPreciseRotation();
        return;
    }

    const angleRad = angleDegrees * Math.PI / 180;
    applyRotationToDetails(preciseRotationSelectedDetails, angleRad);
}

// ═══════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ СОЕДИНЕНИЯ ДЕТАЛЕЙ
// ═══════════════════════════════════════════════════════════

safeAddEventListener('joinSelectedParts', 'click', function() {
    if (selectedNestedParts.length < 2) {
        alert('Выделите минимум 2 детали для соединения.\n\nЗажмите Shift и кликните по деталям.');
        return;
    }

    if (typeof findAlignment !== 'function') {
        console.error('Функция findAlignment не определена!');
        alert('Ошибка: функция выравнивания не найдена. Проверьте подключение модулей.');
        return;
    }

    if (typeof saveState === 'function') saveState();

    const selectedDetails = selectedNestedParts.map(function(idx) { return nestedParts[idx]; }).filter(function(d) { return d; });

    if (selectedDetails.length < 2) {
        alert('Не удалось найти выделенные детали. Возможно, они были удалены.');
        return;
    }

    let totalMoved = 0;
    const movedPartIds = {};

    // ПРОХОД 1: Горизонтальное соединение (в ряды)
    const avgHeight = selectedDetails.reduce(function(s, d) { return s + (d.height || d.baseHeight || 0); }, 0) / selectedDetails.length;
    const rowTolerance = Math.max(avgHeight * GROUP_TOLERANCE_RATIO, GROUP_TOLERANCE_MIN_MM);

    const rows = [];
    selectedDetails.forEach(function(d) {
        let placed = false;
        for (let i = 0; i < rows.length; i++) {
            if (Math.abs(d.y - rows[i][0].y) <= rowTolerance) {
                rows[i].push(d);
                placed = true;
                break;
            }
        }
        if (!placed) rows.push([d]);
    });

    rows.forEach(function(row) {
        row.sort(function(a, b) { return a.x - b.x; });
        for (let i = 1; i < row.length; i++) {
            const alignment = findAlignment(row[i], row[i - 1]);
            if (alignment && typeof alignment.x === 'number') {
                row[i].x = alignment.x;
                row[i].y = alignment.y;
                clampToSheet(row[i]);
                totalMoved++;
                movedPartIds[row[i].partId] = true;
            }
        }
    });

    // ПРОХОД 2: Вертикальное соединение (ряды друг под другом)
    const avgWidth = selectedDetails.reduce(function(s, d) { return s + (d.width || d.baseWidth || 0); }, 0) / selectedDetails.length;
    const colTolerance = Math.max(avgWidth * GROUP_TOLERANCE_RATIO, GROUP_TOLERANCE_MIN_MM);

    const cols = [];
    selectedDetails.forEach(function(d) {
        let placed = false;
        for (let i = 0; i < cols.length; i++) {
            if (Math.abs(d.x - cols[i][0].x) <= colTolerance) {
                cols[i].push(d);
                placed = true;
                break;
            }
        }
        if (!placed) cols.push([d]);
    });

    cols.forEach(function(col) {
        col.sort(function(a, b) { return a.y - b.y; });
        for (let i = 1; i < col.length; i++) {
            const upper = col[i - 1];
            const lower = col[i];
            const currW = lower.width || lower.baseWidth || 0;
            const currH = lower.height || lower.baseHeight || 0;
            const refW = upper.width || upper.baseWidth || 0;
            const refH = upper.height || upper.baseHeight || 0;

            let aligned = false;
            if (typeof checkDirection === 'function') {
                const alignment = checkDirection('bottom', lower, upper, currW, currH, refW, refH);
                if (alignment && typeof alignment.x === 'number') {
                    lower.x = alignment.x;
                    lower.y = alignment.y;
                    clampToSheet(lower);
                    totalMoved++;
                    movedPartIds[lower.partId] = true;
                    aligned = true;
                }
            }

            if (!aligned) {
                lower.x = upper.x;
                lower.y = upper.y + refH;
                clampToSheet(lower);
                totalMoved++;
                movedPartIds[lower.partId] = true;
            }
        }
    });

    // Устанавливаем oneCutEnabled (актуально только для «Соединить»)
    setOneCutEnabled(selectedDetails);

    // Синхронизируем allSheets
    syncAllSheetsNestedParts();

    // Безопасный сброс выделения
    resetSelectionAndRefresh();
});

// ═══════════════════════════════════════════════════════════
// ВЫРАВНИВАНИЕ ВЫБРАННЫХ ДЕТАЛЕЙ С УЧЁТОМ ОТСТУПА (SPACING)
// ═══════════════════════════════════════════════════════════

safeAddEventListener('alignSelectedParts', 'click', function() {
    if (selectedNestedParts.length < 2) {
        alert('Выделите минимум 2 детали для выравнивания.\n\nЗажмите Shift и кликните по деталям.');
        return;
    }

    if (typeof saveState === 'function') saveState();

    const selectedDetails = selectedNestedParts.map(function(idx) { return nestedParts[idx]; }).filter(function(d) { return d; });

    if (selectedDetails.length < 2) {
        alert('Не удалось найти выделенные детали. Возможно, они были удалены.');
        return;
    }

    // Получаем spacing из глобальных настроек
    let spacing = (typeof window.nestingSpacing !== 'undefined') ? window.nestingSpacing : DEFAULT_NESTING_SPACING;
    if (spacing === null || spacing === undefined) spacing = DEFAULT_NESTING_SPACING;

    let totalMoved = 0;

    // ПРОХОД 1: Горизонтальное выравнивание (в ряды)
    const avgHeight = selectedDetails.reduce(function(s, d) { return s + (d.height || d.baseHeight || 0); }, 0) / selectedDetails.length;
    const rowTolerance = Math.max(avgHeight * GROUP_TOLERANCE_RATIO, GROUP_TOLERANCE_MIN_MM);

    const rows = [];
    selectedDetails.forEach(function(d) {
        let placed = false;
        for (let i = 0; i < rows.length; i++) {
            if (Math.abs(d.y - rows[i][0].y) <= rowTolerance) {
                rows[i].push(d);
                placed = true;
                break;
            }
        }
        if (!placed) rows.push([d]);
    });

    rows.forEach(function(row) {
        row.sort(function(a, b) { return a.x - b.x; });

        for (let i = 1; i < row.length; i++) {
            const prev = row[i - 1];
            const curr = row[i];
            const prevW = prev.width || prev.baseWidth || 0;

            // Выравниваем по левому краю с учётом отступа
            const targetX = prev.x + prevW + spacing;
            curr.x = targetX;
            curr.y = row[0].y; // Выравниваем по Y первой детали в ряду
            clampToSheet(curr);
            totalMoved++;
        }
    });

    // ПРОХОД 2: Вертикальное выравнивание (ряды друг под другом)
    const avgWidth = selectedDetails.reduce(function(s, d) { return s + (d.width || d.baseWidth || 0); }, 0) / selectedDetails.length;
    const colTolerance = Math.max(avgWidth * GROUP_TOLERANCE_RATIO, GROUP_TOLERANCE_MIN_MM);

    const cols = [];
    selectedDetails.forEach(function(d) {
        let placed = false;
        for (let i = 0; i < cols.length; i++) {
            if (Math.abs(d.x - cols[i][0].x) <= colTolerance) {
                cols[i].push(d);
                placed = true;
                break;
            }
        }
        if (!placed) cols.push([d]);
    });

    cols.forEach(function(col) {
        col.sort(function(a, b) { return a.y - b.y; });

        for (let i = 1; i < col.length; i++) {
            const upper = col[i - 1];
            const lower = col[i];
            const refH = upper.height || upper.baseHeight || 0;

            // Выравниваем по верхнему краю с учётом отступа
            const targetY = upper.y + refH + spacing;
            lower.x = upper.x; // Выравниваем по X
            lower.y = targetY;
            clampToSheet(lower);
            totalMoved++;
        }
    });

    // Синхронизируем allSheets
    syncAllSheetsNestedParts();

    // Безопасный сброс выделения
    resetSelectionAndRefresh();

    console.log('✅ Выравнивание завершено: перемещено ' + totalMoved + ' деталей');
});

// ═══════════════════════════════════════════════════════════
// ОБРАБОТЧИК ПЕРЕКЛЮЧЕНИЯ НАЛОЖЕНИЯ
// ═══════════════════════════════════════════════════════════

safeAddEventListener('toggleOverlap', 'click', function() {
    if (typeof saveState === 'function') saveState();

    window.allowOverlap = !window.allowOverlap;
    const btn = document.getElementById('toggleOverlap');

    if (!btn) return;

    if (window.allowOverlap) {
        btn.textContent = '✅ Наложение деталей: ВКЛ';
        btn.style.background = '#7a2d2d';
        btn.title = 'Детали могут пересекаться при раскладке';
    } else {
        btn.textContent = '🚫 Наложение деталей: ВЫКЛ';
        btn.style.background = '#2d7a2d';
        btn.title = 'Детали не могут пересекаться (зазор 3 мм)';
    }
});

// ═══════════════════════════════════════════════════════════
// ОБРАБОТЧИК ПЕРЕКЛЮЧЕНИЯ СЕТКИ
// ═══════════════════════════════════════════════════════════

safeAddEventListener('toggleGrid', 'click', function() {
    if (typeof saveState === 'function') saveState();

    window.showGrid = !window.showGrid;
    const btn = document.getElementById('toggleGrid');

    if (!btn) return;

    if (window.showGrid) {
        btn.textContent = '📏 Сетка: ВКЛ';
        btn.classList.add('active');
    } else {
        btn.textContent = '📏 Сетка: ВЫКЛ';
        btn.classList.remove('active');
    }

    if (typeof render === 'function') render();
});

// ═══════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ СОСТОЯНИЯ КНОПКИ СЕТКИ ПРИ ЗАГРУЗКЕ
// ═══════════════════════════════════════════════════════════

if (typeof window.showGrid === 'undefined') {
    window.showGrid = true;
}

const gridBtn = document.getElementById('toggleGrid');
if (gridBtn) {
    if (window.showGrid) {
        gridBtn.textContent = '📏 Сетка: ВКЛ';
        gridBtn.classList.add('active');
    } else {
        gridBtn.textContent = '📏 Сетка: ВЫКЛ';
        gridBtn.classList.remove('active');
    }
} else {
    console.warn('Кнопка #toggleGrid не найдена в DOM');
}

if (typeof render === 'function') {
    render();
}