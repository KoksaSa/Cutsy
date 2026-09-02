// ═══════════════════════════════════════════════════════════════
// gcode-editor.js — G-code Editor для лазерной резки (Cutsy CAD PRO)
// ═══════════════════════════════════════════════════════════════

'use strict';

// ═══════════════════════════════════════════════════════════════
// Инициализация
// ═══════════════════════════════════════════════════════════════

let sheetData = null;
let generatedGcode = '';

// Состояние вида (зум / панорамирование)
let viewScale = 0;
let viewTranslateX = 0;
let viewTranslateY = 0;
let baseViewScale = 0;
let baseTranslateX = 0;
let baseTranslateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let panStartTranslateX = 0;
let panStartTranslateY = 0;

// ═══════════════════════════════════════════════════════════════
// Порядок деталей (не контуров!)
// ═══════════════════════════════════════════════════════════════

let orderMode = 'original';        // 'original' | 'optimize' | 'custom' | 'spiral-out' | 'spiral-in'
let partOrder = [];                // массив индексов деталей (nestedParts) — пользовательский порядок
let partToContoursMap = {};        // partIndex → [индексы в exportObjects]
let dragSrcIndex = null;

// Клик-выбор деталей на холсте
let clickOrder = [];               // массив индексов деталей в порядке кликов
let mouseDownPos = null;           // {x, y} — позиция mousedown для различения клик/перетаскивание
let hoveredPartIdx = -1;          // индекс детали под курсором (для подсветки)

document.addEventListener('DOMContentLoaded', () => {
    console.log('[GCODE-EDITOR] DOMContentLoaded');
    loadSheetData();
    setupCanvasEvents();
    console.log('[GCODE-EDITOR] initialization complete');
});

function loadSheetData() {
    console.log('[GCODE-EDITOR] loadSheetData called');
    try {
        const stored = localStorage.getItem('cutsy_gcode_sheet');
        if (!stored) {
            console.error('[GCODE-EDITOR] No sheet data in localStorage');
            showError('❌ Нет данных для экспорта.\nВернитесь в приложение и разместите детали на листе.');
            return;
        }

        console.log('[GCODE-EDITOR] Raw data length:', stored.length, 'first 3 chars:', JSON.stringify(stored.substring(0, 3)));

        let jsonStr = null;

        // Вариант 1: чистый JSON (текущий формат, без сжатия)
        if (stored[0] === '{' || stored[0] === '[') {
            jsonStr = stored;
            console.log('[GCODE-EDITOR] Data is raw JSON');
        }

        // Вариант 2: сжатый с префиксом 'LZ16:' (fallback при переполнении localStorage)
        if (!jsonStr && stored.startsWith('LZ16:') && typeof LZString !== 'undefined') {
            try {
                const decompressed = LZString.decompressFromUTF16(stored.substring(5));
                if (decompressed && (decompressed[0] === '{' || decompressed[0] === '[')) {
                    jsonStr = decompressed;
                    console.log('[GCODE-EDITOR] Decompressed LZ16 data, length:', decompressed.length);
                }
            } catch (e) {
                console.warn('[GCODE-EDITOR] LZ16 decompression failed:', e.message);
            }
        }

        // Вариант 3: старый формат (сжатый без префикса — от предыдущих версий)
        if (!jsonStr && typeof LZString !== 'undefined') {
            // Пробуем все методы LZString
            const methods = [
                { name: 'decompressFromUTF16', fn: LZString.decompressFromUTF16 },
                { name: 'decompressFromEncodedURIComponent', fn: LZString.decompressFromEncodedURIComponent },
                { name: 'decompress', fn: LZString.decompress }
            ];
            for (const m of methods) {
                try {
                    const d = m.fn(stored);
                    if (d && d.length > 2 && (d[0] === '{' || d[0] === '[')) {
                        jsonStr = d;
                        console.log('[GCODE-EDITOR] Decompressed with', m.name, ', length:', d.length);
                        break;
                    }
                } catch (e) {
                    // skip
                }
            }
        }

        if (!jsonStr) {
            console.error('[GCODE-EDITOR] Cannot parse data. First 50 chars:', JSON.stringify(stored.substring(0, 50)));
            showError('❌ Не удалось прочитать данные листа.\nВернитесь в приложение и повторите раскладку.');
            return;
        }

        try {
            sheetData = JSON.parse(jsonStr);
        } catch (e) {
            console.error('[GCODE-EDITOR] JSON parse error:', e);
            showError('❌ Данные листа повреждены.\nВернитесь в приложение и повторите раскладку.');
            return;
        }
        console.log('[GCODE-EDITOR] sheetData loaded:', sheetData);
        document.getElementById('statusInfo').textContent =
            `Лист: ${sheetData.sheetWidth} × ${sheetData.sheetHeight} мм | Деталей: ${sheetData.nestedParts.length}`;

        // ═══ DEBUG: Логирование расположения деталей на листе ═══
        console.log('[DEBUG] ═══════════════════════════════════════════════════');
        console.log(`[DEBUG] ЛИСТ: ${sheetData.sheetWidth} × ${sheetData.sheetHeight} мм`);
        console.log(`[DEBUG] Деталей на листе: ${sheetData.nestedParts.length}`);
        console.log(`[DEBUG] Экспорт-объектов (контуров): ${sheetData.exportObjects.length}`);
        for (let i = 0; i < sheetData.nestedParts.length; i++) {
            const p = sheetData.nestedParts[i];
            console.log(`[DEBUG] Деталь #${i}: pos=(${(p.x||0).toFixed(1)}, ${(p.y||0).toFixed(1)}), size=${(p.width||0).toFixed(1)}×${(p.height||0).toFixed(1)} мм, rotation=${p.rotation||0}, angle=${p.angle||0}`);
        }
        console.log('[DEBUG] ═══ Экспорт-объекты (контуры) ═══');
        for (let i = 0; i < sheetData.exportObjects.length; i++) {
            const obj = sheetData.exportObjects[i];
            const pts = obj.points || [];
            const ptsStr = pts.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ');
            console.log(`[DEBUG]   exportObj[${i}]: type=${obj.type}, partIndex=${obj.partIndex}, points=${pts.length}${pts.length <= 6 ? ' [' + ptsStr + ']' : ' [' + pts.slice(0,3).map(p=>'('+p.x.toFixed(1)+','+p.y.toFixed(1)+')').join('→') + '...→' + pts.slice(-1).map(p=>'('+p.x.toFixed(1)+','+p.y.toFixed(1)+')').join('') + ']'}`);
            if (obj.type === 'circle') {
                console.log(`[DEBUG]     circle: cx=${obj.cx?.toFixed(1)}, cy=${obj.cy?.toFixed(1)}, r=${obj.radius?.toFixed(1)}`);
            }
        }
        console.log('[DEBUG] ═══════════════════════════════════════════════════');
        // ═══ КОНЕЦ DEBUG ═══

        buildPartToContoursMap();
        initPartOrder();

        renderPreview();
        updatePathCount();

    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
        showError('❌ Ошибка загрузки данных листа.\n' + e.message);
    }
}

/** Построить маппинг: индекс детали → массив индексов контуров в exportObjects */
function buildPartToContoursMap() {
    partToContoursMap = {};
    if (!sheetData || !sheetData.exportObjects) return;

    for (let i = 0; i < sheetData.exportObjects.length; i++) {
        const obj = sheetData.exportObjects[i];
        const pi = obj.partIndex !== undefined ? obj.partIndex : 0;
        if (!partToContoursMap[pi]) {
            partToContoursMap[pi] = [];
        }
        partToContoursMap[pi].push(i);
    }

    // Сортируем контуры внутри каждой детали: от меньших (внутренние) к большим (наружные)
    for (const pi in partToContoursMap) {
        partToContoursMap[pi].sort((a, b) => {
            const areaA = getContourArea(sheetData.exportObjects[a]);
            const areaB = getContourArea(sheetData.exportObjects[b]);
            return areaA - areaB; // меньшая площадь = внутренний контур = режется первым
        });

        // ═══ DEBUG: Логирование порядка контуров после сортировки ═══
        console.log(`[DEBUG] ══ Part ${pi}: контуров=${partToContoursMap[pi].length}, порядок после сортировки:`);
        partToContoursMap[pi].forEach((ci, sortIdx) => {
            const obj = sheetData.exportObjects[ci];
            const area = getContourArea(obj);
            const pts = obj.points || [];
            const label = sortIdx === partToContoursMap[pi].length - 1 ? '→ НАРУЖНЫЙ' : '';
            console.log(`[DEBUG]     [${sortIdx}] exportObj[${ci}] type=${obj.type} area=${area.toFixed(1)} pts=${pts.length}${label}`);
            if (pts.length > 0) {
                console.log(`[DEBUG]       start=(${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}) end=(${pts[pts.length-1].x.toFixed(1)},${pts[pts.length-1].y.toFixed(1)})`);
            }
        });
        // ═══ КОНЕЦ DEBUG ═══
    }
}

/** Вычислить площадь контура (bounding box) для сортировки внутренние → наружные */
function getContourArea(obj) {
    if (!obj) return 0;

    if (obj.type === 'circle') {
        const r = obj.radius || 0;
        return Math.PI * r * r;
    }

    if (obj.points && obj.points.length >= 2) {
        // Bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of obj.points) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return (maxX - minX) * (maxY - minY);
    }

    return 0;
}

function initPartOrder() {
    if (!sheetData || !sheetData.nestedParts) return;
    partOrder = sheetData.nestedParts.map((_, i) => i);
}

function showError(message) {
    const preview = document.querySelector('.preview-panel');
    preview.innerHTML = '<div class="error-message">' + message.replace(/\n/g, '<br>') + '</div>';
}

function backToApp() {
    window.close();
    window.location.href = 'index.html';
}

function updatePathCount() {
    const partCount = sheetData?.nestedParts?.length || 0;
    const contourCount = sheetData?.exportObjects?.length || 0;
    document.getElementById('pathCount').textContent = `Деталей: ${partCount} | Контуров: ${contourCount}`;
}

// ═══════════════════════════════════════════════════════════════
// Порядок деталей — логика
// ═══════════════════════════════════════════════════════════════

/** Получить массив exportObjects в текущем порядке (по деталям) */
function getOrderedExportObjects() {
    if (!sheetData || !sheetData.exportObjects) return [];

    const orderedParts = getOrderedPartIndices();

    // Разворачиваем: для каждой детали берём все её контуры
    const result = [];
    for (const partIdx of orderedParts) {
        const contourIndices = partToContoursMap[partIdx] || [];
        for (const ci of contourIndices) {
            result.push(sheetData.exportObjects[ci]);
        }
    }
    return result;
}

/** Получить массив индексов деталей в текущем порядке */
function getOrderedPartIndices() {
    if (!sheetData || !sheetData.nestedParts) return [];

    if (orderMode === 'optimize' && sheetData.nestedParts.length > 1) {
        return getOptimizedPartOrder();
    }

    if (orderMode === 'spiral-out' && sheetData.nestedParts.length > 1) {
        return getSpiralPartOrder('out');
    }

    if (orderMode === 'spiral-in' && sheetData.nestedParts.length > 1) {
        return getSpiralPartOrder('in');
    }

    if (orderMode === 'custom' && partOrder.length > 0) {
        return partOrder.filter(i => i < sheetData.nestedParts.length);
    }

    // original
    return sheetData.nestedParts.map((_, i) => i);
}

/**
 * Спиральный порядок деталей — от центра листа к краям (out) или наоборот (in).
 *
 * Алгоритм:
 *   1. Вычисляем центр листа (sheetW/2, sheetH/2)
 *   2. Для каждой детали находим её центр (np.x + np.width/2, np.y + np.height/2)
 *   3. Сортируем по расстоянию центра детали до центра листа:
 *      - 'out' — по возрастанию (ближайшие к центру первыми)
 *      - 'in'  — по убыванию (дальние от центра первыми)
 *
 * Дополнительно: для деталей на равном расстоянии — сортируем по углу
 * (atan2) относительно центра, чтобы создать спиральный эффект, а не
 * просто радиальные кольца.
 */
function getSpiralPartOrder(direction) {
    const parts = sheetData.nestedParts;
    const cx = (sheetData.sheetWidth || 0) / 2;
    const cy = (sheetData.sheetHeight || 0) / 2;

    // Собираем массив с индексом и полярными координатами центра детали
    const items = parts.map((p, i) => {
        const px = (p.x || 0) + (p.width || 0) / 2;
        const py = (p.y || 0) + (p.height || 0) / 2;
        const dx = px - cx;
        const dy = py - cy;
        const r = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx); // -π..π
        return { idx: i, r, theta };
    });

    // Сортировка:
    // - spiral-out: по возрастанию r (центр → край)
    // - spiral-in:  по убыванию r (край → центр)
    // При равном r (в пределах радиального кольца) — сортируем по углу,
    // создавая спиральный обход по часовой стрелке.
    const RING_TOLERANCE = 5.0; // мм — допуск "одного кольца" спирали
    const dir = direction === 'out' ? 1 : -1;

    items.sort((a, b) => {
        // Группируем в кольца: если r различается меньше чем на RING_TOLERANCE —
        // считаем что в одном кольце, сортируем по углу
        const rDiff = (a.r - b.r) * dir;
        if (Math.abs(a.r - b.r) > RING_TOLERANCE) {
            return rDiff; // разные кольца — приоритет по радиусу
        }
        // В пределах одного кольца — по углу (по часовой стрелке)
        return a.theta - b.theta;
    });

    return items.map(it => it.idx);
}

/** Алгоритм ближайшего соседа для деталей */
function getOptimizedPartOrder() {
    const parts = sheetData.nestedParts;
    const optimized = [];
    const remaining = parts.map((_, i) => i);
    let curX = 0, curY = 0;

    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const part = parts[remaining[i]];
            const start = getPartStartPoint(part);
            const d = Math.hypot(start.x - curX, start.y - curY);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }
        const chosenIdx = remaining.splice(bestIdx, 1)[0];
        optimized.push(chosenIdx);
        const endPt = getPartEndPoint(parts[chosenIdx]);
        curX = endPt.x;
        curY = endPt.y;
    }

    return optimized;
}

function getPartStartPoint(part) {
    return { x: part.x || 0, y: part.y || 0 };
}

function getPartEndPoint(part) {
    return { x: (part.x || 0) + (part.width || 0), y: (part.y || 0) + (part.height || 0) };
}

/** Переключение режима порядка */
function setOrderMode(mode) {
    orderMode = mode;

    document.getElementById('orderModeOriginal').classList.toggle('active', mode === 'original');
    document.getElementById('orderModeOptimize').classList.toggle('active', mode === 'optimize');
    document.getElementById('orderModeCustom').classList.toggle('active', mode === 'custom');
    document.getElementById('orderModeSpiralOut').classList.toggle('active', mode === 'spiral-out');
    document.getElementById('orderModeSpiralIn').classList.toggle('active', mode === 'spiral-in');

    const listContainer = document.getElementById('contourOrderListContainer');
    const hint = document.getElementById('contourOrderHint');
    const clickInfo = document.getElementById('clickOrderInfoContainer');

    if (mode === 'custom') {
        listContainer.style.display = 'block';
        hint.style.display = 'none';
        if (clickInfo) clickInfo.style.display = 'block';

        // При переходе в ручной режим — сбрасываем клик-порядок
        clickOrder = [];
        initPartOrder();

        renderPartOrderList();
        updateClickOrderInfo();
    } else {
        listContainer.style.display = 'none';
        hint.style.display = 'block';
        if (clickInfo) clickInfo.style.display = 'none';

        // Текст подсказки в зависимости от режима
        const hints = {
            'optimize': 'Порядок оптимизируется автоматически (ближайший сосед)',
            'spiral-out': '🎯 Резка идёт от центра листа по спирали наружу. Внутри каждого кольца — по часовой стрелке.',
            'spiral-in': '🌀 Резка идёт с краёв листа по спирали к центру. Внутри каждого кольца — по часовой стрелке.',
            'original': 'Выберите «Вручную» для изменения порядка резки деталей'
        };
        hint.textContent = hints[mode] || hints['original'];
        hoveredPartIdx = -1;
    }

    updateCanvasCursor();
    renderPreview();

    // Обновить подсказку на холсте
    const zoomHint = document.getElementById('zoomHint');
    if (zoomHint) {
        if (mode === 'custom') {
            zoomHint.textContent = 'Клик — выбрать деталь · Колёсико — зум · Перетаскивание — пан';
        } else {
            zoomHint.textContent = 'Колёсико — зум · Перетаскивание — пан · Двойной клик — сброс';
        }
    }
}

/** Отрисовать список деталей для перетаскивания */
function renderPartOrderList() {
    const list = document.getElementById('contourOrderList');
    if (!list || !sheetData || !sheetData.nestedParts) return;

    const parts = sheetData.nestedParts;

    list.innerHTML = partOrder.map((partIdx, listPos) => {
        const part = parts[partIdx];
        const contourCount = (partToContoursMap[partIdx] || []).length;
        const label = getPartLabel(part, partIdx, contourCount);
        const isClicked = clickOrder.includes(partIdx);
        const dimStyle = isClicked ? '' : 'opacity:0.45;';
        const icon = isClicked ? '✅' : '⬜';
        return `<li class="contour-order-item" draggable="true" data-list-pos="${listPos}" data-part-idx="${partIdx}" style="${dimStyle}">
            <span class="contour-order-num">${listPos + 1}</span>
            <span class="contour-order-icon">${icon}</span>
            <span class="contour-order-label">${escapeHtml(label)}</span>
            <div class="contour-order-btns">
                <button onclick="movePartUp(${listPos})" title="Выше" ${listPos === 0 ? 'disabled' : ''}>▲</button>
                <button onclick="movePartDown(${listPos})" title="Ниже" ${listPos === partOrder.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
        </li>`;
    }).join('');

    setupDragAndDrop(list);
}

function getPartLabel(part, partIdx, contourCount) {
    const w = (part.width || 0).toFixed(0);
    const h = (part.height || 0).toFixed(0);
    const contourWord = contourCount === 1 ? 'контур' : (contourCount >= 2 && contourCount <= 4) ? 'контура' : 'контуров';
    return `Деталь #${partIdx + 1}  ${w}×${h} мм  (${contourCount} ${contourWord})`;
}

function movePartUp(listPos) {
    if (listPos <= 0) return;
    [partOrder[listPos - 1], partOrder[listPos]] = [partOrder[listPos], partOrder[listPos - 1]];
    syncClickOrderFromPartOrder();
    renderPartOrderList();
    renderPreview();
}

function movePartDown(listPos) {
    if (listPos >= partOrder.length - 1) return;
    [partOrder[listPos], partOrder[listPos + 1]] = [partOrder[listPos + 1], partOrder[listPos]];
    syncClickOrderFromPartOrder();
    renderPartOrderList();
    renderPreview();
}

/** Синхронизировать clickOrder из partOrder (после перетаскивания/кнопок) */
function syncClickOrderFromPartOrder() {
    if (orderMode !== 'custom') return;
    clickOrder = [...partOrder];
}

function setupDragAndDrop(list) {
    const items = list.querySelectorAll('.contour-order-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragSrcIndex = parseInt(item.dataset.listPos);
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', dragSrcIndex);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            dragSrcIndex = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            const fromPos = dragSrcIndex;
            const toPos = parseInt(item.dataset.listPos);

            if (fromPos === null || fromPos === toPos) return;

            const moved = partOrder.splice(fromPos, 1)[0];
            partOrder.splice(toPos, 0, moved);

            syncClickOrderFromPartOrder();
            renderPartOrderList();
            renderPreview();
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// Зум и панорамирование
// ═══════════════════════════════════════════════════════════════

function worldToCanvas(wx, wy) {
    return {
        x: wx * viewScale + viewTranslateX,
        y: wy * viewScale + viewTranslateY
    };
}

function canvasToWorld(cx, cy) {
    return {
        x: (cx - viewTranslateX) / viewScale,
        y: (cy - viewTranslateY) / viewScale
    };
}

function resetView() {
    if (!sheetData || !sheetData.sheetWidth || !sheetData.sheetHeight) return;

    const canvas = document.getElementById('previewCanvas');
    const panel = document.querySelector('.preview-panel');
    const padding = 60;

    const canvasW = panel.clientWidth;
    const canvasH = panel.clientHeight;
    canvas.width = canvasW;
    canvas.height = canvasH;

    const fitScaleX = (canvasW - padding * 2) / sheetData.sheetWidth;
    const fitScaleY = (canvasH - padding * 2) / sheetData.sheetHeight;
    baseViewScale = Math.min(fitScaleX, fitScaleY);

    baseTranslateX = (canvasW - sheetData.sheetWidth * baseViewScale) / 2;
    baseTranslateY = (canvasH - sheetData.sheetHeight * baseViewScale) / 2;

    viewScale = baseViewScale;
    viewTranslateX = baseTranslateX;
    viewTranslateY = baseTranslateY;

    updateZoomLabel();
}

function zoomAtPoint(factor, cx, cy) {
    console.log('[GCODE-EDITOR] zoomAtPoint: factor=', factor, ', oldScale=', viewScale);
    const oldScale = viewScale;
    viewScale *= factor;

    const minScale = baseViewScale * 0.1;
    const maxScale = baseViewScale * 20;
    viewScale = Math.max(minScale, Math.min(maxScale, viewScale));

    console.log('[GCODE-EDITOR] zoomAtPoint: newScale=', viewScale, ', baseViewScale=', baseViewScale);

    const realFactor = viewScale / oldScale;
    viewTranslateX = cx - (cx - viewTranslateX) * realFactor;
    viewTranslateY = cy - (cy - viewTranslateY) * realFactor;

    updateZoomLabel();
    renderPreview();
}

function zoomIn() {
    const canvas = document.getElementById('previewCanvas');
    zoomAtPoint(1.3, canvas.width / 2, canvas.height / 2);
}

function zoomOut() {
    const canvas = document.getElementById('previewCanvas');
    zoomAtPoint(1 / 1.3, canvas.width / 2, canvas.height / 2);
}

function zoomReset() {
    resetView();
    renderPreview();
}

function updateZoomLabel() {
    const el = document.getElementById('zoomLevel');
    if (el && baseViewScale > 0) {
        const percent = Math.round((viewScale / baseViewScale) * 100);
        el.textContent = percent + '%';
    }
}

const CLICK_THRESHOLD = 5; // пикселей — если мышь сдвинулась меньше, это клик

function setupCanvasEvents() {
    const canvas = document.getElementById('previewCanvas');
    if (!canvas) {
        console.error('[GCODE-EDITOR] Canvas not found: previewCanvas');
        return;
    }

    console.log('[GCODE-EDITOR] setupCanvasEvents: canvas found, attaching wheel listener');

    canvas.addEventListener('wheel', (e) => {
        console.log('[GCODE-EDITOR] wheel event:', e.deltaY);
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        console.log('[GCODE-EDITOR] zooming:', factor, 'at', cx, cy);
        zoomAtPoint(factor, cx, cy);
    }, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;

        mouseDownPos = { x: e.clientX, y: e.clientY };
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartTranslateX = viewTranslateX;
        panStartTranslateY = viewTranslateY;

        if (orderMode !== 'custom') {
            canvas.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isPanning || !mouseDownPos) {
            // Обновляем подсветку детали под курсором в режиме «Вручную»
            if (orderMode === 'custom' && sheetData) {
                const rect = canvas.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const world = canvasToWorld(cx, cy);
                const newHovered = hitTestPart(world.x, world.y);
                if (newHovered !== hoveredPartIdx) {
                    hoveredPartIdx = newHovered;
                    renderPreview();
                }
            }
            return;
        }

        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;
        viewTranslateX = panStartTranslateX + dx;
        viewTranslateY = panStartTranslateY + dy;
        renderPreview();
    });

    window.addEventListener('mouseup', (e) => {
        if (isPanning && mouseDownPos) {
            const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);

            if (dist < CLICK_THRESHOLD && orderMode === 'custom' && sheetData) {
                // Это клик — выбираем деталь
                const rect = canvas.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const world = canvasToWorld(cx, cy);
                handlePartClick(world.x, world.y);
            }
        }

        isPanning = false;
        mouseDownPos = null;
        updateCanvasCursor();
    });

    updateCanvasCursor();

    canvas.addEventListener('dblclick', () => {
        zoomReset();
    });

    window.addEventListener('resize', () => {
        if (!sheetData) return;
        resetView();
        renderPreview();
    });
}

/** Определить, какой детали принадлежит точка (мировые координаты) */
function hitTestPart(wx, wy) {
    if (!sheetData || !sheetData.nestedParts) return -1;

    for (let i = 0; i < sheetData.nestedParts.length; i++) {
        const part = sheetData.nestedParts[i];
        const px = part.x || 0;
        const py = part.y || 0;
        const pw = part.width || 0;
        const ph = part.height || 0;

        if (wx >= px && wx <= px + pw && wy >= py && wy <= py + ph) {
            return i;
        }
    }
    return -1;
}

/** Обработка клика по детали в режиме «Вручную» */
function handlePartClick(wx, wy) {
    const partIdx = hitTestPart(wx, wy);
    if (partIdx < 0) return;

    // Если деталь уже выбрана — снимаем выделение (клик повторно)
    const existingPos = clickOrder.indexOf(partIdx);
    if (existingPos >= 0) {
        clickOrder.splice(existingPos, 1);
    } else {
        clickOrder.push(partIdx);
    }

    partOrder = [...clickOrder];

    // Добавляем невыбранные детали в конец (сохраняя исходный порядок)
    for (let i = 0; i < sheetData.nestedParts.length; i++) {
        if (!clickOrder.includes(i)) {
            partOrder.push(i);
        }
    }

    updateClickOrderInfo();
    renderPartOrderList();
    renderPreview();
}

/** Обновить информационный текст о выборе деталей */
function updateClickOrderInfo() {
    const infoEl = document.getElementById('clickOrderInfo');
    if (!infoEl) return;

    const total = sheetData?.nestedParts?.length || 0;
    const selected = clickOrder.length;

    if (selected === 0) {
        infoEl.textContent = 'Кликните по деталям на листе в нужном порядке';
        infoEl.style.color = '#888';
    } else if (selected < total) {
        infoEl.textContent = `Выбрано ${selected} из ${total} деталей — кликните по следующей`;
        infoEl.style.color = '#00d4aa';
    } else {
        infoEl.textContent = `Все ${total} деталей выбраны! Порядок установлен.`;
        infoEl.style.color = '#2ecc71';
    }
}

/** Сбросить порядок кликов */
function resetClickOrder() {
    clickOrder = [];
    initPartOrder();
    updateClickOrderInfo();
    renderPartOrderList();
    renderPreview();
}

/** Установить курсор в зависимости от режима */
function updateCanvasCursor() {
    const canvas = document.getElementById('previewCanvas');
    if (orderMode === 'custom') {
        canvas.style.cursor = hoveredPartIdx >= 0 ? 'pointer' : 'crosshair';
    } else {
        canvas.style.cursor = 'grab';
    }
}

// ═══════════════════════════════════════════════════════
// Отрисовка превью
// ═══════════════════════════════════════════════════════

function renderPreview() {
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');
    const panel = document.querySelector('.preview-panel');

    if (!sheetData || !sheetData.sheetWidth || !sheetData.sheetHeight) {
        canvas.width = panel.clientWidth;
        canvas.height = panel.clientHeight;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#999';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных для отображения', canvas.width / 2, canvas.height / 2);
        return;
    }

    if (viewScale === 0) {
        resetView();
    }

    canvas.width = panel.clientWidth;
    canvas.height = panel.clientHeight;

    // Очистка фона
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topLeft = worldToCanvas(0, 0);
    const bottomRight = worldToCanvas(sheetData.sheetWidth, sheetData.sheetHeight);

    const sheetX = topLeft.x;
    const sheetY = topLeft.y;
    const sheetW = bottomRight.x - topLeft.x;
    const sheetH = bottomRight.y - topLeft.y;

    // Рамка листа
    ctx.fillStyle = '#fff';
    ctx.fillRect(sheetX, sheetY, sheetW, sheetH);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(sheetX, sheetY, sheetW, sheetH);

    // Сетка
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 0.5;
    const gridStepMm = 100;
    for (let mmX = gridStepMm; mmX < sheetData.sheetWidth; mmX += gridStepMm) {
        const p1 = worldToCanvas(mmX, 0);
        const p2 = worldToCanvas(mmX, sheetData.sheetHeight);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    for (let mmY = gridStepMm; mmY < sheetData.sheetHeight; mmY += gridStepMm) {
        const p1 = worldToCanvas(0, mmY);
        const p2 = worldToCanvas(sheetData.sheetWidth, mmY);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // Подписи размеров
    ctx.fillStyle = '#666';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    const bottomCenter = worldToCanvas(sheetData.sheetWidth / 2, sheetData.sheetHeight);
    ctx.fillText(`${sheetData.sheetWidth} мм`, bottomCenter.x, bottomCenter.y + 20);
    ctx.save();
    const leftCenter = worldToCanvas(0, sheetData.sheetHeight / 2);
    ctx.translate(leftCenter.x - 15, leftCenter.y);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${sheetData.sheetHeight} мм`, 0, 0);
    ctx.restore();

    // Отрисовка контуров — с группировкой по деталям и цветами
    const orderedPartIndices = getOrderedPartIndices();
    const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4', '#ff5722'];
    const isCustomMode = orderMode === 'custom';

    if (sheetData.exportObjects && sheetData.exportObjects.length > 0) {
        for (let orderIdx = 0; orderIdx < orderedPartIndices.length; orderIdx++) {
            const partIdx = orderedPartIndices[orderIdx];
            const color = colors[orderIdx % colors.length];
            const contourIndices = partToContoursMap[partIdx] || [];
            const isClicked = isCustomMode && clickOrder.includes(partIdx);
            const isHovered = isCustomMode && hoveredPartIdx === partIdx;
            const notYetClicked = isCustomMode && !clickOrder.includes(partIdx);

            // В режиме «Вручную» невыбранные детали — полупрозрачные
            if (notYetClicked) {
                ctx.globalAlpha = 0.3;
            } else {
                ctx.globalAlpha = 1.0;
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = isHovered ? 3 : (isClicked ? 2 : 1.5);

            for (const ci of contourIndices) {
                const obj = sheetData.exportObjects[ci];
                drawObject(ctx, obj);
            }

            // Подсветка bounding box при наведении
            if (isHovered && sheetData.nestedParts[partIdx]) {
                const part = sheetData.nestedParts[partIdx];
                const tl = worldToCanvas(part.x || 0, part.y || 0);
                const br = worldToCanvas((part.x || 0) + (part.width || 0), (part.y || 0) + (part.height || 0));
                ctx.strokeStyle = '#00d4aa';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(tl.x - 3, tl.y - 3, br.x - tl.x + 6, br.y - tl.y + 6);
                ctx.setLineDash([]);
                ctx.strokeStyle = color;
            }

            // Номер детали — крупный бейдж для выбранных, мелкий для нет
            if (contourIndices.length > 0) {
                const part = sheetData.nestedParts[partIdx];
                const centerX = (part.x || 0) + (part.width || 0) / 2;
                const centerY = (part.y || 0) + (part.height || 0) / 2;
                const cp = worldToCanvas(centerX, centerY);

                if (isClicked) {
                    // Большой бейдж с номером
                    const clickPos = clickOrder.indexOf(partIdx);
                    const badgeSize = 16;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(cp.x, cp.y, badgeSize, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 14px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${clickPos + 1}`, cp.x, cp.y);
                    ctx.textBaseline = 'alphabetic';
                } else if (notYetClicked) {
                    // Маленький знак «?» или просто точка
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('?', cp.x, cp.y + 4);
                } else {
                    // Обычный номер в не-ручном режиме
                    const firstObj = sheetData.exportObjects[contourIndices[0]];
                    const sp = getStartPoint(firstObj);
                    const sp2 = worldToCanvas(sp.x, sp.y);
                    ctx.fillStyle = color;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(`${orderIdx + 1}`, sp2.x + 6, sp2.y - 6);
                }
            }

            ctx.globalAlpha = 1.0;
        }

        const labelPos = worldToCanvas(0, 0);
        ctx.fillStyle = '#007acc';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        if (isCustomMode && clickOrder.length > 0) {
            ctx.fillText(`Выбрано: ${clickOrder.length} / ${sheetData.nestedParts.length} деталей`, labelPos.x, labelPos.y - 10);
        } else if (isCustomMode && clickOrder.length === 0) {
            ctx.fillText(`Кликните по деталям для задания порядка резки`, labelPos.x, labelPos.y - 10);
        } else {
            ctx.fillText(`Деталей: ${orderedPartIndices.length} | Контуров: ${sheetData.exportObjects.length}`, labelPos.x, labelPos.y - 10);
        }
    }

    // ═══ Подсветка контура, выбранного в G-code ═══
    if (highlightedPathIdx > 0 && gcodeLineMap.length > 0 && sheetData.exportObjects) {
        // Находим exportIndex для этого pathIndex
        let targetExportIdx = -1;
        let targetPartIdx = -1;
        for (const info of gcodeLineMap) {
            if (info.pathIndex === highlightedPathIdx && info.exportIndex >= 0) {
                targetExportIdx = info.exportIndex;
                targetPartIdx = info.partIndex;
                break;
            }
        }

        if (targetExportIdx >= 0 && targetExportIdx < sheetData.exportObjects.length) {
            const obj = sheetData.exportObjects[targetExportIdx];

            // Затемнить всё, кроме выбранной детали
            ctx.globalAlpha = 0.15;
            ctx.fillStyle = '#000';
            ctx.fillRect(sheetX, sheetY, sheetW, sheetH);
            ctx.globalAlpha = 1.0;

            // Перерисовать контуры этой детали (полупрозрачно, без выделенного)
            const contourIndices = partToContoursMap[targetPartIdx] || [];
            for (const ci of contourIndices) {
                if (ci === targetExportIdx) continue;
                ctx.strokeStyle = '#aaa';
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.4;
                drawObject(ctx, sheetData.exportObjects[ci]);
            }
            ctx.globalAlpha = 1.0;

            // Нарисовать выбранный контур с эффектом свечения
            ctx.save();
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 4;
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 18;
            drawObject(ctx, obj);

            // Ещё раз для усиления свечения
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2.5;
            drawObject(ctx, obj);
            ctx.restore();

            // Бейдж с номером контура
            const points = getObjectPoints(obj);
            if (points.length > 0) {
                const sp = worldToCanvas(points[0].x, points[0].y);
                ctx.fillStyle = '#00ff88';
                ctx.shadowColor = '#00ff88';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#000';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${highlightedPathIdx}`, sp.x, sp.y);
                ctx.textBaseline = 'alphabetic';
            }

            // Метка типа контура (внутренний/наружный)
            if (contourIndices.length > 1) {
                const posInPart = contourIndices.indexOf(targetExportIdx);
                const label = posInPart === contourIndices.length - 1 ? 'НАРУЖНЫЙ' : `Внутренний ${posInPart + 1}`;
                if (points.length > 0) {
                    const sp = worldToCanvas(points[0].x, points[0].y);
                    ctx.fillStyle = '#00ff88';
                    ctx.font = 'bold 11px Arial';
                    ctx.textAlign = 'left';
                    ctx.fillText(label, sp.x + 14, sp.y + 4);
                }
            }
        }
    }

    // Начало координат
    const origin = worldToCanvas(0, 0);
    ctx.strokeStyle = '#00d4aa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(origin.x - 8, origin.y);
    ctx.lineTo(origin.x + 8, origin.y);
    ctx.moveTo(origin.x, origin.y - 8);
    ctx.lineTo(origin.x, origin.y + 8);
    ctx.stroke();

    // v4.54: Линейка (миллиметровая шкала по краям)
    if (showRuler && sheetData) {
        drawRuler(ctx);
    }

    // v4.54: Номера порядка резки (крупные бейджи в центре каждой детали)
    if (showOrderNumbers && sheetData && sheetData.nestedParts) {
        const orderedPartIndices = getOrderedPartIndices();
        for (let orderIdx = 0; orderIdx < orderedPartIndices.length; orderIdx++) {
            const partIdx = orderedPartIndices[orderIdx];
            const part = sheetData.nestedParts[partIdx];
            if (!part) continue;
            const cx = (part.x || 0) + (part.width || 0) / 2;
            const cy = (part.y || 0) + (part.height || 0) / 2;
            const cp = worldToCanvas(cx, cy);

            // Крупный бейдж с номером
            ctx.save();
            ctx.fillStyle = colors[orderIdx % colors.length];
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.shadowColor = colors[orderIdx % colors.length];
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(cp.x, cp.y, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${orderIdx + 1}`, cp.x, cp.y);
            ctx.textBaseline = 'alphabetic';
            ctx.restore();
        }
    }
}

/**
 * v4.54: Отрисовка миллиметровой линейки по верхнему и левому краям холста.
 * Метки каждые 10мм (мелкие), 50мм (средние), 100мм (крупные с подписью).
 */
function drawRuler(ctx) {
    if (!sheetData) return;
    const w = sheetData.sheetWidth;
    const h = sheetData.sheetHeight;

    ctx.save();
    ctx.strokeStyle = '#00d4aa';
    ctx.fillStyle = '#00d4aa';
    ctx.lineWidth = 0.5;
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Верхняя линейка (по оси X)
    for (let x = 0; x <= w; x += 10) {
        const p = worldToCanvas(x, 0);
        let tickLen;
        if (x % 100 === 0) tickLen = 12;
        else if (x % 50 === 0) tickLen = 8;
        else tickLen = 4;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y - tickLen);
        ctx.stroke();

        // Подписи каждые 100мм
        if (x % 100 === 0 && x > 0) {
            ctx.fillText(`${x}`, p.x, p.y - 18);
        }
    }

    // Левая линейка (по оси Y)
    for (let y = 0; y <= h; y += 10) {
        const p = worldToCanvas(0, y);
        let tickLen;
        if (y % 100 === 0) tickLen = 12;
        else if (y % 50 === 0) tickLen = 8;
        else tickLen = 4;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - tickLen, p.y);
        ctx.stroke();

        // Подписи каждые 100мм
        if (y % 100 === 0 && y > 0) {
            ctx.save();
            ctx.translate(p.x - 18, p.y);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${y}`, 0, 0);
            ctx.restore();
        }
    }
    ctx.restore();
}

function drawObject(ctx, obj) {
    if (!obj) return;
    ctx.beginPath();

    if (obj.type === 'line' && obj.points && obj.points.length >= 2) {
        const p0 = worldToCanvas(obj.points[0].x, obj.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < obj.points.length; i++) {
            const pi = worldToCanvas(obj.points[i].x, obj.points[i].y);
            ctx.lineTo(pi.x, pi.y);
        }
        ctx.stroke();
    } else if ((obj.type === 'rect' || obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'arc' || obj.type === 'spline' || obj.type === 'ellipse') && obj.points && obj.points.length >= 2) {
        const p0 = worldToCanvas(obj.points[0].x, obj.points[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < obj.points.length; i++) {
            const pi = worldToCanvas(obj.points[i].x, obj.points[i].y);
            ctx.lineTo(pi.x, pi.y);
        }
        // v4.53: Замыкаем контур если:
        //  - rect/polygon — всегда (геометрически замкнутые)
        //  - circle — handled в отдельной ветке
        //  - polyline/spline/ellipse/arc — замыкаем если obj.closed === true
        //    И последняя точка ≠ первая (иначе уже замкнут)
        // Раньше polyline всегда игнорировалась → missing closing line on canvas
        const first = obj.points[0];
        const last = obj.points[obj.points.length - 1];
        const geometricallyOpen = Math.abs(first.x - last.x) > 0.01 || Math.abs(first.y - last.y) > 0.01;

        let shouldClose = false;
        if (obj.type === 'rect' || obj.type === 'polygon') {
            shouldClose = true;
        } else if (obj.type === 'polyline' || obj.type === 'arc' || obj.type === 'spline' || obj.type === 'ellipse') {
            shouldClose = (obj.closed === true) && geometricallyOpen;
        }

        if (shouldClose) {
            ctx.closePath();
        }
        ctx.stroke();
    } else if (obj.type === 'circle') {
        const center = worldToCanvas(obj.cx, obj.cy);
        const edge = worldToCanvas(obj.cx + obj.radius, obj.cy);
        const rPx = Math.abs(edge.x - center.x);
        ctx.arc(center.x, center.y, rPx, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// ═══════════════════════════════════════════════════════
// СИМУЛЯЦИЯ ЛАЗЕРНОЙ РЕЗКИ
// ═══════════════════════════════════════════════════════

let isSimulating = false;
let simulationCancel = false;
let isPaused = false;
let pauseResolve = null;

function togglePause() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (!isSimulating) return;

    if (isPaused) {
        isPaused = false;
        pauseBtn.textContent = '⏸ Пауза';
        pauseBtn.className = 'btn btn-pause';
        document.getElementById('statusInfo').textContent =
            document.getElementById('statusInfo').textContent.replace(' [ПАУЗА]', '');
        if (pauseResolve) {
            pauseResolve();
            pauseResolve = null;
        }
    } else {
        isPaused = true;
        pauseBtn.textContent = '▶ Продолжить';
        pauseBtn.className = 'btn btn-resume';
        const statusEl = document.getElementById('statusInfo');
        if (!statusEl.textContent.includes('[ПАУЗА]')) {
            statusEl.textContent += ' [ПАУЗА]';
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            if (isPaused) {
                pauseResolve = () => { resolve(); };
            } else {
                resolve();
            }
        }, ms);
    });
}

async function simulateCutting() {
    if (isSimulating) {
        simulationCancel = true;
        if (isPaused && pauseResolve) {
            isPaused = false;
            pauseResolve();
            pauseResolve = null;
        }
        return;
    }

    if (!sheetData || !sheetData.exportObjects || sheetData.exportObjects.length === 0) {
        alert('⚠️ Нет контуров для симуляции.');
        return;
    }

    if (!generatedGcode || gcodeLineMap.length === 0) {
        alert('⚠️ Сначала сгенерируйте G-code, нажав кнопку «Сгенерировать G-code»');
        return;
    }

    isSimulating = true;
    simulationCancel = false;
    isPaused = false;

    const canvas = document.getElementById('previewCanvas');
    canvas.style.cursor = 'default';

    const btn = document.getElementById('simulateBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    btn.textContent = '⏹ Остановить';
    btn.style.background = '#555';
    pauseBtn.disabled = false;
    pauseBtn.textContent = '⏸ Пауза';
    pauseBtn.className = 'btn btn-pause';

    const ctx = canvas.getContext('2d');
    renderPreview();

    // Берём объекты в текущем порядке
    const orderedObjects = getOrderedExportObjects();

    // ═══ DEBUG: Логирование порядка симуляции ═══
    console.log('[DEBUG] ═══════════════════════════════════════════════════');
    console.log(`[DEBUG] СИМУЛЯЦИЯ: объектов в порядке резки=${orderedObjects.length}`);
    for (let i = 0; i < orderedObjects.length; i++) {
        const obj = orderedObjects[i];
        const pts = getObjectPoints(obj);
        const part = sheetData.nestedParts[obj.partIndex] || {};
        console.log(`[DEBUG]   [${i}] type=${obj.type} partIndex=${obj.partIndex} pts=${pts.length} partPos=(${(part.x||0).toFixed(1)},${(part.y||0).toFixed(1)})`);
        if (pts.length > 0) {
            console.log(`[DEBUG]         start=(${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}) end=(${pts[pts.length-1].x.toFixed(1)},${pts[pts.length-1].y.toFixed(1)})`);
        }
    }
    console.log('[DEBUG] ═══════════════════════════════════════════════════');
    // ═══ КОНЕЦ DEBUG ═══

    const allPaths = [];
    for (const obj of orderedObjects) {
        const pts = getObjectPoints(obj);
        if (pts.length > 0) {
            // v4.53: сохраняем флаг closed для корректной отрисовки/симуляции
            allPaths.push({ type: obj.type, points: pts, partIndex: obj.partIndex, closed: obj.closed });
        }
    }

    if (allPaths.length === 0) {
        alert('⚠️ Нет точек для симуляции');
        isSimulating = false;
        isPaused = false;
        btn.textContent = '▶ Симуляция резки';
        btn.style.background = '';
        pauseBtn.disabled = true;
        canvas.style.cursor = 'grab';
        return;
    }

    const simSpeedFactor = parseFloat(document.getElementById('simSpeed').value) || 1.0;
    const baseSpeed = 2000;
    const speedPxPerSec = baseSpeed * simSpeedFactor;

    // Рисуем все контуры полупрозрачно
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 1.5;
    for (const path of allPaths) {
        drawSimPath(ctx, path);
    }
    ctx.globalAlpha = 1.0;

    let totalDistance = 0;
    let currentPartOrderIdx = -1;

    for (let pi = 0; pi < allPaths.length; pi++) {
        if (simulationCancel) break;

        const path = allPaths[pi];
        const pts = path.points;
        if (pts.length < 2) continue;

        // Определяем порядковый номер детали
        const partIdx = path.partIndex !== undefined ? path.partIndex : 0;
        const orderedPartIndices = getOrderedPartIndices();
        const partOrderIdx = orderedPartIndices.indexOf(partIdx);

        // ═══ DEBUG: Логирование хода луча ═══
        const part = sheetData.nestedParts[partIdx] || {};
        console.log(`[DEBUG] СИМ: Контур ${pi+1}/${allPaths.length} type=${path.type} partIdx=${partIdx} partPos=(${(part.x||0).toFixed(1)},${(part.y||0).toFixed(1)})`);
        console.log(`[DEBUG]   ЛУЧ СТАРТ: (${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}) → ЛУЧ КОНЕЦ: (${pts[pts.length-1].x.toFixed(2)},${pts[pts.length-1].y.toFixed(2)})`);
        if (pts.length <= 8) {
            console.log(`[DEBUG]   Траектория: ${pts.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' → ')}`);
        } else {
            console.log(`[DEBUG]   Траектория: (${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}) → (${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}) → ...${pts.length-3} точек... → (${pts[pts.length-2].x.toFixed(1)},${pts[pts.length-2].y.toFixed(1)}) → (${pts[pts.length-1].x.toFixed(1)},${pts[pts.length-1].y.toFixed(1)})`);
        }
        // ═══ КОНЕЦ DEBUG ═══

        highlightGcodePath(pi + 1);

        // Показываем информацию о детали
        const partLabel = partOrderIdx >= 0 ? `Деталь ${partOrderIdx + 1}` : `Контур ${pi + 1}`;
        document.getElementById('statusInfo').textContent =
            `${partLabel} | Контур ${pi + 1} / ${allPaths.length} (${path.type}) | ×${simSpeedFactor.toFixed(1)}`;

        const startCanvas = worldToCanvas(pts[0].x, pts[0].y);
        let currentX = startCanvas.x;
        let currentY = startCanvas.y;

        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        await sleep(300 / simSpeedFactor);
        if (simulationCancel) break;

        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#ff6666';
        ctx.shadowBlur = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 1; i < pts.length; i++) {
            if (simulationCancel) break;

            const nextCanvas = worldToCanvas(pts[i].x, pts[i].y);
            const nextX = nextCanvas.x;
            const nextY = nextCanvas.y;

            const dist = Math.hypot(nextX - currentX, nextY - currentY);
            const duration = dist / speedPxPerSec;
            const steps = Math.max(1, Math.floor(duration * 60));
            const stepDuration = (duration * 1000) / steps;

            for (let s = 1; s <= steps; s++) {
                if (simulationCancel) break;
                const t = s / steps;
                const prevT = (s - 1) / steps;
                const fromX = currentX + (nextX - currentX) * prevT;
                const fromY = currentY + (nextY - currentY) * prevT;
                const toX = currentX + (nextX - currentX) * t;
                const toY = currentY + (nextY - currentY) * t;

                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(toX, toY, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 4;

                await sleep(stepDuration);
            }

            currentX = nextX;
            currentY = nextY;
            totalDistance += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        }

        if (path.type !== 'line' && !simulationCancel) {
            const firstCanvas = worldToCanvas(pts[0].x, pts[0].y);
            const closeX = firstCanvas.x;
            const closeY = firstCanvas.y;

            const dist = Math.hypot(closeX - currentX, closeY - currentY);

            // v4.53: замыкаем только если:
            //  - rect/polygon/circle — всегда
            //  - polyline/arc/spline/ellipse — только если path.closed === true
            //  - геометрически уже замкнут (dist < 0.01мм) — пропускаем замыкание
            let shouldSimClose = false;
            if (path.type === 'rect' || path.type === 'polygon' || path.type === 'circle') {
                shouldSimClose = true;
            } else if (path.type === 'polyline' || path.type === 'arc' || path.type === 'spline' || path.type === 'ellipse') {
                shouldSimClose = (path.closed === true);
            }
            // Если уже на стартовой точке — замыкание не нужно
            if (dist < 0.01) shouldSimClose = false;

            if (!shouldSimClose) {
                // Пропускаем анимацию замыкания
            } else {
            const duration = dist / speedPxPerSec;
            const steps = Math.max(1, Math.floor(duration * 60));
            const stepDuration = (duration * 1000) / steps;

            for (let s = 1; s <= steps; s++) {
                if (simulationCancel) break;
                const t = s / steps;
                const prevT = (s - 1) / steps;
                const fromX = currentX + (closeX - currentX) * prevT;
                const fromY = currentY + (closeY - currentY) * prevT;
                const toX = currentX + (closeX - currentX) * t;
                const toY = currentY + (closeY - currentY) * t;

                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                ctx.lineTo(toX, toY);
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.shadowColor = '#ff0000';
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(toX, toY, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 4;

                await sleep(stepDuration);
            }
            } // end else (shouldSimClose)
        }

        ctx.shadowBlur = 0;
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        if (pi < allPaths.length - 1) {
            await sleep(200 / simSpeedFactor);
        }
    }

    if (!simulationCancel) {
        document.getElementById('statusInfo').textContent =
            `✅ Готово | Контуров: ${allPaths.length} | Путь: ${Math.round(totalDistance)} мм`;
        setTimeout(() => renderPreview(), 600);
    } else {
        document.getElementById('statusInfo').textContent = 'Симуляция остановлена';
    }

    document.querySelectorAll('.gcode-line').forEach(el => el.classList.remove('active'));

    isSimulating = false;
    isPaused = false;
    btn.textContent = '▶ Симуляция резки';
    btn.style.background = '';
    pauseBtn.disabled = true;
    pauseBtn.textContent = '⏸ Пауза';
    pauseBtn.className = 'btn btn-pause';
    canvas.style.cursor = 'grab';
}

function drawSimPath(ctx, path) {
    const pts = path.points;
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    const p0 = worldToCanvas(pts[0].x, pts[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
        const pi = worldToCanvas(pts[i].x, pts[i].y);
        ctx.lineTo(pi.x, pi.y);
    }
    // v4.53: замыкаем по тем же правилам, что и в drawObject
    // rect/polygon — всегда; polyline/arc/spline/ellipse — только если path.closed === true
    // и геометрически открыт (последняя ≠ первая)
    const first = pts[0];
    const last = pts[pts.length - 1];
    const geometricallyOpen = Math.abs(first.x - last.x) > 0.01 || Math.abs(first.y - last.y) > 0.01;
    let shouldClose = false;
    if (path.type === 'rect' || path.type === 'polygon') {
        shouldClose = true;
    } else if (path.type === 'polyline' || path.type === 'arc' || path.type === 'spline' || path.type === 'ellipse') {
        shouldClose = (path.closed === true) && geometricallyOpen;
    }
    if (shouldClose) {
        ctx.closePath();
    }
    ctx.stroke();
}

// ═══════════════════════════════════════════════════════
// Генерация G-code
// ═══════════════════════════════════════════════════════

let gcodeLineMap = [];      // { pathIndex, type, partIndex, exportIndex }
let highlightedPathIdx = -1; // индекс pathIndex для подсветки контура на холсте

function generateGcode() {
    if (!sheetData || !sheetData.exportObjects) {
        alert('❌ Нет данных для генерации G-code');
        return;
    }

    const settings = {
        cutSpeed: parseFloat(document.getElementById('cutSpeed').value) || 3000,
        moveSpeed: parseFloat(document.getElementById('moveSpeed').value) || 5000,
        laserPower: parseFloat(document.getElementById('laserPower').value) || 80,
        pulseFrequency: parseFloat(document.getElementById('pulseFrequency').value) || 5000,
        nozzleHeight: parseFloat(document.getElementById('nozzleHeight').value) || 1.0,
        useLeadIn: document.getElementById('useLeadIn').checked,
        leadInLength: parseFloat(document.getElementById('leadInLength').value) || 5,
        addComments: document.getElementById('addComments').checked
    };

    let gcode = [];
    gcodeLineMap = [];

    function addLine(text, pathIdx = -1, pathType = '', partIdx = -1, expIdx = -1) {
        gcode.push(text);
        gcodeLineMap.push({ pathIndex: pathIdx, type: pathType, partIndex: partIdx, exportIndex: expIdx });
    }

    // Заголовок
    addLine('%');
    addLine('(Cutsy CAD PRO - G-code для лазерной резки)');
    addLine(`(Дата: ${new Date().toLocaleString('ru-RU')})`);
    addLine(`(Лист: ${sheetData.sheetWidth} x ${sheetData.sheetHeight} мм)`);
    addLine(`(Деталей: ${sheetData.nestedParts.length})`);
    const modeLabel = orderMode === 'optimize' ? 'оптимизация'
        : orderMode === 'custom' ? 'ручной'
        : orderMode === 'spiral-out' ? 'спираль от центра'
        : orderMode === 'spiral-in' ? 'спираль к центру'
        : 'исходный';
    addLine(`(Порядок деталей: ${modeLabel})`);
    addLine('');

    // Настройки станка
    addLine('(=== НАСТРОЙКИ СТАНКА ===)', -1, 'comment');
    addLine('G21 (Единицы: миллиметры)');
    addLine('G90 (Абсолютные координаты)');
    addLine('G17 (Плоскость XY)');
    addLine('');

    // Параметры лазера
    addLine('(=== ПАРАМЕТРЫ ЛАЗЕРА ===)', -1, 'comment');
    addLine(`(Мощность лазера: ${settings.laserPower}%)`);
    addLine(`(Частота импульсов: ${settings.pulseFrequency} Hz)`);
    addLine(`(Высота сопла: ${settings.nozzleHeight} мм)`);
    addLine('M5 (Лазер ВЫКЛ — безопасное начальное состояние)');
    addLine('');

    // Быстрое перемещение в начало
    addLine('(=== НАЧАЛО РАБОТЫ ===)', -1, 'comment');
    addLine('G0 Z10 (Подъём сопла)');
    addLine(`G0 X0 Y0 F${settings.moveSpeed} (Быстрое перемещение в начало)`);
    addLine(`G0 Z${settings.nozzleHeight} (Рабочая высота)`);
    addLine('');

    // Берём объекты в текущем порядке (по деталям)
    const orderedPartIndices = getOrderedPartIndices();
    let pathIndex = 0;

    // ═══ DEBUG: Логирование порядка генерации G-code ═══
    console.log('[DEBUG] ═══════════════════════════════════════════════════');
    console.log(`[DEBUG] G-CODE ГЕНЕРАЦИЯ: режим=${modeLabel}, деталей=${orderedPartIndices.length}`);
    console.log('[DEBUG] Порядок деталей:', orderedPartIndices.map((pi, oi) => `#${pi}(orderIdx=${oi})`).join(' → '));
    // ═══ КОНЕЦ DEBUG ═══

    for (let orderIdx = 0; orderIdx < orderedPartIndices.length; orderIdx++) {
        const partIdx = orderedPartIndices[orderIdx];
        const part = sheetData.nestedParts[partIdx];
        const contourIndices = partToContoursMap[partIdx] || [];

        // ═══ DEBUG: Логирование детали ═══
        console.log(`[DEBUG] ── ДЕТАЛЬ orderIdx=${orderIdx} partIdx=${partIdx}: pos=(${(part.x||0).toFixed(1)},${(part.y||0).toFixed(1)}), size=${(part.width||0).toFixed(1)}×${(part.height||0).toFixed(1)}, контуров=${contourIndices.length}`);
        // ═══ КОНЕЦ DEBUG ═══

        if (settings.addComments && contourIndices.length > 0) {
            const w = (part.width || 0).toFixed(0);
            const h = (part.height || 0).toFixed(0);
            addLine(`(=== ДЕТАЛЬ ${orderIdx + 1}  ${w}×${h} мм  (${contourIndices.length} конт.) ===)`, -1, 'comment', partIdx, -1);
        }

        for (const ci of contourIndices) {
            const obj = sheetData.exportObjects[ci];
            pathIndex++;

            // ═══ DEBUG: Логирование контура ═══
            const _dbgPts = getObjectPoints(obj);
            const _dbgArea = getContourArea(obj);
            const _dbgIdx = contourIndices.indexOf(ci);
            const _dbgLabel = _dbgIdx === contourIndices.length - 1 ? 'НАРУЖНЫЙ' : `Внутренний ${_dbgIdx + 1}`;
            console.log(`[DEBUG]   Контур ${pathIndex}: exportObj[${ci}] type=${obj.type} area=${_dbgArea.toFixed(1)} pts=${_dbgPts.length} [${_dbgLabel}]`);
            if (_dbgPts.length > 0) {
                console.log(`[DEBUG]     start=(${_dbgPts[0].x.toFixed(2)},${_dbgPts[0].y.toFixed(2)}) → end=(${_dbgPts[_dbgPts.length-1].x.toFixed(2)},${_dbgPts[_dbgPts.length-1].y.toFixed(2)})`);
            }
            // ═══ КОНЕЦ DEBUG ═══

            if (settings.addComments) {
                addLine(`(--- Контур ${pathIndex} [${obj.type}] ---)`, pathIndex, 'comment', partIdx, ci);
            }

            const points = getObjectPoints(obj);
            if (points.length === 0) continue;

            const startPoint = points[0];

            // Lead-in
            if (settings.useLeadIn && settings.leadInLength > 0 && points.length > 1) {
                const leadInPoint = calculateLeadIn(startPoint, points[1], settings.leadInLength, true);
                // DEBUG
                console.log(`[DEBUG]     → G0 RAPID к lead-in (${toFixed(leadInPoint.x)},${toFixed(leadInPoint.y)})`);
                console.log(`[DEBUG]     → M3 ЛАЗЕР ВКЛ`);
                console.log(`[DEBUG]     → G1 РЕЗКА к start (${toFixed(startPoint.x)},${toFixed(startPoint.y)})`);
                addLine(`G0 X${toFixed(leadInPoint.x)} Y${toFixed(leadInPoint.y)} F${settings.moveSpeed}`, pathIndex, 'move', partIdx, ci);
                addLine(`M3 S${settings.laserPower} (Лазер ВКЛ, мощность ${settings.laserPower}%)`, pathIndex, 'laser-on', partIdx, ci);
                addLine('G4 P0.1 (Пауза 0.1с)', pathIndex, 'pause', partIdx, ci);
                addLine(`G1 X${toFixed(startPoint.x)} Y${toFixed(startPoint.y)} F${settings.cutSpeed}`, pathIndex, 'cut', partIdx, ci);
            } else {
                // DEBUG
                console.log(`[DEBUG]     → G0 RAPID к start (${toFixed(startPoint.x)},${toFixed(startPoint.y)})`);
                console.log(`[DEBUG]     → M3 ЛАЗЕР ВКЛ`);
                addLine(`G0 X${toFixed(startPoint.x)} Y${toFixed(startPoint.y)} F${settings.moveSpeed}`, pathIndex, 'move', partIdx, ci);
                addLine(`M3 S${settings.laserPower} (Лазер ВКЛ, мощность ${settings.laserPower}%)`, pathIndex, 'laser-on', partIdx, ci);
                addLine('G4 P0.1 (Пауза 0.1с)', pathIndex, 'pause', partIdx, ci);
            }

            // Основной контур
            for (let i = 1; i < points.length; i++) {
                // DEBUG: логируем только первый и последний отрезок
                if (i === 1 || i === points.length - 1) {
                    console.log(`[DEBUG]     → G1 РЕЗКА pt[${i}]=(${toFixed(points[i].x)},${toFixed(points[i].y)})`);
                } else if (i === 2) {
                    console.log(`[DEBUG]     → G1 РЕЗКА ...ещё ${points.length - 3} отрезков...`);
                }
                addLine(`G1 X${toFixed(points[i].x)} Y${toFixed(points[i].y)} F${settings.cutSpeed}`, pathIndex, 'cut', partIdx, ci);
            }

            // Замыкание контура (возврат в стартовую точку)
            // v4.53: Учитываем obj.closed — gcode-export.js force-closes почти-замкнутые
            //         полилинии (gap < max(5мм, 15% диагонали)), выставляя closed=true.
            //         Раньше polyline игнорировала closed →missing closing line.
            //
            // Логика:
            //  - rect/polygon/circle — всегда замкнутые → замыкаем
            //  - polyline/spline/ellipse/arc — замыкаем если obj.closed === true
            //    И последняя точка не совпадает с первой (иначе уже замкнут геометрически)
            //  - line — никогда не замыкаем (отрезок по определению незамкнут)
            let needClose = false;
            const lastPt = points[points.length - 1];
            const gapToStart = Math.hypot(lastPt.x - startPoint.x, lastPt.y - startPoint.y);
            const geometricallyOpen = gapToStart > 0.01;

            if (obj.type === 'rect' || obj.type === 'polygon' || obj.type === 'circle') {
                needClose = true;
            } else if (obj.type === 'polyline' || obj.type === 'spline' || obj.type === 'ellipse' || obj.type === 'arc') {
                // Замыкаем только если контур помечен как closed И точки не образуют
                // уже замкнутый путь (последняя ≠ первая)
                if (obj.closed === true && geometricallyOpen) {
                    needClose = true;
                }
            }
            if (needClose) {
                console.log(`[DEBUG]     → G1 ЗАМЫКАНИЕ к start (${toFixed(startPoint.x)},${toFixed(startPoint.y)})`);
                addLine(`G1 X${toFixed(startPoint.x)} Y${toFixed(startPoint.y)} F${settings.cutSpeed}`, pathIndex, 'cut', partIdx, ci);
            }

            // Lead-out
            if (settings.useLeadIn && settings.leadInLength > 0 && points.length > 1) {
                const lastPt = points[points.length - 1];
                const prevPt = points[points.length - 2];
                const leadOutPoint = calculateLeadIn(lastPt, prevPt, settings.leadInLength, true);
                console.log(`[DEBUG]     → G1 LEAD-OUT к (${toFixed(leadOutPoint.x)},${toFixed(leadOutPoint.y)})`);
                addLine(`G1 X${toFixed(leadOutPoint.x)} Y${toFixed(leadOutPoint.y)} F${settings.cutSpeed}`, pathIndex, 'cut', partIdx, ci);
            }

            console.log(`[DEBUG]     → M5 ЛАЗЕР ВЫКЛ + G0 Z10 ПОДЪЁМ`);
            addLine('M5 (Лазер ВЫКЛ)', pathIndex, 'laser-off', partIdx, ci);
            addLine('G0 Z10 (Подъём сопла)', pathIndex, 'move', partIdx, ci);
            addLine('', pathIndex, '', partIdx, ci);
        }
    }

    // DEBUG: Итого
    console.log(`[DEBUG] G-CODE сгенерирован: ${pathIndex} контуров, ${gcode.length} строк`);
    console.log('[DEBUG] ═══════════════════════════════════════════════════');

    // Завершение
    addLine('(=== ЗАВЕРШЕНИЕ ===)', -1, 'comment');
    addLine('G0 Z50 (Безопасная высота)');
    addLine('G0 X0 Y0 F' + settings.moveSpeed + ' (Возврат в начало)');
    addLine('M30 (Конец программы)');
    addLine('%');

    generatedGcode = gcode.join('\n');

    const previewEl = document.getElementById('gcodePreview');
    previewEl.innerHTML = gcode.map((line, idx) => {
        const mapInfo = gcodeLineMap[idx];
        const isComment = line.trim().startsWith('(') || line.trim().startsWith('%');
        const hasPath = mapInfo && mapInfo.pathIndex > 0;
        let cssClass = isComment ? 'gcode-line comment' : 'gcode-line';
        if (hasPath) cssClass += ' gcode-line-clickable';
        return `<div class="${cssClass}" data-line="${idx}" ${hasPath ? `onclick="onGcodeLineClick(${idx})"` : ''}>${escapeHtml(line) || '&nbsp;'}</div>`;
    }).join('');

    highlightedPathIdx = -1;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightGcodeLine(lineIndex) {
    const lines = document.querySelectorAll('.gcode-line');
    lines.forEach(el => el.classList.remove('active'));
    if (lineIndex >= 0 && lineIndex < lines.length) {
        const el = lines[lineIndex];
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function highlightGcodePath(pathIndex) {
    const lines = document.querySelectorAll('.gcode-line');
    lines.forEach(el => el.classList.remove('active'));

    let firstLine = -1;
    gcodeLineMap.forEach((info, idx) => {
        if (info.pathIndex === pathIndex) {
            if (firstLine === -1) firstLine = idx;
            const el = lines[idx];
            if (el) el.classList.add('active');
        }
    });

    if (firstLine >= 0 && firstLine < lines.length) {
        lines[firstLine].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/** Клик по строке G-code — подсветить соответствующий контур на холсте */
function onGcodeLineClick(lineIdx) {
    if (lineIdx < 0 || lineIdx >= gcodeLineMap.length) return;

    const info = gcodeLineMap[lineIdx];
    if (!info || info.pathIndex <= 0) {
        // Строка из заголовка — снимаем подсветку
        highlightedPathIdx = -1;
        highlightGcodeLine(-1);
        renderPreview();
        return;
    }

    // Если тот же контур — снять выделение
    if (highlightedPathIdx === info.pathIndex) {
        highlightedPathIdx = -1;
        highlightGcodeLine(-1);
        renderPreview();
        return;
    }

    highlightedPathIdx = info.pathIndex;

    // Подсветить все строки этого контура в G-code
    highlightGcodePath(info.pathIndex);

    // Показать информацию о контуре
    if (info.partIndex >= 0 && sheetData.nestedParts[info.partIndex]) {
        const orderedPartIndices = getOrderedPartIndices();
        const partOrderPos = orderedPartIndices.indexOf(info.partIndex);
        const part = sheetData.nestedParts[info.partIndex];
        const contourCount = (partToContoursMap[info.partIndex] || []).length;

        // Определяем какой это контур внутри детали (внутренний/наружный)
        let contourPosInPart = '';
        if (info.exportIndex >= 0) {
            const contourIndices = partToContoursMap[info.partIndex] || [];
            const posInPart = contourIndices.indexOf(info.exportIndex);
            if (posInPart >= 0) {
                if (contourCount > 1) {
                    contourPosInPart = posInPart === contourCount - 1 ? ' (наружный)' : ` (внутренний ${posInPart + 1})`;
                }
            }
        }

        const w = (part.width || 0).toFixed(0);
        const h = (part.height || 0).toFixed(0);
        const obj = info.exportIndex >= 0 ? sheetData.exportObjects[info.exportIndex] : null;
        const typeStr = obj ? ` [${obj.type}]` : '';
        document.getElementById('statusInfo').textContent =
            `Деталь ${partOrderPos + 1} (${w}×${h} мм) | Контур ${info.pathIndex}${typeStr}${contourPosInPart}`;
    }

    renderPreview();
}

function getStartPoint(obj) {
    if (obj.points && obj.points.length > 0) {
        return obj.points[0];
    } else if (obj.type === 'circle') {
        return { x: obj.cx + obj.radius, y: obj.cy };
    }
    return { x: 0, y: 0 };
}

function getEndPoint(obj) {
    if (obj.points && obj.points.length > 0) {
        return obj.points[obj.points.length - 1];
    } else if (obj.type === 'circle') {
        return { x: obj.cx + obj.radius, y: obj.cy };
    }
    return { x: 0, y: 0 };
}

function getObjectPoints(obj) {
    if (obj.points) {
        return obj.points;
    } else if (obj.type === 'circle') {
        const points = [];
        const segments = 36;
        for (let i = 0; i < segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push({
                x: obj.cx + Math.cos(angle) * obj.radius,
                y: obj.cy + Math.sin(angle) * obj.radius
            });
        }
        return points;
    }
    return [];
}

function calculateLeadIn(p1, p2, length, reverse = false) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return { x: p1.x, y: p1.y };

    const ratio = reverse ? -length / dist : length / dist;
    return {
        x: p1.x + dx * ratio,
        y: p1.y + dy * ratio
    };
}

function toFixed(num, decimals = 3) {
    return (Math.round(num * 1000) / 1000).toFixed(decimals);
}

// ═══════════════════════════════════════════════════════
// Скачивание G-code
// ═══════════════════════════════════════════════════════

function downloadGcode() {
    if (!generatedGcode) {
        alert('⚠️ Сначала сгенерируйте G-code!');
        return;
    }

    const blob = new Blob([generatedGcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutsy_laser_${Date.now()}.nc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Автоскрытие подсказки по зуму
setTimeout(() => {
    const hint = document.getElementById('zoomHint');
    if (hint) {
        hint.style.opacity = '0';
        setTimeout(() => hint.remove(), 600);
    }
}, 5000);
// ═══════════════════════════════════════════════════════════════
// v4.54: НОВЫЕ ФИШКИ
// ═══════════════════════════════════════════════════════════════

// ── Состояние переключателей ──
let showOrderNumbers = false;  // показывать номера порядка на холсте
let showRuler = false;          // показывать миллиметровую линейку

/**
 * Показать модальное окно со статистикой раскроя.
 * Считает: количество деталей, контуров, отверстий, общий пробег реза,
 * время резки, количество врезок, площадь листа, утилизацию.
 */
function showStatistics() {
    if (!sheetData || !sheetData.nestedParts || sheetData.nestedParts.length === 0) {
        alert('⚠️ Нет данных для статистики');
        return;
    }

    const parts = sheetData.nestedParts;
    const exportObjects = sheetData.exportObjects || [];

    // Подсчёт контуров по типам
    let closedCount = 0, openCount = 0, circleCount = 0;
    let totalVertices = 0;
    let totalCutLength = 0;  // суммарная длина реза (мм)
    let totalBboxArea = 0;   // площадь всех деталей по bbox

    for (const obj of exportObjects) {
        const pts = getObjectPoints(obj);
        if (pts.length === 0) continue;

        if (obj.closed) closedCount++;
        else openCount++;

        if (obj.type === 'circle') circleCount++;

        totalVertices += pts.length;

        // Длина реза: сумма длин отрезков + замыкание
        let segLen = 0;
        for (let i = 1; i < pts.length; i++) {
            segLen += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        }
        if (obj.closed) {
            segLen += Math.hypot(pts[0].x - pts[pts.length-1].x, pts[0].y - pts[pts.length-1].y);
        }
        totalCutLength += segLen;
    }

    // Площадь деталей (по bbox — приближённо)
    for (const p of parts) {
        totalBboxArea += (p.width || 0) * (p.height || 0);
    }

    // Лист
    const sheetArea = (sheetData.sheetWidth || 0) * (sheetData.sheetHeight || 0);
    const utilization = sheetArea > 0 ? (totalBboxArea / sheetArea * 100).toFixed(1) : '0.0';

    // Время резки (при скорости cutSpeed из формы)
    const cutSpeed = parseFloat(document.getElementById('cutSpeed')?.value) || 3000; // мм/мин
    const moveSpeed = parseFloat(document.getElementById('moveSpeed')?.value) || 5000;
    const cutTimeMin = totalCutLength / cutSpeed;
    // Время перемещения: приближённо = кол-во контуров × средний пробег 100мм
    const moveDist = exportObjects.length * 100; // грубая оценка
    const moveTimeMin = moveDist / moveSpeed;
    const totalTimeMin = cutTimeMin + moveTimeMin;
    const totalSec = Math.round(totalTimeMin * 60);

    // Количество врезок = кол-во контуров (M3)
    const pierceCount = exportObjects.length;

    // Форматирование времени
    const fmtTime = (sec) => {
        if (sec < 60) return `${sec}с`;
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m < 60) return `${m}м ${s}с`;
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h}ч ${mm}м ${s}с`;
    };

    // Режим порядка
    const modeLabel = orderMode === 'optimize' ? 'Оптимизация (ближайший сосед)'
        : orderMode === 'custom' ? 'Вручную'
        : orderMode === 'spiral-out' ? 'Спираль от центра'
        : orderMode === 'spiral-in' ? 'Спираль к центру'
        : 'Исходный';

    const html = `
        <div class="stats-grid">
            <div class="stats-card">
                <div class="stats-card-label">Деталей</div>
                <div class="stats-card-value">${parts.length}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Контуров реза</div>
                <div class="stats-card-value">${exportObjects.length}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Замкнутых контуров</div>
                <div class="stats-card-value">${closedCount}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Отверстий (круги)</div>
                <div class="stats-card-value">${circleCount}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Врезок лазера</div>
                <div class="stats-card-value">${pierceCount}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Утилизация листа</div>
                <div class="stats-card-value">${utilization}<span class="stats-card-unit">%</span></div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Лист</div>
                <div class="stats-card-value" style="font-size:16px;">${sheetData.sheetWidth}×${sheetData.sheetHeight}<span class="stats-card-unit">мм</span></div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Площадь листа</div>
                <div class="stats-card-value" style="font-size:16px;">${(sheetArea/1000000).toFixed(2)}<span class="stats-card-unit">м²</span></div>
            </div>
        </div>

        <div class="stats-section-title">📏 Пробег и время</div>
        <div class="stats-grid">
            <div class="stats-card">
                <div class="stats-card-label">Длина реза</div>
                <div class="stats-card-value">${(totalCutLength/1000).toFixed(2)}<span class="stats-card-unit">м</span></div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Время резки</div>
                <div class="stats-card-value" style="font-size:16px;">${fmtTime(Math.round(cutTimeMin * 60))}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Время перемещений</div>
                <div class="stats-card-value" style="font-size:16px;">${fmtTime(Math.round(moveTimeMin * 60))}</div>
            </div>
            <div class="stats-card">
                <div class="stats-card-label">Общее время</div>
                <div class="stats-card-value" style="font-size:16px;">${fmtTime(totalSec)}</div>
            </div>
        </div>

        <div class="stats-section-title">⚙️ Параметры расчёта</div>
        <div style="font-size:12px; color:#888; line-height:1.7;">
            Скорость резки: <strong style="color:#fff;">${cutSpeed} мм/мин</strong><br>
            Скорость перемещения: <strong style="color:#fff;">${moveSpeed} мм/мин</strong><br>
            Порядок резки: <strong style="color:#00d4aa;">${modeLabel}</strong><br>
            Средний пробег между контурами: <strong style="color:#fff;">~100 мм</strong> (оценка)
        </div>
    `;

    document.getElementById('statsContent').innerHTML = html;
    document.getElementById('statsModal').classList.add('show');
}

function closeStatistics() {
    document.getElementById('statsModal').classList.remove('show');
}

/**
 * Переключатель: показывать номера порядка резки на холсте.
 * При активации — каждый контур получает крупный бейдж с номером.
 */
function toggleOrderNumbers() {
    showOrderNumbers = !showOrderNumbers;
    const btn = document.getElementById('toggleOrderBtn');
    btn.classList.toggle('active-toggle', showOrderNumbers);
    renderPreview();
}

/**
 * Переключатель: показывать миллиметровую линейку по краям холста.
 */
function toggleRuler() {
    showRuler = !showRuler;
    const btn = document.getElementById('toggleRulerBtn');
    btn.classList.toggle('active-toggle', showRuler);
    renderPreview();
}

/**
 * Экспорт текущей визуализации в SVG-файл.
 * Сохраняет все контуры + номера порядка + рамку листа.
 */
function exportSVG() {
    if (!sheetData || !sheetData.nestedParts || sheetData.nestedParts.length === 0) {
        alert('⚠️ Нет данных для экспорта');
        return;
    }

    const w = sheetData.sheetWidth;
    const h = sheetData.sheetHeight;
    const margin = 20;

    const orderedObjects = getOrderedExportObjects();
    const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db',
                    '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4', '#ff5722'];

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" `;
    svg += `width="${w + 2 * margin}" height="${h + 2 * margin}" `;
    svg += `viewBox="${-margin} ${-margin} ${w + 2 * margin} ${h + 2 * margin}" `;
    svg += `style="background:#0f0f1e">\n`;

    // Рамка листа
    svg += `  <rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff" stroke="#333" stroke-width="2"/>\n`;

    // Сетка (каждые 100мм)
    svg += `  <g stroke="#eeeeee" stroke-width="0.5">\n`;
    for (let x = 100; x < w; x += 100) {
        svg += `    <line x1="${x}" y1="0" x2="${x}" y2="${h}"/>\n`;
    }
    for (let y = 100; y < h; y += 100) {
        svg += `    <line x1="0" y1="${y}" x2="${w}" y2="${y}"/>\n`;
    }
    svg += `  </g>\n`;

    // Контур + номер для каждой детали (в порядке резки)
    const orderedPartIndices = getOrderedPartIndices();
    for (let orderIdx = 0; orderIdx < orderedPartIndices.length; orderIdx++) {
        const partIdx = orderedPartIndices[orderIdx];
        const color = colors[orderIdx % colors.length];
        const contourIndices = partToContoursMap[partIdx] || [];

        for (const ci of contourIndices) {
            const obj = sheetData.exportObjects[ci];
            if (!obj) continue;

            if (obj.type === 'circle') {
                svg += `  <circle cx="${obj.cx.toFixed(2)}" cy="${obj.cy.toFixed(2)}" r="${obj.radius.toFixed(2)}" `
                     + `fill="none" stroke="${color}" stroke-width="1.5"/>\n`;
            } else if (obj.points && obj.points.length >= 2) {
                const pts = obj.points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
                const closeAttr = obj.closed ? ' Z' : '';
                svg += `  <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"${closeAttr}/>\n`;
            }
        }

        // Номер детали
        const part = sheetData.nestedParts[partIdx];
        if (part) {
            const cx = (part.x || 0) + (part.width || 0) / 2;
            const cy = (part.y || 0) + (part.height || 0) / 2;
            svg += `  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="14" fill="${color}" stroke="#000" stroke-width="1"/>\n`;
            svg += `  <text x="${cx.toFixed(2)}" y="${(cy + 5).toFixed(2)}" text-anchor="middle" `
                 + `font-family="Arial" font-size="16" font-weight="bold" fill="#000">${orderIdx + 1}</text>\n`;
        }
    }

    // Заголовок
    svg += `  <text x="${w / 2}" y="${-6}" text-anchor="middle" `
         + `font-family="Arial" font-size="14" fill="#00d4aa" font-weight="bold">`
         + `Cutsy CAD PRO — ${parts.length} деталей, ${orderedObjects.length} контуров</text>\n`;

    svg += `</svg>`;

    // Скачать
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutsy_layout_${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}