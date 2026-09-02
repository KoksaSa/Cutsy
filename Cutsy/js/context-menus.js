
// ═══════════════════════════════════════════════════════════════
// КОНТЕКСТНЫЕ МЕНЮ И ОБРАБОТЧИКИ DOM
// ═══════════════════════════════════════════════════════════════

const contextMenu = document.getElementById('contextMenu');
const contextPartQuantity = document.getElementById('contextPartQuantity');
const contextPartName = document.getElementById('contextPartName');
let contextMenuPosition = { x: 0, y: 0 };

// v4.71: Point-in-polygon проверка для определения клика по заливке
function pointInPolygonCheck(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        if (((points[i].y > y) !== (points[j].y > y)) &&
            (x < (points[j].x - points[i].x) * (y - points[i].y) / (points[j].y - points[i].y) + points[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

// === Контекстное меню для информации о детали на листе ===
const nestedInfoMenu = document.getElementById('nestedInfoMenu');
const nestedInfoContent = document.getElementById('nestedInfoContent');

// === Меню добавления деталей и заполнения прямоугольника ===
const addPartToSheetMenu = document.getElementById('addPartToSheetMenu');
const markupRectFillMenu = document.getElementById('markupRectFillMenu');

// Проверка что все элементы найдены
if (!nestedInfoMenu || !nestedInfoContent || !addPartToSheetMenu || !markupRectFillMenu) {
    console.warn('⚠️ Некоторые DOM-элементы контекстных меню не найдены:', {
        nestedInfoMenu: !!nestedInfoMenu,
        nestedInfoContent: !!nestedInfoContent,
        addPartToSheetMenu: !!addPartToSheetMenu,
        markupRectFillMenu: !!markupRectFillMenu
    });
}

// Отключаем стандартное контекстное меню браузера
canvas.addEventListener('contextmenu', (e) => {
    console.log('[context-menus] contextmenu triggered');
    e.preventDefault();

    // ═══════════════════════════════════════════════════════════
    // Отмена текущей линии в режиме полилинии (из mouse-events.js)
    // Должно быть ПЕРЕД остальной логикой
    // ═══════════════════════════════════════════════════════════
    if (typeof currentTool !== 'undefined' && currentTool === 'line' && typeof isDrawing !== 'undefined' && isDrawing) {
        isDrawing = false;
        if (typeof currentShape !== 'undefined') currentShape = null;
        if (typeof snapPoint !== 'undefined') snapPoint = null;
        if (typeof lineSnapConstraint !== 'undefined') lineSnapConstraint = null;
        if (typeof dimensionLabel !== 'undefined') dimensionLabel.style.display = 'none';
        if (typeof render === 'function') render();
        console.log('[context-menus] line drawing cancelled via contextmenu');
        return;
    }

    const rect = canvas.getBoundingClientRect();

    // Проверяем, кликнули ли по листу с раскладкой
    if (showSheetView) {
        const sheetMargin = 50;
        const baseSheetW = Math.min(sheetSize.width / 3, 400);
        const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
        const sheetW = baseSheetW * sheetZoom;
        const sheetH = baseSheetH * sheetZoom;
        const sheetX = canvas.width - sheetW - sheetMargin + sheetPanX;
        const sheetY = sheetMargin + sheetPanY;

        // Проверяем, кликнули ли по листу
        if (e.clientX - rect.left >= sheetX && e.clientX - rect.left <= sheetX + sheetW &&
            e.clientY - rect.top >= sheetY && e.clientY - rect.top <= sheetY + sheetH) {

            // Преобразуем координаты клика в координаты листа
            const scaleX = sheetW / sheetSize.width;
            const scaleY = sheetH / sheetSize.height;
            const clickSheetX = (e.clientX - rect.left - sheetX) / scaleX;
            const clickSheetY = (e.clientY - rect.top - sheetY) / scaleY;

            // Ищем деталь под курсором (v4.73: с учётом полигона/отверстий)
            // v4.75: Fallback на bbox для деталей без отверстий (L-shape, вырезы)
            let foundIndex = -1;
            for (let i = nestedParts.length - 1; i >= 0; i--) {
                const nested = nestedParts[i];
                if (clickSheetX < nested.x || clickSheetX > nested.x + nested.width ||
                    clickSheetY < nested.y || clickSheetY > nested.y + nested.height) {
                    continue;
                }
                // Точная проверка по полигону (пропуск отверстий)
                if (nested.polygon && nested.polygon.length >= 3) {
                    if (typeof pointInPolygonNested === 'function') {
                        if (!pointInPolygonNested(clickSheetX, clickSheetY, nested.polygon)) {
                            // v4.75: Fallback — если нет отверстий, клик в пустоте L-shape
                            const hasHoles = Array.isArray(nested.outline) && nested.outline.length > 1;
                            if (hasHoles) {
                                continue;
                            }
                            // Иначе — выделяем по bbox (клик в пустоте выреза)
                        }
                    }
                }
                foundIndex = i;
                break;
            }

            if (foundIndex >= 0) {
                // Показываем информацию о детали
                showNestedInfo(foundIndex, e.clientX, e.clientY);
                return;
            }

            // Проверяем, кликнули ли по элементу разметки (прямоугольник, круг, полигон)
            const rectsToCheck = window.markupRects || markupRects || [];
            let clickedRectIndex = -1;
            for (let i = rectsToCheck.length - 1; i >= 0; i--) {
                const r = rectsToCheck[i];
                let hit = false;
                if (r.type === 'circle') {
                    const dist = Math.sqrt(Math.pow(clickSheetX - r.cx, 2) + Math.pow(clickSheetY - r.cy, 2));
                    hit = dist <= r.radius;
                } else if (r.type === 'polygon') {
                    hit = pointInPolygon(clickSheetX, clickSheetY, r.points);
                } else {
                    // rect (по умолчанию)
                    hit = clickSheetX >= r.x && clickSheetX <= r.x + r.width &&
                          clickSheetY >= r.y && clickSheetY <= r.y + r.height;
                }
                if (hit) {
                    clickedRectIndex = i;
                    break;
                }
            }

            if (clickedRectIndex >= 0) {
                // Клик по прямоугольнику разметки - показываем меню заполнения
                if (typeof window.openMarkupRectMenu === 'function') {
                    window.openMarkupRectMenu(clickedRectIndex, e.clientX, e.clientY);
                } else {
                    console.error('❌ Функция openMarkupRectMenu не найдена');
                }
                return;
            }

            // Клик в пустое место на листе - показываем меню добавления деталей (с раскладкой)
            showAddPartToSheetMenu(e.clientX, e.clientY);
            return;
        }
    }

    // Показываем меню если есть выделенные объекты ИЛИ если под курсором есть объект
    if (selectedObjects.length === 0) {
        // v4.71: Автоматически выделяем объект под курсором при ПКМ.
        // Проверяем контур (contains) и заливку (point-in-polygon для polygon/rect).
        const worldX = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
        const worldY = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

        let foundObj = null;
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (!obj) continue;

            // 1. Проверка по контуру (contains)
            if (typeof obj.contains === 'function') {
                try {
                    if (obj.contains(worldX, worldY)) {
                        foundObj = obj;
                        break;
                    }
                } catch (e) {}
            }

            // 2. Проверка по заливке (point-in-polygon для polygon/polyline с points)
            if (!foundObj && obj.points && obj.points.length >= 3 && obj.closed !== false) {
                if (pointInPolygonCheck(worldX, worldY, obj.points)) {
                    foundObj = obj;
                    break;
                }
            }

            // 3. Для rect — point-in-rect
            if (!foundObj && obj.type === 'rect') {
                const minX = Math.min(obj.x, obj.x + obj.width);
                const maxX = Math.max(obj.x, obj.x + obj.width);
                const minY = Math.min(obj.y, obj.y + obj.height);
                const maxY = Math.max(obj.y, obj.y + obj.height);
                if (worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY) {
                    foundObj = obj;
                    break;
                }
            }

            // 4. Для circle — point-in-circle
            if (!foundObj && obj.type === 'circle') {
                const d = Math.hypot(worldX - obj.cx, worldY - obj.cy);
                if (d <= obj.radius) {
                    foundObj = obj;
                    break;
                }
            }
        }

        if (foundObj) {
            // Выделяем найденный объект
            selectedObjects.length = 0;
            selectedObjects.push(foundObj);
            if (typeof showProperties === 'function') showProperties(foundObj);
            if (typeof render === 'function') render();
        } else {
            return; // Нет объекта под курсором — не показываем меню
        }
    }

    // Получаем координаты с учётом зума и панорамирования
    contextMenuPosition.x = (e.clientX - rect.left - canvas.width / 2 - panX) / zoom;
    contextMenuPosition.y = (e.clientY - rect.top - canvas.height / 2 - panY) / zoom;

    // Показываем информацию о выделенных объектах
    showContextInfo();

    // Показываем меню рядом с курсором
    contextMenu.style.display = 'block';
    contextMenu.style.left = (e.clientX + 10) + 'px';
    contextMenu.style.top = (e.clientY + 10) + 'px';

    // Фокус на поле ввода
    setTimeout(() => {
        contextPartQuantity.focus();
        contextPartQuantity.select();
    }, 10);
});

// Показать информацию о выделенных объектах в контекстном меню
function showContextInfo() {
    const bounds = getGroupBounds(selectedObjects);
    // Берём толщину из селекта в контекстном меню
    const thicknessSelect = document.getElementById('contextPartThickness');
    const thickness = thicknessSelect ? parseFloat(thicknessSelect.value) : 0.8;
    const density = 7.85; // Плотность стали, г/см³

    // Расчёт веса
    const area = bounds.width * bounds.height; // мм²
    const volume = area * thickness / 1000; // см³
    const weight = volume * density / 1000; // кг (одна деталь)

    // Формируем отчёт
    const areaM2 = area / 1000000;  // м²
    let info = '';
    info += `<strong>📐 Размер:</strong> ${parseFloat(bounds.width.toFixed(2))} × ${parseFloat(bounds.height.toFixed(2))} мм<br>`;
    info += `<strong>📊 Площадь:</strong> ${areaM2.toFixed(6)} м²<br>`;
    info += `<strong>🔩 Толщина:</strong> ${thickness} мм<br>`;
    info += `<strong>⚖️ Вес:</strong> ${weight.toFixed(3)} кг`;

    document.getElementById('contextInfoContent').innerHTML = info;
}

// Обработчик изменения толщины в контекстном меню
const contextPartThickness = document.getElementById('contextPartThickness');
if (contextPartThickness) {
    contextPartThickness.addEventListener('change', () => {
        if (selectedObjects.length > 0) {
            showContextInfo();  // Пересчитываем вес при изменении толщины
        }
    });
}

// Показать информацию о детали на листе
function showNestedInfo(index, clientX, clientY) {
    const nested = nestedParts[index];
    const part = parts.find(p => p.id === nested.partId);
    if (!part) return;

    // ═══════════════════════════════════════════════════════════════
    // ПОЛУЧАЕМ ТОЛЩИНУ ТЕКУЩЕГО ЛИСТА (а не общую толщину)
    // ═══════════════════════════════════════════════════════════════
    let sheetThickness = 0.8;  // Толщина по умолчанию
    
    if (window.allSheets && window.allSheets.length > 0 && window.currentSheetIndex >= 0) {
        // Берём толщину из текущего листа
        sheetThickness = window.allSheets[window.currentSheetIndex]?.thickness || 0.8;
    } else {
        // Если листов нет, берём из детали
        sheetThickness = part.thickness || 0.8;
    }

    const density = 7.85; // Плотность стали, г/см³

    // Расчёт фактической площади по выпуклой оболочке
    let actualArea = 0;
    const _N = window.Nesting;
    if (_N && typeof _N.getPartBoundingHull === 'function' && typeof _N.polygonArea === 'function') {
        const hull = _N.getPartBoundingHull(part);
        if (hull && hull.length >= 3) {
            actualArea = Math.abs(_N.polygonArea(hull)); // мм²
        }
    }
    // Если функция недоступна, используем bounding box
    if (actualArea === 0) {
        actualArea = part.bounds.width * part.bounds.height;
    }

    // Площадь bounding box (сечение)
    const bboxArea = part.bounds.width * part.bounds.height; // мм²

    // ═══════════════════════════════════════════════════════════════
    // ВЕС И СТОИМОСТЬ СЧИТАЕМ ОТ ТОЛЩИНЫ ЛИСТА
    // ═══════════════════════════════════════════════════════════════
    const actualVolume = actualArea * sheetThickness / 1000; // см³
    const actualWeight = actualVolume * density / 1000; // кг

    // Вес детали с остатком (по bounding box)
    const bboxVolume = bboxArea * sheetThickness / 1000; // см³
    const bboxWeight = bboxVolume * density / 1000; // кг

    // Количество размещённых деталей этого типа на листе
    const placedCount = nestedParts.filter(n => n.partId === nested.partId).length;

    // ═══════════════════════════════════════════════════════════════
    // ФОРМИРУЕМ ОТЧЁТ С АКТУАЛЬНОЙ ТОЛЩИНОЙ ЛИСТА
    // ═══════════════════════════════════════════════════════════════
    let info = `<span style="color:#007acc;font-weight:bold;">Деталь #${part.id}</span><br>`;
    info += `<span style="color:#555;">━━━━━━━━━━━━━━━━━━━━</span><br>`;
    info += `📐 <strong>Размер:</strong> ${parseFloat(part.bounds.width.toFixed(2))} × ${parseFloat(part.bounds.height.toFixed(2))} мм<br>`;
    info += `🔩 <strong>Толщина листа:</strong> <span style="color:#00ff00;font-weight:bold;">${sheetThickness} мм</span><br>`;
    info += `📊 <strong>Фактическая площадь:</strong> ${(actualArea / 1000000).toFixed(4)} м²<br>`;
    info += `⚖️ <strong>Вес детали:</strong> <span style="color:#00ff00;font-weight:bold;">${actualWeight.toFixed(3)} кг</span><br>`;
    info += `<span style="color:#555;">━━━━━━━━━━━━━━━━━━━━</span><br>`;
    info += `🔲 <strong>Вес детали с остатком:</strong> ${bboxWeight.toFixed(3)} кг<br>`;
    info += `<span style="color:#555;">━━━━━━━━━━━━━━━━━━━━</span><br>`;
    info += `🔲 <strong>Размещено на листе:</strong> ${placedCount} шт<br>`;
    info += `📋 <strong>Количество в заказе:</strong> ${part.quantity} шт<br>`;
    info += `📦 <strong>Общий вес (заказ):</strong> <span style="color:#00ff00;font-weight:bold;">${(actualWeight * part.quantity).toFixed(3)} кг</span>`;

    nestedInfoContent.innerHTML = info;
    nestedInfoMenu.style.display = 'block';
    nestedInfoMenu.style.left = (clientX + 10) + 'px';
    nestedInfoMenu.style.top = (clientY + 10) + 'px';
}

// Закрытие меню информации о детали
const nestedInfoCloseBtn = document.getElementById('nestedInfoClose');
if (nestedInfoCloseBtn) nestedInfoCloseBtn.addEventListener('click', () => {
    nestedInfoMenu.style.display = 'none';
});

// Закрытие меню информации по клику вне
document.addEventListener('click', (e) => {
    if (!nestedInfoMenu.contains(e.target) && !contextMenu.contains(e.target) && !addPartToSheetMenu.contains(e.target) && !markupRectFillMenu.contains(e.target)) {
        nestedInfoMenu.style.display = 'none';
        addPartToSheetMenu.style.display = 'none';
        markupRectFillMenu.style.display = 'none';
        // v4.59: Удаляем обработчик Enter при закрытии меню кликом вне
        if (window._addPartEnterHandler) {
            document.removeEventListener('keydown', window._addPartEnterHandler);
            window._addPartEnterHandler = null;
        }
    }
    if (!contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
    }
});

// ═══════════════════════════════════════════════════════════════
// МЕНЮ ДОБАВЛЕНИЯ ДЕТАЛЕЙ НА ЛИСТ
// ═══════════════════════════════════════════════════════════════

// Показать меню добавления деталей на лист
function showAddPartToSheetMenu(clientX, clientY) {
    if (parts.length === 0) {
        alert('📦 Сначала создайте детали');
        return;
    }

    const addPartList = document.getElementById('addPartList');
    addPartList.innerHTML = '';

    // Находим уже размещённые детали
    const placedPartIds = new Set(nestedParts.map(n => n.partId));

    // v4.59: Показываем ВСЕ детали, даже если все уже размещены.
    // Пользователь может добавить любое количество (не ограничено quantity).
    // Создаём список деталей
    parts.forEach(part => {
        const isPlaced = placedPartIds.has(part.id);
        const placedCount = nestedParts.filter(n => n.partId === part.id).length;

        const div = document.createElement('div');
        div.style.cssText = 'padding:6px;margin-bottom:6px;background:#1e1e1e;border-radius:4px;display:flex;gap:8px;align-items:flex-start;';

        // ─── Миниатюра детали (v4.73) ─────────────────────────
        const thumbWrap = document.createElement('div');
        thumbWrap.style.cssText = 'flex-shrink:0;width:56px;height:56px;background:#0f0f0f;border-radius:4px;border:1px solid #3c3c3c;overflow:hidden;display:flex;align-items:center;justify-content:center;';
        try {
            if (typeof window.createPartThumbnail === 'function') {
                const thumbCanvas = window.createPartThumbnail(part, 56);
                if (thumbCanvas) {
                    thumbCanvas.style.cssText = 'display:block;width:56px;height:56px;';
                    thumbWrap.appendChild(thumbCanvas);
                }
            }
        } catch (e) {
            console.warn('[addPartToSheet] thumbnail error:', e);
        }
        div.appendChild(thumbWrap);

        // ─── Контент: название, размеры, ввод количества ──────
        const content = document.createElement('div');
        content.style.cssText = 'flex:1;min-width:0;';
        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:4px;">
                <span style="color:#007acc;font-weight:bold;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">📦 ${part.name || `Деталь #${part.id}`}</span>
                <span style="color:#888;font-size:11px;flex-shrink:0;">${parseFloat(part.bounds.width.toFixed(2))} × ${parseFloat(part.bounds.height.toFixed(2))} мм</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:#aaa;font-size:11px;">Добавить:</span>
                <input type="number" id="addPartQty_${part.id}" value="0" min="0" max="9999"
                    class="addPartQtyInput"
                    style="width:60px;padding:4px;background:#007acc;color:#fff;border:none;border-radius:4px;text-align:center;font-size:12px;">
                <span style="color:#888;font-size:11px;">шт (на листе: ${placedCount})</span>
            </div>
        `;
        div.appendChild(content);

        addPartList.appendChild(div);
    });

    if (addPartList.children.length === 0) {
        addPartList.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:10px;">ℹ️ Нет деталей для добавления</div>';
    }

    // Добавляем информацию о режиме
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'padding:8px;margin-bottom:8px;background:#2a2a2a;border-radius:4px;border-left:3px solid #007acc;';
    infoDiv.innerHTML = `
        <div style="color:#aaa;font-size:11px;margin-bottom:4px;">ℹ️ <strong>Режим инкрементальной раскладки:</strong></div>
        <div style="color:#888;font-size:10px;">Детали будут автоматически размещены в свободном месте. Можно добавить любое количество (Enter — добавить)</div>
    `;
    addPartList.insertBefore(infoDiv, addPartList.firstChild);

    addPartToSheetMenu.style.display = 'block';
    addPartToSheetMenu.style.left = (clientX + 10) + 'px';
    addPartToSheetMenu.style.top = (clientY + 10) + 'px';

    // v4.59: Удаляем старый обработчик Enter (если был) и добавляем новый
    const _enterHandler = (e) => {
        if (e.key === 'Enter' && addPartToSheetMenu.style.display !== 'none') {
            e.preventDefault();
            const okBtn = document.getElementById('addPartMenuOk');
            if (okBtn) okBtn.click();
        }
    };

    // Удаляем предыдущий обработчик если он был сохранён
    if (window._addPartEnterHandler) {
        document.removeEventListener('keydown', window._addPartEnterHandler);
    }
    window._addPartEnterHandler = _enterHandler;
    document.addEventListener('keydown', _enterHandler);

    // Фокус на первое поле ввода
    setTimeout(() => {
        const firstInput = addPartList.querySelector('.addPartQtyInput');
        if (firstInput) firstInput.focus();
    }, 50);
}

// Обработчики меню добавления деталей
document.getElementById('addPartMenuCancel').addEventListener('click', () => {
    addPartToSheetMenu.style.display = 'none';
    // v4.59: Удаляем обработчик Enter при закрытии
    if (window._addPartEnterHandler) {
        document.removeEventListener('keydown', window._addPartEnterHandler);
        window._addPartEnterHandler = null;
    }
});

document.getElementById('addPartMenuOk').addEventListener('click', async () => {
    // v4.59: Удаляем обработчик Enter сразу при клике (чтобы не сработал дважды)
    if (window._addPartEnterHandler) {
        document.removeEventListener('keydown', window._addPartEnterHandler);
        window._addPartEnterHandler = null;
    }

    // Собираем данные из полей ввода
    const partsToAdd = [];
    parts.forEach(part => {
        const input = document.getElementById(`addPartQty_${part.id}`);
        if (input) {
            const qty = parseInt(input.value) || 0;
            if (qty > 0) {
                partsToAdd.push({ part, qty });
            }
        }
    });

    if (partsToAdd.length === 0) {
        addPartToSheetMenu.style.display = 'none';
        return;
    }

    // v4.58: ИНКРЕМЕНТАЛЬНЫЙ NESTING — используем performIncrementalNesting
    // вместо ручного размещения. Это даёт:
    //   - Тот же алгоритм что и основной nesting (NFP + spatial grid)
    //   - Учёт interlocking (взаимное вкладывание деталей)
    //   - Адаптивный SPATIAL_CELL_SIZE
    //   - Сортировку крупные → мелкие
    //   - Корректные positionedHull и polygon
    saveState();

    addPartToSheetMenu.style.display = 'none';

    // Показываем индикатор прогресса
    const statusEl = document.getElementById('multiSheetProgress');
    if (statusEl) {
        statusEl.textContent = `🔄 Инкрементальная раскладка: ${partsToAdd.length} типов, ${partsToAdd.reduce((s,p)=>s+p.qty,0)} штук...`;
        const overlay = document.getElementById('multiSheetLoading');
        if (overlay) overlay.style.display = 'flex';
    }

    try {
        // Готовим детали для инкрементальной раскладки
        const newParts = partsToAdd.map(({ part, qty }) => {
            const originalPart = parts.find(p => p.id === part.id);
            return {
                id: part.id,
                name: part.name,
                quantity: qty,
                bounds: { ...part.bounds },
                objects: part.objects,
                thickness: part.thickness || 0.8,
                oneCutEnabled: part.oneCutEnabled === true,
                noRotate: originalPart ? originalPart.noRotate === true : false,
                allowedAngles: originalPart ? (originalPart.allowedAngles || []) : [],
                spacing: (typeof originalPart?.spacing === 'number') ? originalPart.spacing : undefined,
                nestingEnabled: true
            };
        });

        // Текущие размещённые детали — как препятствия
        const existingNested = [...nestedParts];

        // Вызываем инкрементальный nesting
        const N = window.Nesting;
        const performIncremental = (N && typeof N.performIncrementalNesting === 'function')
            ? N.performIncrementalNesting
            : (typeof performIncrementalNesting === 'function' ? performIncrementalNesting : null);

        if (!performIncremental) {
            alert('❌ Функция инкрементальной раскладки не найдена. Обновите страницу.');
            const overlay = document.getElementById('multiSheetLoading');
            if (overlay) overlay.style.display = 'none';
            return;
        }

        const result = await performIncremental(newParts, sheetSize, existingNested, null);

        if (!result) {
            const overlay = document.getElementById('multiSheetLoading');
            if (overlay) overlay.style.display = 'none';
            return;
        }

        // Добавляем новые размещения к существующим
        result.nestedParts.forEach(nested => {
            const originalPart = parts.find(p => p.id === nested.partId);
            if (originalPart) {
                nested.oneCutEnabled = originalPart.oneCutEnabled === true;
                nested.thickness = originalPart.thickness || 0.8;
                if (typeof nested.spacing !== 'number' && typeof originalPart.spacing === 'number') {
                    nested.spacing = originalPart.spacing;
                }
            }
            nestedParts.push(nested);
        });

        // Сохраняем в allSheets
        if (window.allSheets && window.allSheets.length > 0 && window.currentSheetIndex >= 0) {
            window.allSheets[window.currentSheetIndex].nestedParts = [...nestedParts];
        }

        // Скрываем прогресс
        const overlay = document.getElementById('multiSheetLoading');
        if (overlay) overlay.style.display = 'none';

        // Показываем результат
        const placedCount = result.nestedParts.length;
        const unplacedCount = result.unplacedParts.reduce((s, p) => s + p.quantity, 0);

        if (placedCount > 0 && unplacedCount === 0) {
            console.log(`✅ [INCREMENTAL] Размещено ${placedCount} деталей`);
        } else if (placedCount > 0 && unplacedCount > 0) {
            console.log(`⚠️ [INCREMENTAL] Размещено ${placedCount}, не помещается: ${unplacedCount}`);
            const unplacedNames = result.unplacedParts.map(up => {
                const p = parts.find(pp => pp.id === up.partId);
                return `${p?.name || up.partId}: ${up.quantity}шт`;
            }).join(', ');
            setTimeout(() => {
                alert(`⚠️ Не все детали поместились на лист!\n\n` +
                      `✅ Размещено: ${placedCount}\n` +
                      `❌ Не помещается: ${unplacedCount}\n\n` +
                      `Не размещено: ${unplacedNames}\n\n` +
                      `Совет: увеличьте количество листов или уменьшите зазоры.`);
            }, 100);
        } else if (placedCount === 0) {
            alert(`❌ Не удалось разместить ни одной детали.\n\n` +
                  `Возможно, на листе нет свободного места. ` +
                  `Очистите раскладку или добавьте новый лист.`);
        }

        render();
        updatePartsList();
        saveState();
    } catch (err) {
        console.error('❌ Ошибка инкрементальной раскладки:', err);
        const overlay = document.getElementById('multiSheetLoading');
        if (overlay) overlay.style.display = 'none';
        alert('❌ Ошибка при раскладке: ' + err.message);
    }
});

console.log('✅ Контекстные меню загружены');