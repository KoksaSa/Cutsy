// ═══════════════════════════════════════════════════════════════
// ОБРАБОТЧИКИ ИМПОРТА DXF (UI) - МУЛЬТИ-ВЫБОР
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ПАРСИНГ ИМЕНИ ФАЙЛА (количество и толщина)
// ═══════════════════════════════════════════════════════════════

/**
 * Парсит имя файла DXF и извлекает количество и толщину
 * Примеры:
 *   "2 шт - нерж 0,8.dxf" → quantity: 2, thickness: 0.8
 *   "5деталей - сталь 2мм.dxf" → quantity: 5, thickness: 2.0
 *   "Пупырка.dxf" → quantity: 1, thickness: 0.8 (по умолчанию)
 */
function parseDXFFileName(fileName) {
    const result = {
        name: fileName.replace(/\.dxf$/i, '').trim(),  // Имя без расширения
        quantity: 1,      // По умолчанию
        thickness: 0.8    // По умолчанию (мм)
    };
    
    // ═══════════════════════════════════════════════════════════
    // ИЗВЛЕЧЕНИЕ КОЛИЧЕСТВА
    // ═══════════════════════════════════════════════════════════
    // Форматы: "2 шт", "2шт", "2 дет", "2дет", "2 детали", "2 -", просто число в начале
    // ИЛИ в любом месте: "противень 2 шт", "Боковина-3 дет"
    const qtyPatterns = [
        /(\d+)\s*(?:шт|дет|детали)/i,    // "противень 2 шт", "Боковина-3 дет" (в любом месте) — ПРИОРИТЕТ №1
        /^(\d+)\s*[-–—]/,                 // "2 -", "2 –", "2 —" (в начале) — ПРИОРИТЕТ №2
        /^(\d+)\s/,                        // "2 " (число + пробел в начале) — ПРИОРИТЕТ №3
    ];
    
    for (const pattern of qtyPatterns) {
        const match = fileName.match(pattern);
        if (match) {
            const qty = parseInt(match[1]);
            if (qty >= 1 && qty <= 9999) {
                result.quantity = qty;
                break;
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════
    // ИЗВЛЕЧЕНИЕ ТОЛЩИНЫ
    // ═══════════════════════════════════════════════════════════
    // Форматы: "0,8", "0.8", "0,8мм", "0.8mm", "нерж 0,8"
    const thicknessPatterns = [
        /(\d+[,.]\d+)\s*(?:мм|mm)?/i,  // "0,8", "0.8", "0,8мм", "0.8mm"
        /(\d)\s*(?:мм|mm)/i             // "2мм", "2mm" (целое число)
    ];
    
    for (const pattern of thicknessPatterns) {
        const match = fileName.match(pattern);
        if (match) {
            const thickness = parseFloat(match[1].replace(',', '.'));
            if (thickness >= 0.1 && thickness <= 100) {
                result.thickness = thickness;
                break;
            }
        }
    }
    
    return result;
}

// ═══════════════════════════════════════════════════════════════
// РАЗДЕЛЕНИЕ НЕСВЯЗАННЫХ ГРУПП ОБЪЕКТОВ
// ═══════════════════════════════════════════════════════════════
// Когда в DXF файле две (или более) отдельные детали,
// importDXF() возвращает их все как один плоский массив.
// Эта функция разбивает объекты на группы по связности:
// объекты считаются связанными, если их точки находятся
// ближе PROXIMITY мм друг от друга.
//
// ПРИМЕЧАНИЕ: Результат этой функции используется напрямую
// для создания деталей — каждая итоговая группа = отдельная деталь.
// Внутренние контуры (отверстия, пазы) автоматически объединяются
// с внешним (bbox внутри bbox → слияние).

/**
 * Разбивает массив объектов на группы несвязанных (пространственно
 * разделённых) фигур. Использует Union-Find для группировки.
 * @param {Array} objects - Массив CAD-объектов (line, arc, circle, rect, etc.)
 * @returns {Array<{objects: Array, bounds: Object}>} - Массив групп объектов
 */
function splitDisconnectedGroups(objects) {
    if (!objects || objects.length === 0) return [];
    if (objects.length <= 2) {
        // 1-2 объекта не могут быть разделены — возвращаем как есть
        return [{ objects, bounds: calculateBounds(objects) }];
    }

    const PROXIMITY = 1.0; // мм — порог близости для связывания объектов

    // ── Извлечение ключевых точек из каждого объекта ──
    function getKeyPoints(obj) {
        const points = [];
        if (obj.type === 'line') {
            points.push({ x: obj.x1, y: obj.y1 });
            points.push({ x: obj.x2, y: obj.y2 });
        } else if (obj.type === 'arc') {
            // Точки вдоль дуги для обнаружения связности
            const r = Math.abs(obj.radius || 0);
            if (r > 0) {
                const sa = obj.startAngle ?? 0;
                const ea = obj.endAngle ?? 0;
                const dir = obj.direction; // 'CW' или 'CCW'
                // Вычисляем sweep
                let sweep;
                if (dir === 'CW') {
                    sweep = sa - ea;
                    if (sweep < 0) sweep += Math.PI * 2;
                } else {
                    sweep = ea - sa;
                    if (sweep < 0) sweep += Math.PI * 2;
                }
                // Сэмплируем точки вдоль дуги (каждые 15° = π/12)
                const step = Math.PI / 12;
                const numPts = Math.max(2, Math.ceil(sweep / step) + 1);
                const dirMul = dir === 'CW' ? -1 : 1;
                for (let i = 0; i < numPts; i++) {
                    const angle = sa + dirMul * (sweep * i / (numPts - 1));
                    points.push({ x: obj.cx + Math.cos(angle) * r, y: obj.cy + Math.sin(angle) * r });
                }
            }
        } else if (obj.type === 'circle') {
            // 4 точки на окружности — для обнаружения касания/пересечения
            points.push({ x: obj.cx - obj.radius, y: obj.cy });
            points.push({ x: obj.cx + obj.radius, y: obj.cy });
            points.push({ x: obj.cx, y: obj.cy - obj.radius });
            points.push({ x: obj.cx, y: obj.cy + obj.radius });
        } else if (obj.type === 'rect') {
            points.push({ x: obj.x, y: obj.y });
            points.push({ x: obj.x + obj.width, y: obj.y });
            points.push({ x: obj.x + obj.width, y: obj.y + obj.height });
            points.push({ x: obj.x, y: obj.y + obj.height });
        } else if (obj.type === 'polygon') {
            const pts = obj.points || obj.vertices || [];
            if (obj.sides && obj.cx !== undefined) {
                // Регулярный многоугольник — аппроксимируем вершинами
                const step = (Math.PI * 2) / (obj.sides || 6);
                const r = obj.radius || 50;
                for (let i = 0; i < (obj.sides || 6); i++) {
                    const a = step * i - Math.PI / 2;
                    points.push({ x: obj.cx + Math.cos(a) * r, y: obj.cy + Math.sin(a) * r });
                }
            } else {
                pts.forEach(p => points.push({ x: p.x, y: p.y }));
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            // ИСПРАВЛЕНО: для замкнутых полилиний обязательно проверяем
            // совпадение последней и первой точек с другими объектами
            if (pts.length > 10) {
                points.push({ x: pts[0].x, y: pts[0].y });
                points.push({ x: pts[Math.floor(pts.length / 2)].x, y: pts[Math.floor(pts.length / 2)].y });
                points.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
            } else {
                pts.forEach(p => points.push({ x: p.x, y: p.y }));
            }
        }
        return points;
    }

    // ── Вычисление bbox объекта для быстрого отсева ──
    function getObjBBox(obj) {
        const pts = getKeyPoints(obj);
        if (pts.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
        }
        return { minX, minY, maxX, maxY };
    }

    // ── Предвычисление bbox для всех объектов ──
    const bboxes = objects.map(obj => getObjBBox(obj));

    // ── Union-Find ──
    const parent = Array.from({ length: objects.length }, (_, i) => i);
    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]]; // сжатие пути
            x = parent[x];
        }
        return x;
    }
    function union(a, b) {
        parent[find(a)] = find(b);
    }

    // ── Сравнение пар с bbox-отсевом ──
    for (let i = 0; i < objects.length; i++) {
        if (!bboxes[i]) continue;
        const bi = bboxes[i];
        for (let j = i + 1; j < objects.length; j++) {
            if (!bboxes[j]) continue;
            const bj = bboxes[j];

            // Быстрый отсев: если bbox'ы далеко — точно не связаны
            if (bi.maxX + PROXIMITY < bj.minX || bj.maxX + PROXIMITY < bi.minX ||
                bi.maxY + PROXIMITY < bj.minY || bj.maxY + PROXIMITY < bi.minY) {
                continue;
            }

            // Точная проверка: расстояние между ключевыми точками
            const pts_i = getKeyPoints(objects[i]);
            const pts_j = getKeyPoints(objects[j]);
            let connected = false;
            for (const pi of pts_i) {
                for (const pj of pts_j) {
                    if (Math.hypot(pi.x - pj.x, pi.y - pj.y) < PROXIMITY) {
                        connected = true;
                        break;
                    }
                }
                if (connected) break;
            }
            if (connected) union(i, j);
        }
    }

    // ── Группировка по корню ──
    const groupMap = new Map();
    for (let i = 0; i < objects.length; i++) {
        const root = find(i);
        if (!groupMap.has(root)) groupMap.set(root, []);
        groupMap.get(root).push(objects[i]);
    }

    // ── Формирование результата ──
    const result = [];
    for (const [root, groupObjects] of groupMap) {
        const groupBounds = calculateBounds(groupObjects);
        result.push({
            objects: groupObjects,
            bounds: groupBounds
        });
    }

    // Если только одна группа — всё связано, возвращаем как есть
    if (result.length <= 1) {
        return [{ objects, bounds: calculateBounds(objects) }];
    }

    // Сортируем группы по размеру (крупные первые) — для удобства
    result.sort((a, b) => {
        const areaA = a.bounds.width * a.bounds.height;
        const areaB = b.bounds.width * b.bounds.height;
        return areaB - areaA;
    });

    // ═══════════════════════════════════════════════════════════════
    // ОБЪЕДИНЕНИЕ ВНУТРЕННИХ КОНТУРОВ (ОТВЕРСТИЙ) С ВНЕШНИМ
    // ═══════════════════════════════════════════════════════════════
    // Если bbox одной группы полностью находится внутри bbox другой,
    // значит это отверстие (внутренний контур), а не отдельная деталь.
    // Такие группы нужно объединить с внешним контуром.
    const MARGIN = 1; // мм — допуск для проверки вложенности
    const merged = []; // индексы групп, которые были поглощены
    for (let i = 0; i < result.length; i++) {
        if (merged.includes(i)) continue;
        const outer = result[i];
        const outerB = outer.bounds;
        for (let j = i + 1; j < result.length; j++) {
            if (merged.includes(j)) continue;
            const inner = result[j];
            const innerB = inner.bounds;

            // Проверяем: inner bbox полностью внутри outer bbox?
            if (innerB.minX >= outerB.minX - MARGIN &&
                innerB.minY >= outerB.minY - MARGIN &&
                innerB.maxX <= outerB.maxX + MARGIN &&
                innerB.maxY <= outerB.maxY + MARGIN) {
                // inner — это отверстие внутри outer, объединяем
                outer.objects.push(...inner.objects);
                outer.bounds = calculateBounds(outer.objects);
                merged.push(j);
                // Отверстие внутри внешнего контура — объединяем
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // СЛОЙ-СЕМАНТИЧЕСКОЕ ОБЪЕДИНЕНИЕ (Fusion 360 и др.)
    // ═══════════════════════════════════════════════════════════════
    // Fusion 360 экспортирует внутренние профили (отверстия) на слое
    // INTERIOR_PROFILES, а внешние — на OUTER_PROFILES. При этом
    // отверстие может находиться за пределами bbox внешнего контура
    // (например, центр в отрицательных координатах). Обычный bbox-merge
    // такие группы не объединяет. Поэтому проверяем по имени слоя:
    // если ВСЕ объекты группы на слое «внутренний профиль» — объединяем
    // с группой на слое «внешний профиль».
    const interiorLayerPatterns = [
        /^interior_prof/i, /^inner_prof/i, /^hole/i, /^отверст/i,
        /^внутр/i, /^паз/i, /^slot/i,
    ];
    const outerLayerPatterns = [
        /^outer_prof/i, /^external_prof/i, /^outside/i, /^внешн/i,
    ];

    function isInteriorLayer(layerName) {
        if (!layerName) return false;
        const n = layerName.toString().trim();
        return interiorLayerPatterns.some(p => p.test(n));
    }
    function isOuterLayer(layerName) {
        if (!layerName) return false;
        const n = layerName.toString().trim();
        return outerLayerPatterns.some(p => p.test(n));
    }

    // Определяем, все ли объекты группы на «внутренних» слоях
    function isAllInterior(group) {
        return group.objects.every(obj => isInteriorLayer(obj.layer));
    }
    // Определяем, есть ли в группе хоть один объект на «внешнем» слое
    function hasOuter(group) {
        return group.objects.some(obj => isOuterLayer(obj.layer));
    }

    // Если остались отдельные группы после bbox-merge — проверяем по слоям
    if (result.length > 1) {
        for (let i = 0; i < result.length; i++) {
            if (merged.includes(i)) continue;
            if (!isAllInterior(result[i])) continue;

            // Группа i — внутренний профиль, ищём внешний
            let outerIdx = -1;
            for (let j = 0; j < result.length; j++) {
                if (j === i || merged.includes(j)) continue;
                if (hasOuter(result[j])) {
                    outerIdx = j;
                    break;
                }
            }
            // Если нет группы с outer-слоем — объединяем с крупнейшей
            if (outerIdx === -1) {
                let maxArea = 0;
                for (let j = 0; j < result.length; j++) {
                    if (j === i || merged.includes(j)) continue;
                    const area = result[j].bounds.width * result[j].bounds.height;
                    if (area > maxArea) { maxArea = area; outerIdx = j; }
                }
            }
            if (outerIdx !== -1) {
                result[outerIdx].objects.push(...result[i].objects);
                result[outerIdx].bounds = calculateBounds(result[outerIdx].objects);
                merged.push(i);
            }
        }
    }

    // Убираем поглощённые группы
    const finalResult = result.filter((_, idx) => !merged.includes(idx));

    // Пересчёт bounds после объединения
    finalResult.forEach(g => {
        g.bounds = calculateBounds(g.objects);
    });

    return finalResult;
}

// ═══════════════════════════════════════════════════════════════
// ПРИНУДИТЕЛЬНОЕ ОБЪЕДИНЕНИЕ ВСЕХ ГРУПП В ОДНУ ДЕТАЛЬ
// ═══════════════════════════════════════════════════════════════
// ВНИМАНИЕ: Эта функция больше НЕ вызывается автоматически!
// Она сохранена для возможного использования в будущем.
//
// Проблема: если DXF содержит 2+ раздельных блока (INSERT U0, U1),
// каждый из которых — отдельная деталь, forceMerge объединит их
// в одну деталь, что неправильно.
//
// Теперь используется splitDisconnectedGroups() напрямую:
// - Внутренние контуры (отверстия, пазы) автоматически объединяются
//   с внешним контуром (bbox внутри bbox → слияние)
// - Раздельные детали остаются раздельными группами
//
// @param {Array<{objects: Array, bounds: Object}>} groups — результат splitDisconnectedGroups()
// @returns {{objects: Array, bounds: Object}} — единая объединённая группа

function forceMergeAllGroups(groups) {
    if (!groups || groups.length === 0) {
        return { objects: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 } };
    }

    // Если группа всего одна — нечего объединять
    if (groups.length === 1) {
        return groups[0];
    }

    // Собираем все объекты из всех групп в один массив
    const allObjects = [];
    for (const group of groups) {
        allObjects.push(...group.objects);
    }

    // Пересчитываем границы для объединённого набора
    const mergedBounds = calculateBounds(allObjects);

    return { objects: allObjects, bounds: mergedBounds };
}

// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ МУЛЬТИ-ИМПОРТА
// ═══════════════════════════════════════════════════════════════

let multiImportData = [];  // Массив данных для всех выбранных файлов
const MAX_IMPORT_FILES = 20;  // Максимум файлов для импорта (увеличено с 10 до 20)

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ
// ═══════════════════════════════════════════════════════════════

function initDXFImportHandlers() {
    // Кнопка "Импорт DXF"
    const importBtn = document.getElementById('importDxf');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            document.getElementById('importDXFInput').click();
        });
    }

    // Загрузка файлов (мульти-выбор)
    const fileInput = document.getElementById('importDXFInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            
            // Проверка лимита файлов
            if (files.length > MAX_IMPORT_FILES) {
                document.getElementById('importFileLimitWarning').style.display = 'block';
                // Обрезаем до максимума
                files.splice(MAX_IMPORT_FILES);
                // FileList нельзя создать через new, используем DataTransfer
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                e.target.files = dt.files;
            } else {
                document.getElementById('importFileLimitWarning').style.display = 'none';
            }
            
            if (files.length === 0) {
                resetImport();
                return;
            }

            // Показываем диалог сразу
            document.getElementById('importDXFDialog').style.display = 'block';
            
            // Очищаем предыдущие данные
            multiImportData = [];
            
            // Обрабатываем каждый файл
            await processMultiImport(files);
        });
    }

    // Кнопка "Импортировать"
    const importOkBtn = document.getElementById('importDXFOk');
    if (importOkBtn) {
        importOkBtn.addEventListener('click', () => {
            importSelectedParts();
        });
    }

    // Кнопка "Выбрать все"
    const selectAllBtn = document.getElementById('importDXFSelectAll');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            toggleAllFileCheckboxes(true);
        });
    }

    // Кнопка "Снять все"
    const deselectAllBtn = document.getElementById('importDXFDeselectAll');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            toggleAllFileCheckboxes(false);
        });
    }

    // Кнопка "Отмена"
    const importCancelBtn = document.getElementById('importDXFCancel');
    if (importCancelBtn) {
        importCancelBtn.addEventListener('click', () => {
            closeImportDialog();
        });
    }

    // Закрытие по клику вне диалога
    const importDialog = document.getElementById('importDXFDialog');
    if (importDialog) {
        importDialog.addEventListener('click', (e) => {
            if (e.target === importDialog) {
                closeImportDialog();
            }
        });
    }


}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА МУЛЬТИ-ИМПОРТА
// ═══════════════════════════════════════════════════════════════

async function processMultiImport(files) {
    const fileListContainer = document.getElementById('importFileList');
    if (!fileListContainer) return;

    fileListContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#888;font-size:12px;">Загрузка файлов...</div>';

    multiImportData = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
            // Импортируем DXF
            const result = await importDXF(file);

            if (!result) {
                // Ошибка импорта
                multiImportData.push({
                    index: i,
                    fileName: file.name,
                    error: 'Не удалось распарсить файл',
                    selected: false
                });
                continue;
            }

            // ═══════════════════════════════════════════════════
            // ПАРСИМ ИМЯ ФАЙЛА (количество и толщина)
            // ═══════════════════════════════════════════════════
            const parsed = parseDXFFileName(file.name);

            // ═══════════════════════════════════════════════════
            // РАЗДЕЛЕНИЕ НЕСВЯЗАННЫХ ГРУПП
            // ═══════════════════════════════════════════════════
            const groups = splitDisconnectedGroups(result.objects);

            if (groups.length === 0) {
                multiImportData.push({
                    index: i,
                    fileName: file.name,
                    error: 'Нет объектов для импорта',
                    selected: false
                });
                continue;
            }

            // ═══════════════════════════════════════════════════
            // СОЗДАНИЕ ОТДЕЛЬНОЙ ДЕТАЛИ ДЛЯ КАЖДОЙ ГРУППЫ
            // ═══════════════════════════════════════════════════
            for (let gi = 0; gi < groups.length; gi++) {
                const group = groups[gi];

                // Проверяем задвоенную геометрию
                const dedupResult = removeDuplicateGeometry(group.objects);

                // Имя детали: если групп несколько, добавляем суффикс
                const partName = groups.length > 1
                    ? `${parsed.name} #${gi + 1}`
                    : parsed.name;

                // Анализ вспомогательных линий (пунктир, осевые, размерные)
                const auxLineInfo = typeof analyzeAuxiliaryLines === 'function'
                    ? analyzeAuxiliaryLines(dedupResult.objects)
                    : null;

                // Все чекбоксы включены по умолчанию (т.е. НЕ удаляем)
                const auxLineFilters = {};
                if (auxLineInfo) {
                    for (const key of Object.keys(auxLineInfo)) {
                        if (key === '_totalAux') continue;
                        auxLineFilters[key] = true; // true = оставить (не удалять)
                    }
                }

                const importItem = {
                    index: multiImportData.length,  // Глобальный индекс в multiImportData
                    fileIndex: i,                   // Индекс исходного файла
                    fileName: file.name,
                    partName: partName,
                    quantity: parsed.quantity,
                    thickness: parsed.thickness,
                    oneCutEnabled: false,
                    objects: dedupResult.objects,
                    allObjects: dedupResult.objects.slice(), // ПОЛНАЯ КОПИЯ (с вспомогательными)
                    bounds: dedupResult.removedCount > 0 ? calculateBounds(dedupResult.objects) : group.bounds,
                    entityCount: group.objects.length,
                    duplicateCount: dedupResult.removedCount,
                    auxLineInfo: auxLineInfo,       // информация о вспомогательных линиях
                    auxLineFilters: auxLineFilters, // состояние чекбоксов
                    bendNotchEnabled: false,        // вырезы под гибку (Bend Notch)
                    bendNotchSize: 1,               // размер выреза 1×1 мм
                    selected: true,
                    error: null,
                    groupsDetected: groups.length
                };

                multiImportData.push(importItem);
            }



        } catch (err) {
            console.error(`Ошибка импорта файла ${file.name}:`, err);
            multiImportData.push({
                index: i,
                fileName: file.name,
                error: err.message,
                selected: false
            });
        }
    }

    // Отрисовываем список файлов
    renderImportFileList();
    updateImportSummary();
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА СПИСКА ФАЙЛОВ
// ═══════════════════════════════════════════════════════════════

function renderImportFileList() {
    const container = document.getElementById('importFileList');
    if (!container) return;
    
    if (multiImportData.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;font-size:12px;">Нет файлов для импорта</div>';
        return;
    }
    
    container.innerHTML = multiImportData.map((item, idx) => {
        if (item.error) {
            return `
                <div class="import-file-item" style="background:#2d1a1a;">
                    <input type="checkbox" class="import-file-checkbox" data-index="${idx}" disabled>
                    <div class="import-file-thumbnail" style="display:flex;align-items:center;justify-content:center;color:#888;font-size:24px;">❌</div>
                    <div class="import-file-info">
                        <div class="import-file-name">${escapeHtml(item.fileName)}</div>
                        <div class="import-file-error">⚠️ ${escapeHtml(item.error)}</div>
                    </div>
                </div>
            `;
        }
        
        const hasDuplicates = item.duplicateCount > 0;
        const hasMultipleGroups = (item.groupsDetected || 1) > 1;
        let borderStyle = '';
        if (hasDuplicates) borderStyle = 'border-left:3px solid #f0ad4e;';
        else if (hasMultipleGroups) borderStyle = 'border-left:3px solid #5bc0de;';

        // Если файл разбит на несколько деталей — показываем суффикс
        const partSuffix = hasMultipleGroups
            ? `<span style="color:#5bc0de;font-size:11px;margin-left:6px;">✂️ ${item.groupsDetected} деталей в файле</span>`
            : '';

        // Чекбоксы для вспомогательных линий
        let auxLineCheckboxes = '';
        if (item.auxLineInfo) {
            const categories = Object.keys(item.auxLineInfo).filter(k => k !== '_totalAux');
            if (categories.length > 0) {
                auxLineCheckboxes = `<div class="import-aux-line-filters" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">`;
                auxLineCheckboxes += `<span style="color:#e8a735;font-size:11px;">✂ Линии:</span>`;
                for (const key of categories) {
                    const cat = item.auxLineInfo[key];
                    const checked = item.auxLineFilters[key] !== false;
                    auxLineCheckboxes += `<label style="display:flex;align-items:center;gap:2px;font-size:11px;color:#ccc;cursor:pointer;">
                        <input type="checkbox" class="aux-line-filter" data-index="${idx}" data-category="${key}" ${checked ? 'checked' : ''}>
                        ${cat.label} (${cat.count})
                    </label>`;
                }
                auxLineCheckboxes += `</div>`;
            }
        }

// Чекбокс "Вырезы под гибку" (Bend Notch) — если есть линии гиба, осевые или пунктирные линии
        let bendNotchCheckbox = '';
        if (item.auxLineInfo && (item.auxLineInfo.bend || item.auxLineInfo.axial || item.auxLineInfo.dashed)) {
            const notchSize = item.bendNotchSize || 1;
            bendNotchCheckbox = `<div class="import-bend-notch" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                <label style="display:flex;align-items:center;gap:2px;font-size:11px;color:#5bc0de;cursor:pointer;" title="Добавляет прямоугольные вырезы ${notchSize}×${notchSize} мм на концах линий гиба (как Bend Notch в SolidWorks)">
                    <input type="checkbox" class="bend-notch-filter" data-index="${idx}" ${item.bendNotchEnabled ? 'checked' : ''}>
                    🔧 Вырезы под гибку (${notchSize}×${notchSize} мм)
                </label>
            </div>`;
        }

        // Текущее количество объектов (после фильтрации)
        const currentObjCount = item.objects.length;
        const totalObjCount = item.allObjects ? item.allObjects.length : currentObjCount;
        const filteredOutCount = totalObjCount - currentObjCount;

        return `
            <div class="import-file-item"${borderStyle ? ' style="' + borderStyle + '"' : ''}>
                <input type="checkbox" class="import-file-checkbox" data-index="${idx}" ${item.selected ? 'checked' : ''}>
                <div class="import-file-thumbnail" id="thumbnail-${idx}">
                    <!-- Миниатюра будет отрисована здесь -->
                </div>
                <div class="import-file-info">
                    <div class="import-file-name">${escapeHtml(item.fileName)}${partSuffix}${hasDuplicates ? `<span style="color:#f0ad4e;font-size:11px;margin-left:6px;">⚠️ ${item.duplicateCount} дубликатов — будет удалено</span>` : ''}</div>
                    <div class="import-file-details">
                        📐 ${Math.round(item.bounds.width)} × ${Math.round(item.bounds.height)} мм |
                        🔷 Объектов: ${currentObjCount}${filteredOutCount > 0 ? ` <span style="color:#e8a735;">(-${filteredOutCount})</span>` : ''}${hasDuplicates ? ` из ${item.entityCount}` : ''}
                    </div>
${auxLineCheckboxes}
                    ${bendNotchCheckbox}
                    <div class="import-file-inputs">
                        <label>📝 Имя:</label>
                        <input type="text" class="import-part-name" data-index="${idx}" value="${escapeHtml(item.partName)}" style="flex:2;min-width:150px;">
                        <label>📋 Кол-во:</label>
                        <input type="number" class="import-part-quantity" data-index="${idx}" value="${item.quantity}" min="1" max="9999" style="width:60px;">
                        <label>📏 Толщина:</label>
                        <input type="number" class="import-part-thickness" data-index="${idx}" value="${item.thickness}" min="0.1" max="100" step="0.1" style="width:70px;" title="Толщина в мм">
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Навешиваем обработчики на чекбоксы
    container.querySelectorAll('.import-file-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (multiImportData[idx]) {
                multiImportData[idx].selected = e.target.checked;
                updateImportSummary();
            }
        });
    });
    
    // Навешиваем обработчики на поля имени
    container.querySelectorAll('.import-part-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (multiImportData[idx]) {
                multiImportData[idx].partName = e.target.value;
            }
        });
    });
    
    // Навешиваем обработчики на поля количества
    container.querySelectorAll('.import-part-quantity').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (multiImportData[idx]) {
                multiImportData[idx].quantity = parseInt(e.target.value) || 1;
                updateImportSummary();
            }
        });
    });

    // Навешиваем обработчики на поля толщины
    container.querySelectorAll('.import-part-thickness').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (multiImportData[idx]) {
                multiImportData[idx].thickness = parseFloat(e.target.value) || 0.8;
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    // ОБРАБОТЧИК ЧЕКБОКСОВ ВСПОМОГАТЕЛЬНЫХ ЛИНИЙ
    // ═══════════════════════════════════════════════════════════
    container.querySelectorAll('.aux-line-filter').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            const category = e.target.dataset.category;
            const item = multiImportData[idx];
            if (!item) return;

            // Обновляем состояние фильтра
            item.auxLineFilters[category] = e.target.checked;

            // Пересчитываем объекты на основе фильтров
            applyAuxLineFilters(idx);

            // Обновляем миниатюру (без перерисовки списка!)
            if (item.objects && item.objects.length > 0) {
                drawThumbnail(idx, item.objects, item.bounds);
            }

            // Обновляем счётчик объектов
            updateObjectCountDisplay(idx);

updateImportSummary();
        });
    });

    // ═══════════════════════════════════════════════════════════
    // ОБРАБОТЧИК ЧЕКБОКСА "ВЫРЕЗЫ ПОД ГИБКУ" (BEND NOTCH)
    // ═══════════════════════════════════════════════════════════
    container.querySelectorAll('.bend-notch-filter').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index);
            const item = multiImportData[idx];
            if (!item) return;

            // Обновляем состояние
            item.bendNotchEnabled = e.target.checked;

            // Пересчитываем объекты с учётом вырезов
            applyAuxLineFilters(idx);

            // Обновляем миниатюру
            if (item.objects && item.objects.length > 0) {
                drawThumbnail(idx, item.objects, item.bounds);
            }

            updateObjectCountDisplay(idx);
            updateImportSummary();
        });
    });

    // Отрисовываем миниатюры для успешных файлов
    multiImportData.forEach((item, idx) => {
        if (!item.error && item.objects && item.objects.length > 0) {
            drawThumbnail(idx, item.objects, item.bounds);
        }
    });
}

// ═══════════════════════════════════════════════════════════════
// ФИЛЬТРАЦИЯ ВСПОМОГАТЕЛЬНЫХ ЛИНИЙ (БЕЗ перерисовки списка!)
// ═══════════════════════════════════════════════════════════════

function applyAuxLineFilters(idx) {
    const item = multiImportData[idx];
    if (!item || !item.allObjects) return;

    const allObjects = item.allObjects;
    const filters = item.auxLineFilters || {};
    const auxInfo = item.auxLineInfo || {};

    // Определяем, какие категории включены (checked = оставить)
    const enabledCategories = new Set();
    for (const [key, checked] of Object.entries(filters)) {
        if (checked) enabledCategories.add(key);
    }

    // Если все чекбоксы включены — показываем все объекты
    if (enabledCategories.size === Object.keys(filters).length) {
        item.objects = allObjects;
        item.bounds = calculateBounds(allObjects);
        return;
    }

    // Фильтруем: оставляем только те объекты, которые:
    // - НЕ являются вспомогательными (нет _isContinuous/_layerIsAuxiliary тегов)
    // - ИЛИ являются вспомогательными из включённой категории
    const filtered = allObjects.filter(obj => {
        if (!obj) return true;

        const isDashed = obj._isContinuous === false;
        const layerAux = obj._layerIsAuxiliary === true;
        const isDimLine = obj._isDimensionLine === true;

        if (!isDashed && !layerAux && !isDimLine) return true; // обычная линия — оставляем

        // Это вспомогательная линия — проверяем, включена ли её категория
        const layerName = (obj.layer || '').toString().trim().toLowerCase();
        const lineType = (obj._effectiveLineType || '').toString().trim().toUpperCase();

        let category = null;
        if (isDimLine) {
            // Сущность из размерного блока (Компас-3D / AutoCAD)
            category = 'dim';
        } else if (layerAux) {
            if (/^осев|^_осев|^center|^_center|^axis/i.test(layerName) ||
                /CENTER|^AXIS/i.test(lineType)) {
                category = 'axial';
            } else if (/^размер|^_размер|^dim|^_dim/i.test(layerName)) {
                category = 'dim';
            } else if (/^bend/i.test(layerName)) {
                category = 'bend';
            } else if (/^вспомог|^_вспом|^auxiliar|^construct/i.test(layerName)) {
                category = 'aux';
            } else {
                category = 'aux';
            }
        } else if (isDashed) {
            if (/CENTER|^AXIS/i.test(lineType)) {
                category = 'axial';
            } else {
                category = 'dashed';
            }
        }

        // Оставляем если категория включена
        return category && enabledCategories.has(category);
    });

item.objects = filtered;
    item.bounds = calculateBounds(filtered);

    // ═══════════════════════════════════════════════════════════
    // ПРИМЕНЕНИЕ ВЫРЕЗОВ ПОД ГИБКУ (BEND NOTCH)
    // ═══════════════════════════════════════════════════════════
    if (item.bendNotchEnabled) {
        const notchResult = createBendNotches(item.objects, item.allObjects);
        item.objects = notchResult.objects;
        item.bounds = calculateBounds(item.objects);
    }
}

/**
 * Обновляет отображение счётчика объектов для детали
 */
function updateObjectCountDisplay(idx) {
    const item = multiImportData[idx];
    if (!item) return;

    const detailEl = document.querySelector(`.import-file-checkbox[data-index="${idx}"]`);
    if (!detailEl) return;

    const fileItem = detailEl.closest('.import-file-item');
    if (!fileItem) return;

    const detailsEl = fileItem.querySelector('.import-file-details');
    if (!detailsEl) return;

    const currentObjCount = item.objects.length;
    const totalObjCount = item.allObjects ? item.allObjects.length : currentObjCount;
    const filteredOutCount = totalObjCount - currentObjCount;
    const hasDuplicates = item.duplicateCount > 0;

    detailsEl.innerHTML = `📐 ${Math.round(item.bounds.width)} × ${Math.round(item.bounds.height)} мм | 🔷 Объектов: ${currentObjCount}${filteredOutCount > 0 ? ` <span style="color:#e8a735;">(-${filteredOutCount})</span>` : ''}${hasDuplicates ? ` из ${item.entityCount}` : ''}`;
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА МИНИАТЮРЫ
// ═══════════════════════════════════════════════════════════════

function drawThumbnail(index, objects, bounds) {
    const container = document.getElementById(`thumbnail-${index}`);
    if (!container || objects.length === 0) return;
    
    const width = 80;
    const height = 60;
    const padding = 5;
    
    // Вычисляем масштаб для вписывания в миниатюру
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;
    
    if (boundsWidth === 0 || boundsHeight === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:10px;">Пусто</div>';
        return;
    }
    
    const scaleX = (width - padding * 2) / boundsWidth;
    const scaleY = (height - padding * 2) / boundsHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Центрируем
    const offsetX = (width - boundsWidth * scale) / 2;
    const offsetY = (height - boundsHeight * scale) / 2;
    
    // Генерируем SVG
    let svgContent = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svgContent += `<rect width="100%" height="100%" fill="#252526"/>`;
    svgContent += `<g transform="translate(${offsetX}, ${offsetY}) scale(${scale}) translate(${-bounds.minX}, ${-bounds.minY})">`;
    
    // Определяем цвет объекта
    function getObjStroke(obj) {
        if (obj._isContinuous === false || obj._layerIsAuxiliary === true) {
            return '#e8a735';
        }
        return '#007acc';
    }

    objects.forEach(obj => {
        const stroke = getObjStroke(obj);
        const strokeDash = (obj._isContinuous === false) ? ` stroke-dasharray="${2/scale},${1/scale}"` : '';
        if (obj.type === 'line') {
            svgContent += `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}" stroke="${stroke}" stroke-width="${0.5 / scale}"${strokeDash}/>`;
        } else if (obj.type === 'arc') {
            // Дуга: аппроксимируем точками через getPoints()
            const segments = 24;
            let pts;
            if (typeof obj.getPoints === 'function') {
                pts = obj.getPoints(segments);
            } else {
                // Fallback: вычисляем точки вручную
                pts = [];
                let sweep;
                if (obj.direction === 'CW') {
                    sweep = obj.startAngle - obj.endAngle;
                    if (sweep < 0) sweep += Math.PI * 2;
                } else {
                    sweep = obj.endAngle - obj.startAngle;
                    if (sweep < 0) sweep += Math.PI * 2;
                }
                const dir = obj.direction === 'CW' ? -1 : 1;
                const step = sweep / segments;
                for (let i = 0; i <= segments; i++) {
                    const angle = obj.startAngle + dir * step * i;
                    pts.push({
                        x: obj.cx + Math.cos(angle) * obj.radius,
                        y: obj.cy + Math.sin(angle) * obj.radius
                    });
                }
            }
            if (pts && pts.length >= 2) {
                const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polyline points="${pointsStr}" stroke="${stroke}" stroke-width="${0.5 / scale}" fill="none"/>`;
            }
        } else if (obj.type === 'circle') {
            svgContent += `<circle cx="${obj.cx}" cy="${obj.cy}" r="${obj.radius}" stroke="${stroke}" stroke-width="${0.5 / scale}" fill="none"/>`;
        } else if (obj.type === 'rect') {
            svgContent += `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" stroke="${stroke}" stroke-width="${0.5 / scale}" fill="none"/>`;
        } else if (obj.type === 'polygon') {
            const points = obj.points || obj.vertices || (typeof obj.getPoints === 'function' ? obj.getPoints() : []);
            if (points.length > 0) {
                const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polygon points="${pointsStr}" stroke="${stroke}" stroke-width="${0.5 / scale}" fill="none"/>`;
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const points = obj.points || obj.vertices || (typeof obj.getPoints === 'function' ? obj.getPoints() : []);
            if (points.length > 0) {
                const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
                // ИСПРАВЛЕНО: замкнутая полилиния → <polygon>, открытая → <polyline>
                const svgEl = obj.closed ? 'polygon' : 'polyline';
                svgContent += `<${svgEl} points="${pointsStr}" stroke="${stroke}" stroke-width="${0.5 / scale}" fill="none"/>`;
            }
        } else if (obj.type === 'ellipse') {
            // Эллипс: аппроксимируем точками
            const segments = 24;
            const pts = [];
            const cx = obj.cx || obj.center?.x || 0;
            const cy = obj.cy || obj.center?.y || 0;
            const rx = obj.radiusX || obj.majorAxisLength || 10;
            const ry = obj.radiusY || obj.minorAxisLength || 10;
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                pts.push({
                    x: cx + Math.cos(angle) * rx,
                    y: cy + Math.sin(angle) * ry
                });
            }
            const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
            svgContent += `<polygon points="${pointsStr}" stroke="${stroke}" stroke-width="${0.5 / scale}" fill="none"/>`;
        }
    });
    
    svgContent += '</g></svg>';
    container.innerHTML = svgContent;
}

// ═══════════════════════════════════════════════════════════════
// УДАЛЕНИЕ ЗАДВОЕННОЙ ГЕОМЕТРИИ
// ═══════════════════════════════════════════════════════════════

function removeDuplicateGeometry(objects, eps) {
    if (!objects || objects.length <= 1) return { objects: objects || [], removedCount: 0 };

    eps = eps || 0.01;
    const epsAngle = 0.001;

    function near(a, b, e) { return Math.abs(a - b) < (e || eps); }
    function nearPt(p1, p2, e) { return Math.abs(p1.x - p2.x) < (e || eps) && Math.abs(p1.y - p2.y) < (e || eps); }

    function coordHash(val, step) { return Math.round(val / step); }

    function areObjectsDuplicate(a, b) {
        if (a.type !== b.type) return false;

        switch (a.type) {
            case 'line': {
                const fwd = near(a.x1, b.x1) && near(a.y1, b.y1) && near(a.x2, b.x2) && near(a.y2, b.y2);
                const rev = near(a.x1, b.x2) && near(a.y1, b.y2) && near(a.x2, b.x1) && near(a.y2, b.y1);
                return fwd || rev;
            }
            case 'arc': {
                return near(a.cx, b.cx) && near(a.cy, b.cy) &&
                       near(a.radius, b.radius) &&
                       near(a.startAngle, b.startAngle, epsAngle) &&
                       near(a.endAngle, b.endAngle, epsAngle) &&
                       a.direction === b.direction;
            }
            case 'circle': {
                return near(a.cx, b.cx) && near(a.cy, b.cy) && near(a.radius, b.radius);
            }
            case 'rect': {
                return near(a.x, b.x) && near(a.y, b.y) &&
                       near(a.width, b.width) && near(a.height, b.height);
            }
            case 'polygon': {
                if (a.sides !== undefined && b.sides !== undefined) {
                    return near(a.cx, b.cx) && near(a.cy, b.cy) &&
                           near(a.radius, b.radius) && a.sides === b.sides;
                }
                return arePointsArraysDuplicate(
                    a.points || a.vertices || [],
                    b.points || b.vertices || []
                );
            }
            case 'polyline':
            case 'lwpolyline': {
                // ИСПРАВЛЕНО: учитываем флаг closed при сравнении
                // Две полилинии с одинаковыми точками, но разным флагом closed — НЕ дубликаты
                if (a.closed !== b.closed) return false;
                return arePointsArraysDuplicate(
                    a.points || a.vertices || [],
                    b.points || b.vertices || []
                );
            }
            case 'ellipse': {
                const cx1 = a.cx || (a.center && a.center.x) || 0;
                const cy1 = a.cy || (a.center && a.center.y) || 0;
                const rx1 = a.radiusX || a.majorAxisLength || 0;
                const ry1 = a.radiusY || a.minorAxisLength || 0;
                const cx2 = b.cx || (b.center && b.center.x) || 0;
                const cy2 = b.cy || (b.center && b.center.y) || 0;
                const rx2 = b.radiusX || b.majorAxisLength || 0;
                const ry2 = b.radiusY || b.minorAxisLength || 0;
                return near(cx1, cx2) && near(cy1, cy2) &&
                       near(rx1, rx2) && near(ry1, ry2);
            }
            default:
                return false;
        }
    }

    function arePointsArraysDuplicate(ptsA, ptsB) {
        if (ptsA.length !== ptsB.length) return false;
        if (ptsA.length === 0) return true;
        let fwd = true;
        for (let i = 0; i < ptsA.length; i++) {
            if (!nearPt(ptsA[i], ptsB[i])) { fwd = false; break; }
        }
        if (fwd) return true;
        let rev = true;
        for (let i = 0; i < ptsA.length; i++) {
            if (!nearPt(ptsA[i], ptsB[ptsB.length - 1 - i])) { rev = false; break; }
        }
        return rev;
    }

    const HASH_STEP = 1;
    const removed = new Set();

    const hashes = objects.map(obj => {
        if (!obj || !obj.type) return '';
        let hx, hy;
        switch (obj.type) {
            case 'line':
                hx = coordHash((obj.x1 + obj.x2) / 2, HASH_STEP);
                hy = coordHash((obj.y1 + obj.y2) / 2, HASH_STEP);
                break;
            case 'arc':
            case 'circle':
            case 'ellipse':
                hx = coordHash(obj.cx || (obj.center && obj.center.x) || 0, HASH_STEP);
                hy = coordHash(obj.cy || (obj.center && obj.center.y) || 0, HASH_STEP);
                break;
            case 'rect':
                hx = coordHash(obj.x + obj.width / 2, HASH_STEP);
                hy = coordHash(obj.y + obj.height / 2, HASH_STEP);
                break;
            case 'polygon': {
                const pts = obj.points || obj.vertices || [];
                if (pts.length > 0) {
                    hx = coordHash(pts.reduce((s, p) => s + p.x, 0) / pts.length, HASH_STEP);
                    hy = coordHash(pts.reduce((s, p) => s + p.y, 0) / pts.length, HASH_STEP);
                } else {
                    hx = coordHash(obj.cx || 0, HASH_STEP);
                    hy = coordHash(obj.cy || 0, HASH_STEP);
                }
                break;
            }
            case 'polyline':
            case 'lwpolyline': {
                const pts = obj.points || obj.vertices || [];
                if (pts.length > 0) {
                    hx = coordHash(pts.reduce((s, p) => s + p.x, 0) / pts.length, HASH_STEP);
                    hy = coordHash(pts.reduce((s, p) => s + p.y, 0) / pts.length, HASH_STEP);
                } else {
                    hx = 0; hy = 0;
                }
                break;
            }
            default:
                hx = 0; hy = 0;
        }
        return obj.type + '|' + hx + '|' + hy;
    });

    for (let i = 0; i < objects.length; i++) {
        if (removed.has(i) || !objects[i]) continue;
        for (let j = i + 1; j < objects.length; j++) {
            if (removed.has(j) || !objects[j]) continue;
            if (hashes[i] !== hashes[j]) continue;
            if (areObjectsDuplicate(objects[i], objects[j])) {
                removed.add(j);
            }
        }
    }

    const result = objects.filter((_, idx) => !removed.has(idx));
    const removedCount = removed.size;

    return { objects: result, removedCount: removedCount };
}

// ═══════════════════════════════════════════════════════════════
// ОБНОВЛЕНИЕ ИТОГОВОЙ ИНФОРМАЦИИ
// ═══════════════════════════════════════════════════════════════

function updateImportSummary() {
    const summaryEl = document.getElementById('importSummary');
    const countEl = document.getElementById('importSummaryCount');
    const partsEl = document.getElementById('importSummaryParts');
    
    if (!summaryEl || !countEl || !partsEl) return;
    
    const selectedFiles = multiImportData.filter(item => item.selected && !item.error);
    const totalParts = selectedFiles.reduce((sum, item) => sum + (parseInt(item.quantity) || 1), 0);
    
    if (selectedFiles.length > 0) {
        summaryEl.style.display = 'block';
        countEl.textContent = selectedFiles.length;
        partsEl.textContent = totalParts;
    } else {
        summaryEl.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════
// ПЕРЕКЛЮЧЕНИЕ ВСЕХ ЧЕКБОКСОВ
// ═══════════════════════════════════════════════════════════════

function toggleAllFileCheckboxes(checked) {
    multiImportData.forEach((item, idx) => {
        if (!item.error) {
            item.selected = checked;
            const checkbox = document.querySelector(`.import-file-checkbox[data-index="${idx}"]`);
            if (checkbox) {
                checkbox.checked = checked;
            }
        }
    });
    updateImportSummary();
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ВЫРЕЗОВ ПОД ГИБКУ (BEND NOTCH) — модификация контура
// ═══════════════════════════════════════════════════════════════
// ВМЕСТО добавления прямоугольников поверх контура, функция
// модифицирует сам контур: разбивает отрезок в точке пересечения
// и вставляет 3 новых отрезка, образующих прямоугольное углубление.
//
// Визуально (вид сверху на край детали):
//   Было:  ────────────────
//                          ↑ точка пересечения
//   Стало: ────┬─────┬────
//               │     │
//               │ 1мм │ 1мм
//               │     │
//               └─────┘
//                ←1мм→
//
// Алгоритм:
// 1. Найти все линии гиба/осевые во allObjects
// 2. Для каждой конечной точки — найти какой отрезок контура
//    содержит эту точку (с допуском 0.5 мм)
// 3. В каждом найденном отрезке контура — разбить его и вставить
//    3 отрезка выреза, образующих прямоугольник 1×1 мм
// 4. Линии гиба/осевые удаляются из результата

function createBendNotches(objects, allObjects) {
    if (!allObjects || allObjects.length === 0) return { objects: objects || [] };

    // 1. Находим все линии гиба и осевые линии
    const bendLines = findBendAndAxialLines(allObjects);
    if (bendLines.length === 0) return { objects: objects || [] };

    // 2. Собираем endpoints с направлением "вглубь детали"
    const bendEndpoints = [];
    for (const bl of bendLines) {
        const len = Math.hypot(bl.x2 - bl.x1, bl.y2 - bl.y1);
        if (len < 0.01) continue;
        const dx = (bl.x2 - bl.x1) / len;
        const dy = (bl.y2 - bl.y1) / len;
        bendEndpoints.push({ x: bl.x1, y: bl.y1, dirX: dx, dirY: dy });
        bendEndpoints.push({ x: bl.x2, y: bl.y2, dirX: -dx, dirY: -dy });
    }

    // 3. Для каждого endpoint находим отрезок контура, на котором он лежит
    const notchPositions = [];
    const DIST_THRESHOLD = 0.5;

    for (const ep of bendEndpoints) {
        let bestDist = DIST_THRESHOLD;
        let bestObjIdx = -1;
        let bestT = 0;

        for (let i = 0; i < objects.length; i++) {
            const obj = objects[i];
            if (!obj || obj.type !== 'line') continue;
            if (isBendOrAxialLine(obj)) continue;

            const dist = pointToSegmentDist(ep.x, ep.y, obj.x1, obj.y1, obj.x2, obj.y2);
            if (dist < bestDist) {
                bestDist = dist;
                bestObjIdx = i;
                const ldx = obj.x2 - obj.x1;
                const ldy = obj.y2 - obj.y1;
                const lenSq = ldx * ldx + ldy * ldy;
                if (lenSq > 0.0001) {
                    bestT = Math.max(0, Math.min(1, ((ep.x - obj.x1) * ldx + (ep.y - obj.y1) * ldy) / lenSq));
                }
            }
        }

        if (bestObjIdx >= 0) {
            let alreadyAdded = false;
            for (const np of notchPositions) {
                if (Math.hypot(np.x - ep.x, np.y - ep.y) < 0.1) {
                    alreadyAdded = true;
                    break;
                }
            }
            if (!alreadyAdded) {
                notchPositions.push({
                    x: ep.x, y: ep.y,
                    lineIdx: bestObjIdx,
                    t: bestT,
                    dirX: ep.dirX,
                    dirY: ep.dirY
                });
            }
        }
    }

    if (notchPositions.length === 0) return { objects: objects || [] };

    // 4. Группируем вырезы по отрезкам контура, сортируем lineIdx по убыванию
    const groupedByLine = {};
    for (const np of notchPositions) {
        if (!groupedByLine[np.lineIdx]) groupedByLine[np.lineIdx] = [];
        groupedByLine[np.lineIdx].push(np);
    }

    const sortedLineIdxs = Object.keys(groupedByLine).map(Number).sort((a, b) => b - a);
    const result = [...objects];
    const notchSize = 1;
    const halfNotch = notchSize / 2;

    for (const lineIdx of sortedLineIdxs) {
        const obj = result[lineIdx];
        if (!obj || obj.type !== 'line') continue;

        const lx = obj.x2 - obj.x1;
        const ly = obj.y2 - obj.y1;
        const lineLen = Math.hypot(lx, ly);
        if (lineLen < 0.01) continue;

        const notches = groupedByLine[lineIdx].sort((a, b) => a.t - b.t);
        const newSegments = [];
        let prevT = 0;

        for (const notch of notches) {
            const t = notch.t;
            const tHalf = halfNotch / lineLen;
            const t1 = Math.max(prevT, t - tHalf);
            const t2 = Math.min(1, t + tHalf);

            const p1x = obj.x1 + lx * t1;
            const p1y = obj.y1 + ly * t1;
            const p2x = obj.x1 + lx * t2;
            const p2y = obj.y1 + ly * t2;

            const a1x = p1x + notch.dirX * notchSize;
            const a1y = p1y + notch.dirY * notchSize;
            const a2x = p2x + notch.dirX * notchSize;
            const a2y = p2y + notch.dirY * notchSize;

            // Сегмент контура от prevT до t1
            if (t1 - prevT > 0.001) {
                newSegments.push({
                    type: 'line',
                    x1: obj.x1 + lx * prevT,
                    y1: obj.y1 + ly * prevT,
                    x2: p1x, y2: p1y,
                    id: Date.now() + Math.random() + Math.random()
                });
            }

            // 3 сегмента выреза: (P1→A1), (A1→A2), (A2→P2)
            newSegments.push({
                type: 'line', x1: p1x, y1: p1y, x2: a1x, y2: a1y,
                id: Date.now() + Math.random() + Math.random(),
                _isBendNotch: true, color: '#00aadd'
            });
            newSegments.push({
                type: 'line', x1: a1x, y1: a1y, x2: a2x, y2: a2y,
                id: Date.now() + Math.random() + Math.random(),
                _isBendNotch: true, color: '#00aadd'
            });
            newSegments.push({
                type: 'line', x1: a2x, y1: a2y, x2: p2x, y2: p2y,
                id: Date.now() + Math.random() + Math.random(),
                _isBendNotch: true, color: '#00aadd'
            });

            prevT = t2;
        }

        // Финальный сегмент от последнего выреза до конца отрезка
        if (1 - prevT > 0.001) {
            newSegments.push({
                type: 'line',
                x1: obj.x1 + lx * prevT,
                y1: obj.y1 + ly * prevT,
                x2: obj.x2, y2: obj.y2,
                id: Date.now() + Math.random() + Math.random()
            });
        }

        result.splice(lineIdx, 1, ...newSegments);
    }

    // 5. Удаляем линии гиба/осевые из результата
    const filtered = result.filter(obj => !obj || !isBendOrAxialLine(obj));

    console.log(`🔧 Bend Notch: врезано ${notchPositions.length} вырезов 1×1 мм в контур детали`);
    return { objects: filtered };
}

/**
 * Проверяет, является ли объект линией гиба или осевой линией
 */
function isBendOrAxialLine(obj) {
    if (!obj) return false;
    const layerName = (obj.layer || '').toString().trim().toLowerCase();
    const lineType = (obj._effectiveLineType || '').toString().trim().toUpperCase();
    const isBend = obj._layerIsAuxiliary === true && /^bend/i.test(layerName);
    const isAxial = (
        /^осев|^_осев|^center|^_center|^axis/i.test(layerName) ||
        /CENTER|^AXIS/i.test(lineType)
    ) && (obj._layerIsAuxiliary === true || obj._isContinuous === false);
    // Любая пунктирная/штриховая линия (DASHED, HIDDEN, PHANTOM и т.д.)
    const isDashed = obj._isContinuous === false;
    return isBend || isAxial || isDashed;
}

/**
 * Находит все линии гиба и осевые линии в массиве объектов
 */
function findBendAndAxialLines(objects) {
    const result = [];
    for (const obj of objects) {
        if (!obj) continue;
        if (isBendOrAxialLine(obj) && obj.type === 'line') {
            const x1 = obj.x1, y1 = obj.y1;
            const x2 = obj.x2, y2 = obj.y2;
            if (Math.hypot(x2 - x1, y2 - y1) > 0.01) {
                result.push({ x1, y1, x2, y2, obj });
            }
        }
    }
    return result;
}

/**
 * Расстояние от точки до отрезка
 */
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.0001) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
return Math.hypot(px - projX, py - projY);
}

// ═══════════════════════════════════════════════════════════════
// ИМПОРТ ВЫБРАННЫХ ДЕТАЛЕЙ
// ═══════════════════════════════════════════════════════════════

function importSelectedParts() {
    const selectedItems = multiImportData.filter(item => item.selected && !item.error);

    if (selectedItems.length === 0) {
        alert('⚠️ Выберите хотя бы один файл для импорта');
        return;
    }

    let importedCount = 0;

    selectedItems.forEach(item => {
        const thickness = item.thickness || 0.8;

        // Применяем вырезы под гибку, если включены (на случай, если пользователь не менял чекбоксы)
        let objectsToImport = item.objects;
        if (item.bendNotchEnabled) {
            const notchResult = createBendNotches(objectsToImport, item.allObjects);
            objectsToImport = notchResult.objects;
        }

        const part = createPartFromImportData(objectsToImport, item.bounds, item.quantity, item.partName, thickness, item.oneCutEnabled);
        if (part) {
            importedCount++;
        }
    });

    closeImportDialog();
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ДЕТАЛИ ИЗ ДАННЫХ ИМПОРТА
// ═══════════════════════════════════════════════════════════════

function createPartFromImportData(objects, bounds, quantity, name, thickness = 0.8, oneCutEnabled = false) {
    if (!objects || objects.length === 0) {
        console.error('❌ Нет объектов для создания детали');
        return null;
    }

    if (!thickness || thickness < 0.1 || thickness > 100) {
        console.warn('⚠️ Некорректная толщина, установлено 0.8 мм');
        thickness = 0.8;
    }

    const normalizedObjects = normalizeImportObjects(objects, bounds);

    const cadObjects = convertToCadObjects(normalizedObjects);

    const dedupResult = removeDuplicateGeometry(cadObjects);
    const finalObjects = dedupResult.objects;

    if (!finalObjects || finalObjects.length === 0) {
        console.error('❌ Не удалось создать CAD объекты');
        return null;
    }

    const normalizedBounds = calculateBounds(finalObjects);

    if (!isFinite(normalizedBounds.width) || !isFinite(normalizedBounds.height) ||
        normalizedBounds.width <= 0 || normalizedBounds.height <= 0) {
        console.error('❌ Некорректные границы детали:', normalizedBounds);
        console.error('   CAD объекты:', finalObjects);
        return null;
    }

    const contour = createContourFromObjects(normalizedObjects, normalizedBounds);

    const part = {
        id: Date.now() + Math.random(),
        name: name || 'Импорт',
        quantity: quantity || 1,
        thickness: thickness,
        objects: finalObjects,
        bounds: normalizedBounds,
        contour: contour,
        width: normalizedBounds.maxX - normalizedBounds.minX,
        height: normalizedBounds.maxY - normalizedBounds.minY,
        area: 0,
        perimeter: 0,
        visible: false,
        rotationMode: 'auto',
        oneCutEnabled: oneCutEnabled,
        spacing: undefined
    };

    const metrics = calculatePartMetrics(part);
    part.area = metrics.area;
    part.perimeter = metrics.perimeter;

    if (typeof parts !== 'undefined') {
        parts.unshift(part); // v4.68: в начало списка
        render();
        updatePartsList();
        if (typeof saveToCache === 'function') saveToCache();

        // ─── АВТОРАСКЛАДКА — если включена ───────────────
        const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
        if (autoNestingCheckbox && autoNestingCheckbox.checked) {
            console.log('🚀 Авторасскладка (импорт DXF): запуск раскладки...');
            setTimeout(async () => {
                try {
                    const nestBtn = document.getElementById('nestMultiParts');
                    if (nestBtn && typeof nestBtn.onclick === 'function') {
                        nestBtn.onclick();
                    } else if (nestBtn) {
                        nestBtn.dispatchEvent(new MouseEvent('click'));
                    }
                } catch (err) {
                    console.error('❌ Ошибка авторасскладки:', err);
                }
            }, 500);
        }
    }

    return part;
}

// ═══════════════════════════════════════════════════════════════
// НОРМАЛИЗАЦИЯ ОБЪЕКТОВ (сдвиг к 0,0)
// ═══════════════════════════════════════════════════════════════

function normalizeImportObjects(objects, bounds) {
    const offsetX = -bounds.minX;
    const offsetY = -bounds.minY;

    return objects.map(obj => {
        // ИСПРАВЛЕНО: используем Object.assign вместо spread для надёжного
        // копирования всех свойств (включая closed, _isContinuous и др.)
        const newObj = Object.assign({}, obj);

        if (obj.type === 'line') {
            newObj.x1 = obj.x1 + offsetX;
            newObj.y1 = obj.y1 + offsetY;
            newObj.x2 = obj.x2 + offsetX;
            newObj.y2 = obj.y2 + offsetY;
        } else if (obj.type === 'arc') {
            newObj.cx = obj.cx + offsetX;
            newObj.cy = obj.cy + offsetY;
        } else if (obj.type === 'circle') {
            newObj.cx = obj.cx + offsetX;
            newObj.cy = obj.cy + offsetY;
        } else if (obj.type === 'rect') {
            newObj.x = obj.x + offsetX;
            newObj.y = obj.y + offsetY;
        } else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'lwpolyline') {
            // ИСПРАВЛЕНО: явно сохраняем флаг closed для полилиний
            if (obj.points) {
                newObj.points = obj.points.map(p => ({
                    x: p.x + offsetX,
                    y: p.y + offsetY
                }));
            }
            if (obj.vertices) {
                newObj.vertices = obj.vertices.map(v => ({
                    x: v.x + offsetX,
                    y: v.y + offsetY
                }));
            }
            // closed флаг уже скопирован через Object.assign, но убедимся
            if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                newObj.closed = obj.closed === true;
            }
        }

        return newObj;
    });
}

// ═══════════════════════════════════════════════════════════════
// ПРЕОБРАЗОВАНИЕ В ОБЪЕКТЫ CAD (с методами draw, getPoints)
// ═══════════════════════════════════════════════════════════════

function convertToCadObjects(objects) {
    // Метаданные, которые нужно перенести с исходных объектов на CAD-объекты
    const META_PROPS = ['color', '_isContinuous', '_effectiveLineType', '_layerIsAuxiliary', 'layer', '_isBendNotch'];

    function copyMeta(src, dst) {
        if (!src || !dst) return;
        for (const prop of META_PROPS) {
            if (src[prop] !== undefined && src[prop] !== null) {
                dst[prop] = src[prop];
            }
        }
    }

    return objects.map(obj => {
        if (!obj || !obj.type) {
            console.warn('⚠️ Объект без типа:', obj);
            return obj;
        }
        
        let cadObj;
        if (obj.type === 'line') {
            cadObj = new Line(obj.x1, obj.y1, obj.x2, obj.y2);
        } else if (obj.type === 'arc') {
            cadObj = new Arc(obj.cx, obj.cy, obj.radius, obj.startAngle, obj.endAngle, obj.direction);
        } else if (obj.type === 'circle') {
            cadObj = new Circle(obj.cx, obj.cy, obj.radius);
        } else if (obj.type === 'rect') {
            cadObj = new Rect(obj.x, obj.y, obj.width, obj.height);
        } else if (obj.type === 'polygon') {
            const points = obj.points || obj.vertices || [];
            if (points.length >= 3) {
                // v4.68: Сохраняем points напрямую (CustomPolygon), НЕ создаём правильный Polygon
                cadObj = {
                    type: 'polygon',
                    points: points.map(p => ({ x: p.x, y: p.y })),
                    closed: true,
                    id: Date.now() + Math.random()
                };
                cadObj.getVertices = function() { return this.points; };
                cadObj.getPoints = function() { return this.points; };
                cadObj.draw = function(ctx) {
                    if (!this.points || this.points.length < 2) return;
                    ctx.strokeStyle = this.color || '#00aadd';
                    ctx.beginPath();
                    ctx.moveTo(this.points[0].x, this.points[0].y);
                    for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                    ctx.closePath();
                    ctx.stroke();
                };
                cadObj.contains = function(x, y) {
                    if (!this.points || this.points.length < 3) return false;
                    let inside = false;
                    for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
                        if (((this.points[i].y > y) !== (this.points[j].y > y)) &&
                            (x < (this.points[j].x - this.points[i].x) * (y - this.points[i].y) / (this.points[j].y - this.points[i].y) + this.points[i].x)) inside = !inside;
                    }
                    return inside;
                };
                cadObj.move = function(dx, dy) { this.points.forEach(p => { p.x += dx; p.y += dy; }); };
                cadObj.clone = function() { const c = {...this}; c.points = this.points.map(p => ({x:p.x,y:p.y})); c.id = Date.now()+Math.random(); return c; };
            }
            if (points.length === 2) {
                cadObj = new Line(points[0].x, points[0].y, points[1].x, points[1].y);
            }
            if (!cadObj) {
                console.warn('⚠️ Polygon без точек:', obj);
                cadObj = obj;
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            // Полилиния остаётся полилинией — НЕ превращаем в Polygon!
            const points = obj.points || obj.vertices || [];
            // ИСПРАВЛЕНО: сохраняем флаг closed!
            const pl = {
                type: obj.type,
                points: [...points],
                closed: obj.closed === true,
                id: obj.id || Date.now() + Math.random()
            };
            if (typeof addPolylineMethods === 'function') {
                addPolylineMethods(pl);
            } else {
                pl.draw = function(ctx) {
                    if (!this.points || this.points.length < 2) return;
                    ctx.beginPath();
                    ctx.moveTo(this.points[0].x, this.points[0].y);
                    for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                    if (this.closed) ctx.closePath();
                    ctx.stroke();
                };
                pl.getPoints = function() {
                    if (this.closed && this.points && this.points.length >= 2) {
                        const pts = this.points.slice();
                        pts.push({ x: this.points[0].x, y: this.points[0].y });
                        return pts;
                    }
                    return this.points || [];
                };
                pl.contains = function(x, y) {
                    if (!this.points || this.points.length < 2) return false;
                    const segCount = this.closed ? this.points.length : this.points.length - 1;
                    for (let i = 0; i < segCount; i++) {
                        const p1 = this.points[i];
                        const p2 = this.points[(i + 1) % this.points.length];
                        const dx = p2.x - p1.x, dy = p2.y - p1.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        if (len < 0.001) continue;
                        const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
                        const px = p1.x + t * dx, py = p1.y + t * dy;
                        if (Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) < 3) return true;
                    }
                    return false;
                };
            }
            cadObj = pl;
        } else {
            cadObj = obj;
        }

        // Переносим цвет и метаданные с исходного объекта на CAD-объект
        copyMeta(obj, cadObj);

        return cadObj;
    });
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ КОНТУРА ДЛЯ РАСКЛАДКИ
// ═══════════════════════════════════════════════════════════════

function createContourFromObjects(objects, bounds) {
    const vertices = [];
    
    objects.forEach(obj => {
        if (obj.type === 'line') {
            vertices.push({ x: obj.x1, y: obj.y1 });
            vertices.push({ x: obj.x2, y: obj.y2 });
        } else if (obj.type === 'arc') {
            let pts;
            if (typeof obj.getPoints === 'function') {
                pts = obj.getPoints(12);
            } else {
                const r = Math.abs(obj.radius || 0);
                if (r > 0) {
                    pts = [];
                    const sa = obj.startAngle ?? 0;
                    const ea = obj.endAngle ?? (2 * Math.PI);
                    const dir = obj.direction === 'CW' ? -1 : 1;
                    let sweep;
                    if (dir > 0) { sweep = ea - sa; if (sweep <= 0) sweep += 2 * Math.PI; }
                    else { sweep = sa - ea; if (sweep <= 0) sweep += 2 * Math.PI; }
                    const segments = Math.max(12, Math.ceil(sweep / (Math.PI / 6)));
                    const step = sweep / segments;
                    for (let i = 0; i <= segments; i++) {
                        const a = sa + dir * step * i;
                        pts.push({
                            x: (obj.cx || 0) + Math.cos(a) * r,
                            y: (obj.cy || 0) + Math.sin(a) * r
                        });
                    }
                } else {
                    pts = [];
                }
            }
            pts.forEach(p => vertices.push({ x: p.x, y: p.y }));
        } else if (obj.type === 'circle') {
            vertices.push({ x: obj.cx - obj.radius, y: obj.cy });
            vertices.push({ x: obj.cx + obj.radius, y: obj.cy });
            vertices.push({ x: obj.cx, y: obj.cy - obj.radius });
            vertices.push({ x: obj.cx, y: obj.cy + obj.radius });
        } else if (obj.type === 'rect') {
            vertices.push({ x: obj.x, y: obj.y });
            vertices.push({ x: obj.x + obj.width, y: obj.y });
            vertices.push({ x: obj.x + obj.width, y: obj.y + obj.height });
            vertices.push({ x: obj.x, y: obj.y + obj.height });
        } else if (obj.type === 'polygon' && obj.points) {
            obj.points.forEach(p => vertices.push({ x: p.x, y: p.y }));
        } else if ((obj.type === 'polyline' || obj.type === 'lwpolyline') && obj.points) {
            obj.points.forEach(p => vertices.push({ x: p.x, y: p.y }));
        }
    });
    
    const hull = convexHull(vertices);
    
    return hull.length > 0 ? hull : vertices;
}

// ═══════════════════════════════════════════════════════════════
// ЗАКРЫТИЕ ДИАЛОГА И СБРОС
// ═══════════════════════════════════════════════════════════════

function closeImportDialog() {
    document.getElementById('importDXFDialog').style.display = 'none';
    resetImport();
    document.getElementById('importDXFInput').value = '';
}

function resetImport() {
    multiImportData = [];
    const fileList = document.getElementById('importFileList');
    if (fileList) {
        fileList.innerHTML = '<div style="padding:20px;text-align:center;color:#888;font-size:12px;">Выберите файлы DXF для импорта</div>';
    }
    const summary = document.getElementById('importSummary');
    if (summary) {
        summary.style.display = 'none';
    }
    const warning = document.getElementById('importFileLimitWarning');
    if (warning) {
        warning.style.display = 'none';
    }
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Вычисление площади и периметра детали
function calculatePartMetrics(part) {
    let perimeter = 0;
    const objects = part.objects || [];

    objects.forEach(obj => {
        perimeter += getSegmentLength(obj);
    });

    let area = calculatePartArea(part);

    const thickness = part.thickness || 0.8;
    const steelDensity = 0.00785;
    const weightGrams = area * thickness * steelDensity;
    const weightKg = weightGrams / 1000;

    return { area, perimeter, weight: weightKg, weightGrams };
}

/**
 * Вычисляет длину одного CAD-объекта (сегмента)
 */
function getSegmentLength(obj) {
    if (!obj || !obj.type) return 0;

    switch (obj.type) {
        case 'line': {
            const dx = obj.x2 - obj.x1;
            const dy = obj.y2 - obj.y1;
            return Math.sqrt(dx * dx + dy * dy);
        }
        case 'arc': {
            if (typeof obj.getLength === 'function') return obj.getLength();
            const r = Math.abs(obj.radius || 0);
            if (r <= 0) return 0;
            const sa = obj.startAngle ?? 0;
            const ea = obj.endAngle ?? (2 * Math.PI);
            const dirVal = obj.direction;
            const isCCW = (dirVal === 'CCW' || dirVal === 1 || (typeof dirVal === 'number' && dirVal >= 0));
            let sweep;
            if (isCCW) {
                sweep = ea - sa;
                if (sweep <= 0) sweep += 2 * Math.PI;
            } else {
                sweep = sa - ea;
                if (sweep <= 0) sweep += 2 * Math.PI;
            }
            if (sweep > 2 * Math.PI) sweep = 2 * Math.PI;
            return r * sweep;
        }
        case 'circle':
            return 2 * Math.PI * Math.abs(obj.radius || 0);
        case 'rect':
            return 2 * (Math.abs(obj.width || 0) + Math.abs(obj.height || 0));
        case 'polygon': {
            const pts = (typeof obj.getPoints === 'function') ? obj.getPoints() :
                        (obj.points || obj.vertices || []);
            if (obj.sides && typeof obj.radius === 'number') {
                return obj.sides * 2 * Math.abs(obj.radius) * Math.sin(Math.PI / obj.sides);
            }
            let len = 0;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                len += Math.sqrt(Math.pow(pts[j].x - pts[i].x, 2) + Math.pow(pts[j].y - pts[i].y, 2));
            }
            return len;
        }
        case 'polyline':
        case 'lwpolyline': {
            const pts = obj.points || obj.vertices || [];
            let len = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                len += Math.sqrt(Math.pow(pts[i + 1].x - pts[i].x, 2) + Math.pow(pts[i + 1].y - pts[i].y, 2));
            }
            // ИСПРАВЛЕНО: для замкнутых полилиний добавляем длину замыкающего сегмента
            if (obj.closed && pts.length >= 2) {
                const first = pts[0];
                const last = pts[pts.length - 1];
                len += Math.sqrt(Math.pow(first.x - last.x, 2) + Math.pow(first.y - last.y, 2));
            }
            return len;
        }
        case 'spline': {
            const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            let len = 0;
            for (let i = 0; i < pts.length - 1; i++) {
                len += Math.sqrt(Math.pow(pts[i + 1].x - pts[i].x, 2) + Math.pow(pts[i + 1].y - pts[i].y, 2));
            }
            return len;
        }
        case 'path': {
            const bw = obj.width || (obj.bounds?.width) || 0;
            const bh = obj.height || (obj.bounds?.height) || 0;
            if (bw > 0 && bh > 0) return 2 * (bw + bh) * 0.6;
            return 0;
        }
        case 'ellipse': {
            const rx = Math.abs(obj.radiusX || obj.majorAxisLength || 0);
            const ry = Math.abs(obj.radiusY || obj.minorAxisLength || 0);
            if (rx <= 0 || ry <= 0) return 0;
            const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
            return Math.PI * (rx + ry) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
        }
        default:
            return 0;
    }
}

/**
 * Вычисляет площадь детали по контуру.
 */
function calculatePartArea(part) {
    const objects = part.objects || [];
    if (objects.length === 0) return 0;

    // ── Быстрая проверка: один простой объект ──
    if (objects.length === 1) {
        const obj = objects[0];
        if (obj.type === 'rect') return Math.abs(obj.width || 0) * Math.abs(obj.height || 0);
        if (obj.type === 'circle') return Math.PI * Math.pow(Math.abs(obj.radius || 0), 2);
        if (obj.type === 'polygon') {
            const pts = obj.points || obj.vertices || [];
            if (obj.sides && typeof obj.radius === 'number') {
                return (obj.sides * Math.pow(Math.abs(obj.radius), 2) * Math.sin(2 * Math.PI / obj.sides)) / 2;
            }
            return Math.abs(shoelaceArea(pts));
        }
        if (obj.type === 'ellipse') {
            const rx = Math.abs(obj.radiusX || obj.majorAxisLength || 0);
            const ry = Math.abs(obj.radiusY || obj.minorAxisLength || 0);
            return Math.PI * rx * ry;
        }
    }

    // ── Замкнутая полилиния ──
    // ИСПРАВЛЕНО: проверяем флаг closed! Открытая полилиния — не замкнутый контур,
    // площадь по Shoelace для неё бессмысленна.
    if (objects.length === 1 && (objects[0].type === 'polyline' || objects[0].type === 'lwpolyline')) {
        const obj = objects[0];
        const pts = obj.points || obj.vertices || [];
        if (obj.closed && pts.length >= 3) {
            return Math.abs(shoelaceArea(pts));
        }
        // Открытая полилиния — площадь = 0 (незамкнутый контур)
        return 0;
    }

    // ── Составной контур (line + arc + ...) ──
    const contourPoints = [];
    objects.forEach(obj => {
        if (obj.type === 'line') {
            contourPoints.push({ x: obj.x1, y: obj.y1 });
        } else if (obj.type === 'arc') {
            let pts;
            if (typeof obj.getPoints === 'function') {
                pts = obj.getPoints(24);
            } else {
                pts = discretizeArc(obj, 24);
            }
            for (let i = 0; i < pts.length - 1; i++) {
                contourPoints.push(pts[i]);
            }
        } else if (obj.type === 'circle') {
            const r = Math.abs(obj.radius || 0);
            for (let i = 0; i < 24; i++) {
                const a = (2 * Math.PI * i) / 24;
                contourPoints.push({ x: obj.cx + Math.cos(a) * r, y: obj.cy + Math.sin(a) * r });
            }
        } else if (obj.type === 'rect') {
            contourPoints.push({ x: obj.x, y: obj.y });
            contourPoints.push({ x: obj.x + obj.width, y: obj.y });
            contourPoints.push({ x: obj.x + obj.width, y: obj.y + obj.height });
            contourPoints.push({ x: obj.x, y: obj.y + obj.height });
        } else if (obj.type === 'polygon' && (obj.points || obj.vertices)) {
            const pts = obj.points || obj.vertices;
            pts.forEach(p => contourPoints.push({ x: p.x, y: p.y }));
        } else if ((obj.type === 'polyline' || obj.type === 'lwpolyline') && (obj.points || obj.vertices)) {
            const pts = obj.points || obj.vertices;
            pts.forEach(p => contourPoints.push({ x: p.x, y: p.y }));
        } else if (obj.type === 'spline') {
            const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            pts.forEach(p => contourPoints.push({ x: p.x, y: p.y }));
        } else if (obj.type === 'ellipse') {
            const cx = obj.cx || obj.center?.x || 0;
            const cy = obj.cy || obj.center?.y || 0;
            const rx = Math.abs(obj.radiusX || obj.majorAxisLength || 0);
            const ry = Math.abs(obj.radiusY || obj.minorAxisLength || 0);
            for (let i = 0; i < 24; i++) {
                const a = (2 * Math.PI * i) / 24;
                contourPoints.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
            }
        }
    });

    if (contourPoints.length >= 3) {
        const shoelaceResult = Math.abs(shoelaceArea(contourPoints));
        if (shoelaceResult > 0) return shoelaceResult;
    }

    // Fallback: bbox * коэффициент заполнения
    const bounds = part.bounds || calculateBounds(objects);
    const bboxArea = bounds.width * bounds.height;
    return bboxArea * 0.6;
}

/**
 * Формула Гаусса (Shoelace) для площади многоугольника
 */
function shoelaceArea(points) {
    if (!points || points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
}

/**
 * Дискретизация дуги в массив точек
 */
function discretizeArc(obj, segments) {
    segments = segments || 24;
    const r = Math.abs(obj.radius || 0);
    if (r <= 0) return [];
    const sa = obj.startAngle ?? 0;
    const ea = obj.endAngle ?? (2 * Math.PI);
    const dirVal = obj.direction;
    const isCCW = (dirVal === 'CCW' || dirVal === 1 || (typeof dirVal === 'number' && dirVal >= 0));
    let sweep;
    if (isCCW) {
        sweep = ea - sa;
        if (sweep <= 0) sweep += 2 * Math.PI;
    } else {
        sweep = sa - ea;
        if (sweep <= 0) sweep += 2 * Math.PI;
    }
    const dir = isCCW ? 1 : -1;
    const step = sweep / segments;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const a = sa + dir * step * i;
        pts.push({
            x: (obj.cx || 0) + Math.cos(a) * r,
            y: (obj.cy || 0) + Math.sin(a) * r
        });
    }
    return pts;
}

// Вычисление выпуклой оболочки (алгоритм Джарвиса)
function convexHull(points) {
    if (points.length < 3) return points;
    
    const unique = [];
    const seen = new Set();
    points.forEach(p => {
        const key = `${p.x},${p.y}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(p);
        }
    });
    
    if (unique.length < 3) return unique;
    
    let leftMost = 0;
    for (let i = 1; i < unique.length; i++) {
        if (unique[i].x < unique[leftMost].x || 
            (unique[i].x === unique[leftMost].x && unique[i].y < unique[leftMost].y)) {
            leftMost = i;
        }
    }
    
    const hull = [];
    let current = leftMost;
    
    do {
        hull.push(unique[current]);
        let next = 0;
        for (let i = 1; i < unique.length; i++) {
            if (next === current || isLeftTurn(unique[current], unique[next], unique[i])) {
                next = i;
            }
        }
        current = next;
    } while (current !== leftMost && hull.length < unique.length);
    
    return hull;
}

function isLeftTurn(p1, p2, p3) {
    const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
    return cross > 0;
}

// ═══════════════════════════════════════════════════════════════
// АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ═══════════════════════════════════════════════════════════════

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDXFImportHandlers);
} else {
    initDXFImportHandlers();
}

// ═══════════════════════════════════════════════════════════════
// КЛИК ПО ПУСТОЙ ОБЛАСТИ СПИСКА ДЕТАЛЕЙ = ИМПОРТ DXF
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    const partsList = document.getElementById('partsList');
    if (partsList) {
        partsList.addEventListener('click', (e) => {
            if (e.target.closest('.part-card') || 
                e.target.closest('button') || 
                e.target.closest('input') || 
                e.target.closest('.nesting-checkbox')) {
                return;
            }

            document.getElementById('importDXFInput').click();
        });
    }
});