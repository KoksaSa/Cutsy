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
        /^(\d+)\s*(?:шт|дет|детали)/i,  // "2 шт", "2шт", "2 дет", "2 детали" (в начале)
        /^(\d+)\s*[-–—]/,                // "2 -", "2 –", "2 —" (в начале)
        /^(\d+)\s/,                       // "2 " (число + пробел в начале)
        /(\d+)\s*(?:шт|дет|детали)/i,    // "противень 2 шт", "Боковина-3 дет" (в любом месте)
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
    
    console.log(`📝 parseDXFFileName: "${fileName}" → qty=${result.quantity}, thickness=${result.thickness}`);
    
    return result;
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
                e.target.files = new FileList(files);
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

    console.log('✅ Обработчики мульти-импорта DXF инициализированы');
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

            // Сохраняем данные для импорта
            const importItem = {
                index: i,
                fileName: file.name,
                partName: parsed.name,  // Имя из парсинга
                quantity: parsed.quantity,  // Количество из парсинга
                thickness: parsed.thickness,  // Толщина из парсинга
                oneCutEnabled: false,  // "В один рез" по умолчанию выключено
                objects: result.objects,
                bounds: result.bounds,
                entityCount: result.entityCount,
                selected: true,
                error: null
            };

            multiImportData.push(importItem);

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
        
        return `
            <div class="import-file-item">
                <input type="checkbox" class="import-file-checkbox" data-index="${idx}" ${item.selected ? 'checked' : ''}>
                <div class="import-file-thumbnail" id="thumbnail-${idx}">
                    <!-- Миниатюра будет отрисована здесь -->
                </div>
                <div class="import-file-info">
                    <div class="import-file-name">${escapeHtml(item.fileName)}</div>
                    <div class="import-file-details">
                        📐 ${Math.round(item.bounds.width)} × ${Math.round(item.bounds.height)} мм |
                        🔷 Объектов: ${item.entityCount}
                    </div>
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

    // Отрисовываем миниатюры для успешных файлов
    multiImportData.forEach((item, idx) => {
        if (!item.error && item.objects && item.objects.length > 0) {
            drawThumbnail(idx, item.objects, item.bounds);
        }
    });
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
    
    objects.forEach(obj => {
        if (obj.type === 'line') {
            svgContent += `<line x1="${obj.x1}" y1="${obj.y1}" x2="${obj.x2}" y2="${obj.y2}" stroke="#007acc" stroke-width="${0.5 / scale}"/>`;
        } else if (obj.type === 'circle') {
            svgContent += `<circle cx="${obj.cx}" cy="${obj.cy}" r="${obj.radius}" stroke="#007acc" stroke-width="${0.5 / scale}" fill="none"/>`;
        } else if (obj.type === 'rect') {
            svgContent += `<rect x="${obj.x}" y="${obj.y}" width="${obj.width}" height="${obj.height}" stroke="#007acc" stroke-width="${0.5 / scale}" fill="none"/>`;
        } else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const points = obj.points || obj.vertices || [];
            if (points.length > 0) {
                const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polygon points="${pointsStr}" stroke="#007acc" stroke-width="${0.5 / scale}" fill="none"/>`;
            }
        }
    });
    
    svgContent += '</g></svg>';
    container.innerHTML = svgContent;
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
        // Получаем толщину из данных элемента (индивидуальная для каждого файла)
        const thickness = item.thickness || 0.8;
        
        // Создаём деталь из импортированных объектов
        const part = createPartFromImportData(item.objects, item.bounds, item.quantity, item.partName, thickness, item.oneCutEnabled);
        if (part) {
            importedCount++;
            console.log(`✅ Импортирована деталь "${item.partName}" (${item.quantity} шт, толщина ${thickness} мм)`);
        }
    });

    // Закрываем диалог
    closeImportDialog();

    if (importedCount > 0) {
        console.log(`✅ Импортировано деталей: ${importedCount}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ДЕТАЛИ ИЗ ДАННЫХ ИМПОРТА
// ═══════════════════════════════════════════════════════════════

function createPartFromImportData(objects, bounds, quantity, name, thickness = 0.8, oneCutEnabled = false) {
    if (!objects || objects.length === 0) {
        console.error('❌ Нет объектов для создания детали');
        return null;
    }

    // Валидация толщины
    if (!thickness || thickness < 0.1 || thickness > 100) {
        console.warn('⚠️ Некорректная толщина, установлено 0.8 мм');
        thickness = 0.8;
    }

    // Нормализуем координаты (сдвигаем к 0,0)
    const normalizedObjects = normalizeImportObjects(objects, bounds);

    // Преобразуем простые объекты в объекты классов CAD
    const cadObjects = convertToCadObjects(normalizedObjects);

    // Проверяем, что объекты созданы правильно
    if (!cadObjects || cadObjects.length === 0) {
        console.error('❌ Не удалось создать CAD объекты');
        return null;
    }

    // Пересчитываем границы для CAD объектов
    const normalizedBounds = calculateBounds(cadObjects);

    // Проверяем, что границы корректны
    if (!isFinite(normalizedBounds.width) || !isFinite(normalizedBounds.height) ||
        normalizedBounds.width <= 0 || normalizedBounds.height <= 0) {
        console.error('❌ Некорректные границы детали:', normalizedBounds);
        console.error('   CAD объекты:', cadObjects);
        return null;
    }

    // Создаём объект контура для раскладки
    const contour = createContourFromObjects(normalizedObjects, normalizedBounds);

    // Создаём деталь
    const part = {
        id: Date.now() + Math.random(),
        name: name || 'Импорт',
        quantity: quantity || 1,
        thickness: thickness,  // Толщина металла (мм)
        objects: cadObjects,
        bounds: normalizedBounds,
        contour: contour,
        width: normalizedBounds.maxX - normalizedBounds.minX,
        height: normalizedBounds.maxY - normalizedBounds.minY,
        area: 0,
        perimeter: 0,
        visible: false,  // Импорт НЕ показывает деталь на холсте
        rotationMode: 'auto',  // Режим вращения: 'fast' (0° и 90°), 'full' (19 углов), 'auto' (авто)
        oneCutEnabled: oneCutEnabled  // "В один рез": false = обычная раскладка, true = с общими гранями
    };

    // Вычисляем площадь и периметр
    const metrics = calculatePartMetrics(part);
    part.area = metrics.area;
    part.perimeter = metrics.perimeter;

    // Добавляем в список деталей
    if (typeof parts !== 'undefined') {
        parts.push(part);

        // НЕ добавляем объекты на холст (visible: false)

        render();
        updatePartsList();
        if (typeof saveToCache === 'function') saveToCache();
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
        const newObj = { ...obj };

        if (obj.type === 'line') {
            newObj.x1 = obj.x1 + offsetX;
            newObj.y1 = obj.y1 + offsetY;
            newObj.x2 = obj.x2 + offsetX;
            newObj.y2 = obj.y2 + offsetY;
        } else if (obj.type === 'circle') {
            newObj.cx = obj.cx + offsetX;
            newObj.cy = obj.cy + offsetY;
        } else if (obj.type === 'rect') {
            newObj.x = obj.x + offsetX;
            newObj.y = obj.y + offsetY;
        } else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'lwpolyline') {
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
        }

        return newObj;
    });
}

// ═══════════════════════════════════════════════════════════════
// ПРЕОБРАЗОВАНИЕ В ОБЪЕКТЫ CAD (с методами draw, getPoints)
// ═══════════════════════════════════════════════════════════════

function convertToCadObjects(objects) {
    return objects.map(obj => {
        if (!obj || !obj.type) {
            console.warn('⚠️ Объект без типа:', obj);
            return obj;
        }
        
        if (obj.type === 'line') {
            return new Line(obj.x1, obj.y1, obj.x2, obj.y2);
        } else if (obj.type === 'circle') {
            return new Circle(obj.cx, obj.cy, obj.radius);
        } else if (obj.type === 'rect') {
            return new Rect(obj.x, obj.y, obj.width, obj.height);
        } else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'lwpolyline') {
            // Для полилиний создаём многоугольник по точкам
            const points = obj.points || obj.vertices || [];
            if (points.length >= 3) {
                // Вычисляем центр и радиус для создания Polygon
                const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
                const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
                const maxDist = Math.max(...points.map(p =>
                    Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2))
                ));
                return new Polygon(centerX, centerY, maxDist, points.length);
            }
            // Если точек меньше 3, создаём линии из точек
            if (points.length === 2) {
                return new Line(points[0].x, points[0].y, points[1].x, points[1].y);
            }
            console.warn('⚠️ Полилиния без точек или меньше 2:', obj);
            return obj;
        }
        return obj;
    });
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ КОНТУРА ДЛЯ РАСКЛАДКИ
// ═══════════════════════════════════════════════════════════════

function createContourFromObjects(objects, bounds) {
    // Собираем все вершины из объектов
    const vertices = [];
    
    objects.forEach(obj => {
        if (obj.type === 'line') {
            vertices.push({ x: obj.x1, y: obj.y1 });
            vertices.push({ x: obj.x2, y: obj.y2 });
        } else if (obj.type === 'rect') {
            vertices.push({ x: obj.x, y: obj.y });
            vertices.push({ x: obj.x + obj.width, y: obj.y });
            vertices.push({ x: obj.x + obj.width, y: obj.y + obj.height });
            vertices.push({ x: obj.x, y: obj.y + obj.height });
        } else if (obj.type === 'polygon' && obj.points) {
            obj.points.forEach(p => vertices.push({ x: p.x, y: p.y }));
        }
    });
    
    // Находим выпуклую оболочку для упрощённого контура
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
    let area = 0;
    let perimeter = 0;
    
    const objects = part.objects || [];
    
    objects.forEach(obj => {
        if (obj.type === 'rect') {
            area += obj.width * obj.height;
            perimeter += 2 * (obj.width + obj.height);
        } else if (obj.type === 'circle') {
            area += Math.PI * obj.radius * obj.radius;
            perimeter += 2 * Math.PI * obj.radius;
        } else if (obj.type === 'line') {
            const length = Math.sqrt(Math.pow(obj.x2 - obj.x1, 2) + Math.pow(obj.y2 - obj.y1, 2));
            perimeter += length;
        } else if (obj.type === 'polygon' && obj.points) {
            // Площадь многоугольника (формула Гаусса)
            const points = obj.points;
            let polygonArea = 0;
            for (let i = 0; i < points.length; i++) {
                const j = (i + 1) % points.length;
                polygonArea += points[i].x * points[j].y;
                polygonArea -= points[j].x * points[i].y;
            }
            area += Math.abs(polygonArea) / 2;
            
            // Периметр многоугольника
            for (let i = 0; i < points.length; i++) {
                const j = (i + 1) % points.length;
                perimeter += Math.sqrt(Math.pow(points[j].x - points[i].x, 2) + Math.pow(points[j].y - points[i].y, 2));
            }
        }
    });

    // Рассчитываем вес детали
    // Площадь в мм², толщина в мм, плотность стали 7.85 г/см³ = 0.00785 г/мм³
    const thickness = part.thickness || 0.8;  // Толщина металла (мм)
    const steelDensity = 0.00785;  // г/мм³
    const weightGrams = area * thickness * steelDensity;  // Вес в граммах
    const weightKg = weightGrams / 1000;  // Вес в килограммах

    return { area, perimeter, weight: weightKg, weightGrams };
}

// Вычисление выпуклой оболочки (алгоритм Джарвиса)
function convexHull(points) {
    if (points.length < 3) return points;
    
    // Удаляем дубликаты
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
    
    // Находим левую нижнюю точку
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
            // Если кликнули по карточке детали или кнопке - не открываем импорт
            if (e.target.closest('.part-card') || 
                e.target.closest('button') || 
                e.target.closest('input') || 
                e.target.closest('.nesting-checkbox')) {
                return;
            }

            // Клик по пустому месту списка - открываем импорт DXF
            document.getElementById('importDXFInput').click();
        });
    }
});
