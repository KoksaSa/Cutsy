
// ═══════════════════════════════════════════════════════════════
// КОНТЕКСТНЫЕ МЕНЮ И ОБРАБОТЧИКИ DOM
// ═══════════════════════════════════════════════════════════════

const contextMenu = document.getElementById('contextMenu');
const contextPartQuantity = document.getElementById('contextPartQuantity');
const contextPartName = document.getElementById('contextPartName');
let contextMenuPosition = { x: 0, y: 0 };

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
    e.preventDefault();

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

            // Ищем деталь под курсором
            let foundIndex = -1;
            for (let i = nestedParts.length - 1; i >= 0; i--) {
                const nested = nestedParts[i];
                if (clickSheetX >= nested.x && clickSheetX <= nested.x + nested.width &&
                    clickSheetY >= nested.y && clickSheetY <= nested.y + nested.height) {
                    foundIndex = i;
                    break;
                }
            }

            if (foundIndex >= 0) {
                // Показываем информацию о детали
                showNestedInfo(foundIndex, e.clientX, e.clientY);
                return;
            }

            // Проверяем, кликнули ли по прямоугольнику разметки
            const rectsToCheck = window.markupRects || markupRects || [];
            let clickedRectIndex = -1;
            for (let i = rectsToCheck.length - 1; i >= 0; i--) {
                const rect = rectsToCheck[i];
                if (clickSheetX >= rect.x && clickSheetX <= rect.x + rect.width &&
                    clickSheetY >= rect.y && clickSheetY <= rect.y + rect.height) {
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

    // Показываем меню только если есть выделенные объекты
    if (selectedObjects.length === 0) {
        return;
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
    info += `<strong>📐 Размер:</strong> ${Math.round(bounds.width)} × ${Math.round(bounds.height)} мм<br>`;
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

    // Расчёт фактической площади по выпуклой оболочке (из nesting.js)
    let actualArea = 0;
    if (typeof getPartConvexHull === 'function') {
        const hull = getPartConvexHull(part);
        if (hull && hull.length >= 3) {
            actualArea = polygonArea(hull); // мм²
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
    info += `📐 <strong>Размер:</strong> ${Math.round(part.bounds.width)} × ${Math.round(part.bounds.height)} мм<br>`;
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
document.getElementById('nestedInfoClose').addEventListener('click', () => {
    nestedInfoMenu.style.display = 'none';
});

// Закрытие меню информации по клику вне
document.addEventListener('click', (e) => {
    if (!nestedInfoMenu.contains(e.target) && !contextMenu.contains(e.target) && !addPartToSheetMenu.contains(e.target) && !markupRectFillMenu.contains(e.target)) {
        nestedInfoMenu.style.display = 'none';
        addPartToSheetMenu.style.display = 'none';
        markupRectFillMenu.style.display = 'none';
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

    // Создаём список деталей
    parts.forEach(part => {
        const isPlaced = placedPartIds.has(part.id);
        const placedCount = nestedParts.filter(n => n.partId === part.id).length;
        const remaining = part.quantity - placedCount;

        if (remaining > 0) {
            const div = document.createElement('div');
            div.style.cssText = 'padding:6px;margin-bottom:6px;background:#1e1e1e;border-radius:4px;';
            div.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span style="color:#007acc;font-weight:bold;font-size:12px;">📦 ${part.name || `Деталь #${part.id}`}</span>
                    <span style="color:#888;font-size:11px;">${Math.round(part.bounds.width)} × ${Math.round(part.bounds.height)} мм</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="color:#aaa;font-size:11px;">Добавить:</span>
                    <input type="number" id="addPartQty_${part.id}" value="0" min="0" max="${remaining}"
                        style="width:60px;padding:4px;background:#007acc;color:#fff;border:none;border-radius:4px;text-align:center;font-size:12px;">
                    <span style="color:#888;font-size:11px;">из ${remaining} (на листе: ${placedCount})</span>
                </div>
            `;
            addPartList.appendChild(div);
        }
    });

    if (addPartList.children.length === 0) {
        addPartList.innerHTML = '<div style="color:#888;font-size:12px;text-align:center;padding:10px;">ℹ️ Все детали размещены или не влезают</div>';
    }

    // Добавляем информацию о режиме
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'padding:8px;margin-bottom:8px;background:#2a2a2a;border-radius:4px;border-left:3px solid #007acc;';
    infoDiv.innerHTML = `
        <div style="color:#aaa;font-size:11px;margin-bottom:4px;">ℹ️ <strong>Режим автоматической раскладки:</strong></div>
        <div style="color:#888;font-size:10px;">Детали будут автоматически размещены в свободном месте с использованием алгоритма NFP (учёт поворотов и зазоров)</div>
    `;
    addPartList.insertBefore(infoDiv, addPartList.firstChild);

    addPartToSheetMenu.style.display = 'block';
    addPartToSheetMenu.style.left = (clientX + 10) + 'px';
    addPartToSheetMenu.style.top = (clientY + 10) + 'px';
}

// Обработчики меню добавления деталей
document.getElementById('addPartMenuCancel').addEventListener('click', () => {
    addPartToSheetMenu.style.display = 'none';
});

document.getElementById('addPartMenuOk').addEventListener('click', async () => {
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

    // Добавляем детали на лист с использованием NFP (как при основной раскладке)
    saveState();

    // Проверяем, доступна ли функция findPositionWithNFP
    if (typeof findPositionWithNFP !== 'function') {
        alert('❌ Функция раскладки не найдена');
        addPartToSheetMenu.style.display = 'none';
        return;
    }

    const minGap = 3;  // Минимальный зазор между деталями

    // Создаём временный массив для проверки пересечений
    const placedPolygons = nestedParts.map(n => ({
        positionedHull: n.polygon || [],
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height
    }));

    // Размещаем каждую деталь
    for (const { part, qty } of partsToAdd) {
        for (let i = 0; i < qty; i++) {
            // Ищем позицию с использованием NFP
            const position = await findPositionWithNFP(
                placedPolygons,
                part,
                sheetSize.width,
                sheetSize.height,
                null,  // cancelCallback
                null   // spatialGrid
            );

            if (position) {
                const outline = getPartPolygons(part);
                const positionedHull = position.positionedHull || (outline.length > 0 ? outline[0] : []);

                const nested = {
                    partId: part.id,
                    x: position.x,
                    y: position.y,
                    width: position.bboxWidth || part.bounds.width,
                    height: position.bboxHeight || part.bounds.height,
                    baseWidth: part.bounds.width,
                    baseHeight: part.bounds.height,
                    rotation: position.rotation || 0,
                    angle: position.angle || 0,
                    polygon: positionedHull,
                    outline: outline
                };

                nestedParts.push(nested);
                placedPolygons.push({
                    positionedHull: positionedHull,
                    x: position.x,
                    y: position.y,
                    width: nested.width,
                    height: nested.height
                });

                console.log(`✅ Деталь "${part.name}" размещена на (${Math.round(position.x)}, ${Math.round(position.y)}) с поворотом ${Math.round((position.angle * 180 / Math.PI) % 360)}°`);
            } else {
                console.log(`⚠️ Не удалось разместить деталь "${part.name}" - нет свободного места`);
                break;  // Прерываем цикл, если не удалось разместить одну деталь
            }
        }
    }

    addPartToSheetMenu.style.display = 'none';
    render();
    updatePartsList();
    saveState();
});

console.log('✅ Контекстные меню загружены');
