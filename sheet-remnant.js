// ═══════════════════════════════════════════════════════════════
// ФОТО-ОСТАТОК ЛИСТА (Sheet Remnant)
// ═══════════════════════════════════════════════════════════════
// Загрузка фото остатка, калибровка по 2 точкам, создание остатка листа

// ═══════════════════════════════════════════════════════════════
// ЗАГРУЗКА ФОТО ОСТАТКА
// ═══════════════════════════════════════════════════════════════

/**
 * Загрузить фото остатка листа из файла
 * @param {File} file - файл изображения
 */
async function loadSheetRemnantImage(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('⚠️ Пожалуйста, выберите изображение (JPG/PNG)');
        return;
    }

    try {
        const img = new Image();
        img.onload = function() {
            // Сохраняем изображение
            sheetBackgroundImage = img;
            window.sheetBackgroundImage = img;

            // Сбрасываем масштаб (будет настроен при калибровке)
            sheetImageScale = 1;
            window.sheetImageScale = 1;

            // Сохраняем исходный размер фото в пикселях
            sheetImageSize = {
                width: img.width,
                height: img.height
            };

            // Показываем лист
            showSheetView = true;

            // Включаем режим калибровки
            isCalibrating = true;
            window.isCalibrating = true;
            calibratePoint1 = null;
            calibratePoint2 = null;

            // Устанавливаем размер листа по размеру фото (в пикселях)
            sheetSize = {
                width: img.width,
                height: img.height
            };

            // Синхронизируем переменные
            syncSheetRemnantVars();

            // Показываем диалог калибровки
            showCalibrationDialog();

            render();

            console.log(`✅ Фото загружено: ${img.width}×${img.height} px`);
            console.log('📏 Включён режим калибровки - обведите 2 точки на фото');
        };

        img.onerror = function() {
            alert('❌ Ошибка загрузки изображения');
            console.error('Ошибка загрузки изображения');
        };

        img.src = URL.createObjectURL(file);
    } catch (err) {
        console.error('Ошибка загрузки фото:', err);
        alert('❌ Ошибка загрузки фото: ' + err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// ДИАЛОГ КАЛИБРОВКИ
// ═══════════════════════════════════════════════════════════════

/**
 * Показать диалог калибровки фото
 */
function showCalibrationDialog() {
    // Проверяем, есть ли уже диалог
    let dialog = document.getElementById('calibrationDialog');
    if (!dialog) {
        // Создаём диалог
        dialog = document.createElement('div');
        dialog.id = 'calibrationDialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #252526;
            border: 1px solid #3c3c3c;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.7);
            z-index: 10001;
            min-width: 400px;
            max-width: 95vw;
        `;
        dialog.innerHTML = `
            <h3 style="margin:0 0 15px 0;color:#007acc;font-size:16px;">📏 Калибровка фото остатка</h3>
            
            <div style="color:#ccc;font-size:12px;line-height:1.8;margin-bottom:15px;">
                <strong>Шаг 1:</strong> Кликните первую точку на фото (например, край листа)<br>
                <strong>Шаг 2:</strong> Кликните вторую точку на фото<br>
                <strong>Шаг 3:</strong> Введите реальное расстояние между точками (мм)
            </div>
            
            <div style="background:#1e1e1e;padding:10px;border-radius:4px;margin-bottom:15px;">
                <div style="color:#aaa;font-size:11px;margin-bottom:5px;">Точка 1:</div>
                <div id="calibratePoint1Info" style="color:#fff;font-size:13px;">Не выбрана</div>
                <div style="color:#aaa;font-size:11px;margin-bottom:5px;margin-top:8px;">Точка 2:</div>
                <div id="calibratePoint2Info" style="color:#fff;font-size:13px;">Не выбрана</div>
            </div>
            
            <div id="calibrateDistanceSection" style="display:none;margin-bottom:15px;">
                <label style="color:#aaa;font-size:11px;display:block;margin-bottom:5px;">📏 Расстояние между точками (пиксели):</label>
                <div id="calibratePixelDist" style="color:#fff;font-size:13px;padding:8px;background:#1e1e1e;border-radius:4px;"></div>
                
                <label style="color:#aaa;font-size:11px;display:block;margin-bottom:5px;margin-top:10px;">📐 Реальный размер (мм):</label>
                <input type="number" id="calibrateRealDist" value="1000" min="1" max="10000" step="1"
                    style="width:100%;padding:8px;background:#3c3c3c;color:#fff;border:1px solid #555;border-radius:4px;font-size:13px;">
                
                <div style="color:#2d7d2d;font-size:11px;margin-top:8px;">
                    📊 Масштаб: <span id="calibrateScaleInfo">-</span> px/мм
                </div>
            </div>
            
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="calibrateReset" style="padding:8px 16px;background:#5a4a7a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">🔄 Сбросить точки</button>
                <button id="calibrateCancel" style="padding:8px 16px;background:#3c3c3c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Отмена</button>
                <button id="calibrateApply" style="padding:8px 16px;background:#007acc;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;" disabled>✅ Применить</button>
            </div>
        `;
        document.body.appendChild(dialog);

        // Обработчики
        document.getElementById('calibrateCancel').addEventListener('click', () => {
            cancelCalibration();
        });

        document.getElementById('calibrateReset').addEventListener('click', () => {
            calibratePoint1 = null;
            calibratePoint2 = null;
            updateCalibrationDialog();
            render();
        });

        document.getElementById('calibrateApply').addEventListener('click', () => {
            applyCalibration();
        });

        document.getElementById('calibrateRealDist').addEventListener('input', () => {
            updateCalibrationDialog();
        });
    }

    // Показываем диалог
    dialog.style.display = 'block';
    updateCalibrationDialog();
}

/**
 * Обновить информацию в диалоге калибровки
 */
function updateCalibrationDialog() {
    const point1Info = document.getElementById('calibratePoint1Info');
    const point2Info = document.getElementById('calibratePoint2Info');
    const distSection = document.getElementById('calibrateDistanceSection');
    const pixelDist = document.getElementById('calibratePixelDist');
    const scaleInfo = document.getElementById('calibrateScaleInfo');
    const applyBtn = document.getElementById('calibrateApply');

    if (calibratePoint1) {
        point1Info.textContent = `✅ (${Math.round(calibratePoint1.x)}, ${Math.round(calibratePoint1.y)})`;
        point1Info.style.color = '#2d7d2d';
    } else {
        point1Info.textContent = 'Не выбрана';
        point1Info.style.color = '#888';
    }

    if (calibratePoint2) {
        point2Info.textContent = `✅ (${Math.round(calibratePoint2.x)}, ${Math.round(calibratePoint2.y)})`;
        point2Info.style.color = '#2d7d2d';
    } else {
        point2Info.textContent = 'Не выбрана';
        point2Info.style.color = '#888';
    }

    if (calibratePoint1 && calibratePoint2) {
        const dx = calibratePoint2.x - calibratePoint1.x;
        const dy = calibratePoint2.y - calibratePoint1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        distSection.style.display = 'block';
        pixelDist.textContent = `${Math.round(dist)} px`;

        const realDist = parseFloat(document.getElementById('calibrateRealDist').value) || 1000;
        const scale = dist / realDist;
        scaleInfo.textContent = scale.toFixed(3);

        applyBtn.disabled = false;
    } else {
        distSection.style.display = 'none';
        applyBtn.disabled = true;
    }
}

/**
 * Отменить калибровку
 */
function cancelCalibration() {
    const dialog = document.getElementById('calibrationDialog');
    if (dialog) {
        dialog.style.display = 'none';
    }

    isCalibrating = false;
    window.isCalibrating = false;
    calibratePoint1 = null;
    calibratePoint2 = null;

    render();
}

/**
 * Применить калибровку
 */
function applyCalibration() {
    if (!calibratePoint1 || !calibratePoint2) {
        alert('⚠️ Выберите 2 точки на фото');
        return;
    }

    const dx = calibratePoint2.x - calibratePoint1.x;
    const dy = calibratePoint2.y - calibratePoint1.y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);

    const realDist = parseFloat(document.getElementById('calibrateRealDist').value);
    if (!realDist || realDist <= 0) {
        alert('⚠️ Введите корректный реальный размер');
        return;
    }

    // Вычисляем масштаб: сколько пикселей в 1 мм
    sheetImageScale = pixelDist / realDist;
    window.sheetImageScale = sheetImageScale;

    // Вычисляем реальный размер фото в мм
    sheetImageSize = {
        width: sheetBackgroundImage.width / sheetImageScale,
        height: sheetBackgroundImage.height / sheetImageScale
    };

    // Обновляем размер листа
    sheetSize = {
        width: sheetImageSize.width,
        height: sheetImageSize.height
    };

    // Закрываем и удаляем диалог
    const dialog = document.getElementById('calibrationDialog');
    if (dialog) {
        dialog.remove();
    }

    // Выключаем режим калибровки
    isCalibrating = false;
    window.isCalibrating = false;
    calibratePoint1 = null;
    calibratePoint2 = null;

    syncSheetRemnantVars();

    render();

    console.log(`✅ Калибровка применена:`);
    console.log(`   Пиксельное расстояние: ${pixelDist.toFixed(1)} px`);
    console.log(`   Реальное расстояние: ${realDist} мм`);
    console.log(`   Масштаб: ${sheetImageScale.toFixed(3)} px/мм`);
    console.log(`   Размер фото: ${sheetImageSize.width.toFixed(0)}×${sheetImageSize.height.toFixed(0)} мм`);
}

// ═══════════════════════════════════════════════════════════════
// ОБРАБОТКА КЛИКОВ ДЛЯ КАЛИБРОВКИ
// ═══════════════════════════════════════════════════════════════

/**
 * Обработать клик для калибровки
 * @param {number} x - координата X (мировая)
 * @param {number} y - координата Y (мировая)
 */
function handleCalibrationClick(x, y) {
    if (!isCalibrating) return false;

    if (!calibratePoint1) {
        calibratePoint1 = { x, y };
        console.log(`📍 Точка 1: (${x.toFixed(1)}, ${y.toFixed(1)})`);
        updateCalibrationDialog();
        render();
        return true;
    }

    if (!calibratePoint2) {
        calibratePoint2 = { x, y };
        console.log(`📍 Точка 2: (${x.toFixed(1)}, ${y.toFixed(1)})`);
        updateCalibrationDialog();
        render();
        return true;
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ОСТАТКА ЛИСТА ИЗ КОНТУРА
// ═══════════════════════════════════════════════════════════════

/**
 * Создать остаток листа из выделенных объектов (линии, круги, прямоугольники, многоугольники)
 * Автоматически определяет внешний контур и внутренние отверстия
 */
function createSheetRemnantFromSelection() {
    if (selectedObjects.length === 0) {
        alert('⚠️ Выделите контур остатка и/или отверстия');
        return;
    }

    // Принимаем любые объекты (линии, круги, rect, polygon)
    const contourObjects = [...selectedObjects];

    // Вычисляем границы всех объектов
    const bounds = calculateBounds(contourObjects);

    // ═══════════════════════════════════════════════════════════
    // АВТОМАТИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ОТВЕРСТИЙ
    // ═══════════════════════════════════════════════════════════
    // 1. Находим самый большой bounding box = внешний контур
    // 2. Все что внутри = отверстия

    let outerObjects = [];
    let innerObjects = []; // Отверстия

    // Группируем объекты по связности (касающиеся друг друга = один контур)
    const groups = findConnectedContourGroups(contourObjects);

    if (groups.length === 0) {
        alert('⚠️ Не удалось распознать контуры');
        return;
    }

    // Находим группу с самым большим bounding box = внешний контур
    let maxArea = 0;
    let outerGroupIndex = 0;

    groups.forEach((group, idx) => {
        const groupBounds = calculateBounds(group);
        const area = groupBounds.width * groupBounds.height;
        if (area > maxArea) {
            maxArea = area;
            outerGroupIndex = idx;
        }
    });

    // Распределяем: самая большая = внешний контур, остальные = отверстия
    groups.forEach((group, idx) => {
        if (idx === outerGroupIndex) {
            outerObjects = group;
        } else {
            innerObjects.push(group);
        }
    });

    console.log(`🔍 Автоматическое определение контуров:`);
    console.log(`   Внешний контур: ${outerObjects.length} объектов`);
    console.log(`   Отверстия: ${innerObjects.length} контуров`);
    innerObjects.forEach((hole, i) => {
        const holeBounds = calculateBounds(hole);
        console.log(`   Отверстие ${i+1}: ${hole.length} объектов, ${holeBounds.width.toFixed(0)}×${holeBounds.height.toFixed(0)} мм`);
    });

    // Создаём остаток листа
    sheetRemnant = {
        outerContour: outerObjects,        // Внешний контур (граница листа)
        innerContours: innerObjects,       // Внутренние отверстия
        contourObjects: [...contourObjects], // Все объекты (для отладки)
        image: sheetBackgroundImage,
        scale: sheetImageScale,
        size: {
            width: bounds.width,
            height: bounds.height
        },
        bounds: bounds
    };

    window.sheetRemnant = sheetRemnant;

    // Синхронизируем переменные
    syncSheetRemnantVars();

    // ═══════════════════════════════════════════════════════════
    // ПОЛНОСТЬЮ очищаем весь холст
    // ═══════════════════════════════════════════════════════════
    objects = [];
    selectedObjects = [];

    // Скрываем фото с холста (контур уже сохранён, фото больше не нужно)
    sheetBackgroundImage = null;
    window.sheetBackgroundImage = null;

    // Добавляем "Остаток листа" в панель (показываем элемент)
    showRemnantSheetItem();

    // Переключаемся на остаток листа
    switchToRemnantSheet();

    // Показываем кнопку удаления
    const deleteBtn = document.getElementById('deleteRemnant');
    if (deleteBtn) {
        deleteBtn.style.display = 'block';
    }

    render();

    console.log(`✅ Остаток листа создан:`);
    console.log(`   Внешний контур: ${outerObjects.length} объектов`);
    console.log(`   Отверстия: ${innerObjects.length} контуров`);
    console.log(`   Размер: ${bounds.width.toFixed(0)}×${bounds.height.toFixed(0)} мм`);
    console.log(`   Холст очищен`);
}

/**
 * Найти связанные группы объектов (касающиеся друг друга = один контур)
 */
function findConnectedContourGroups(objects) {
    const groups = [];
    const visited = new Set();
    const tolerance = 3; // Допуск касания

    for (let i = 0; i < objects.length; i++) {
        if (visited.has(i)) continue;

        const group = [objects[i]];
        const queue = [i];
        visited.add(i);

        while (queue.length > 0) {
            const currentIdx = queue.shift();
            const currentObj = objects[currentIdx];

            for (let j = 0; j < objects.length; j++) {
                if (visited.has(j)) continue;

                if (objectsTouchWithTolerance(currentObj, objects[j], tolerance)) {
                    group.push(objects[j]);
                    visited.add(j);
                    queue.push(j);
                }
            }
        }

        if (group.length > 0) {
            groups.push(group);
        }
    }

    return groups;
}

/**
 * Проверить, касаются ли два объекта с допуском
 */
function objectsTouchWithTolerance(obj1, obj2, tolerance) {
    const points1 = getPointsFromObject(obj1);
    const points2 = getPointsFromObject(obj2);

    for (const p1 of points1) {
        for (const p2 of points2) {
            const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            if (dist < tolerance) {
                return true;
            }
        }
    }

    // Для кругов - проверка вложения
    if (obj1.type === 'circle' && obj2.type === 'circle') {
        const dist = Math.sqrt(Math.pow(obj1.cx - obj2.cx, 2) + Math.pow(obj1.cy - obj2.cy, 2));
        return dist < (obj1.radius + obj2.radius + tolerance);
    }

    return false;
}

/**
 * Получить точки из любого объекта
 */
function getPointsFromObject(obj) {
    if (typeof obj.getPoints === 'function') {
        return obj.getPoints();
    }
    if (obj.type === 'line') {
        return [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
    }
    if (obj.type === 'circle') {
        return [{ x: obj.cx, y: obj.cy },
                { x: obj.cx + obj.radius, y: obj.cy },
                { x: obj.cx - obj.radius, y: obj.cy },
                { x: obj.cx, y: obj.cy + obj.radius },
                { x: obj.cx, y: obj.cy - obj.radius }];
    }
    if (obj.type === 'rect') {
        return [
            { x: obj.x, y: obj.y },
            { x: obj.x + obj.width, y: obj.y },
            { x: obj.x + obj.width, y: obj.y + obj.height },
            { x: obj.x, y: obj.y + obj.height },
            { x: obj.x + obj.width/2, y: obj.y + obj.height/2 }
        ];
    }
    if (obj.type === 'polygon') {
        return obj.getVertices ? obj.getVertices() : [{ x: obj.cx, y: obj.cy }];
    }
    return [];
}

/**
 * Показать элемент остатка листа в панели
 */
function showRemnantSheetItem() {
    const remnantItem = document.getElementById('remnantSheetItem');
    const remnantName = document.getElementById('remnantSheetName');

    if (remnantItem && sheetRemnant) {
        const size = sheetRemnant.size;
        remnantName.textContent = `📸 Остаток листа (${Math.round(size.width)} × ${Math.round(size.height)} мм)`;
        remnantItem.style.display = 'block';
    }
}

/**
 * Скрыть элемент остатка листа
 */
function hideRemnantSheetItem() {
    const remnantItem = document.getElementById('remnantSheetItem');
    if (remnantItem) {
        remnantItem.style.display = 'none';
    }
}

/**
 * Добавить "Остаток листа" в выпадающий список (устаревшая функция, теперь используется showRemnantSheetItem)
 */
function addRemnantToSheetList() {
    // Теперь используется showRemnantSheetItem() вместо добавления option в select
}

/**
 * Переключиться на лист остатка
 */
function switchToRemnantSheet() {
    if (!sheetRemnant) return;

    showSheetView = true;
    sheetSize = { ...sheetRemnant.size };

    // НЕ восстанавливаем фото на холсте - оно рисуется только в миниатюре листа (drawSheet)

    syncSheetRemnantVars();
    render();
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА: ТОЧКА ВНУТРИ КОНТУРА ОСТАТКА (С УЧЁТОМ ОТВЕРСТИЙ)
// ═══════════════════════════════════════════════════════════════

/**
 * Проверить, находится ли точка внутри внешнего контура, но НЕ внутри отверстий
 * @param {number} x - координата X
 * @param {number} y - координата Y
 * @returns {boolean}
 */
function isPointInsideRemnant(x, y) {
    if (!sheetRemnant || !sheetRemnant.outerContour || sheetRemnant.outerContour.length === 0) {
        return true; // Если нет контура - считаем что внутри
    }

    // 1. Проверяем: точка внутри внешнего контура?
    let insideOuter = isPointInsideContour(x, y, sheetRemnant.outerContour);
    if (!insideOuter) return false;

    // 2. Проверяем: точка внутри любого отверстия?
    if (sheetRemnant.innerContours && sheetRemnant.innerContours.length > 0) {
        for (const holeContour of sheetRemnant.innerContours) {
            if (isPointInsideContour(x, y, holeContour)) {
                return false; // Точка внутри отверстия!
            }
        }
    }

    return true;
}

/**
 * Проверить, находится ли точка внутри данного контура (ray casting)
 */
function isPointInsideContour(x, y, contourObjects) {
    if (!contourObjects || contourObjects.length === 0) return false;

    let inside = false;

    for (const obj of contourObjects) {
        if (obj.type === 'line') {
            const x1 = obj.x1, y1 = obj.y1;
            const x2 = obj.x2, y2 = obj.y2;
            if (((y1 > y) !== (y2 > y)) &&
                (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1)) {
                inside = !inside;
            }
        } else if (obj.type === 'rect') {
            // Для прямоугольника проверяем все 4 грани
            const edges = [
                { x1: obj.x, y1: obj.y, x2: obj.x + obj.width, y2: obj.y },
                { x1: obj.x + obj.width, y1: obj.y, x2: obj.x + obj.width, y2: obj.y + obj.height },
                { x1: obj.x + obj.width, y1: obj.y + obj.height, x2: obj.x, y2: obj.y + obj.height },
                { x1: obj.x, y1: obj.y + obj.height, x2: obj.x, y2: obj.y }
            ];
            for (const edge of edges) {
                if (((edge.y1 > y) !== (edge.y2 > y)) &&
                    (x < (edge.x2 - edge.x1) * (y - edge.y1) / (edge.y2 - edge.y1) + edge.x1)) {
                    inside = !inside;
                }
            }
        } else if (obj.type === 'circle') {
            // Для круга: точка внутри если расстояние до центра < радиус
            const dist = Math.sqrt(Math.pow(x - obj.cx, 2) + Math.pow(y - obj.cy, 2));
            if (dist < obj.radius) {
                inside = !inside;
            }
        } else if (obj.type === 'polygon') {
            const vertices = obj.getVertices ? obj.getVertices() : [];
            for (let i = 0; i < vertices.length; i++) {
                const v1 = vertices[i];
                const v2 = vertices[(i + 1) % vertices.length];
                if (((v1.y > y) !== (v2.y > y)) &&
                    (x < (v2.x - v1.x) * (y - v1.y) / (v2.y - v1.y) + v1.x)) {
                    inside = !inside;
                }
            }
        }
    }

    return inside;
}

/**
 * Проверить, находится ли прямоугольник внутри контура остатка (с учётом отверстий)
 * @param {number} x - левый верхний угол X (в координатах листа)
 * @param {number} y - левый верхний угол Y (в координатах листа)
 * @param {number} w - ширина
 * @param {number} h - высота
 * @returns {boolean}
 */
function isRectInsideRemnant(x, y, w, h) {
    if (!sheetRemnant || !sheetRemnant.outerContour || sheetRemnant.outerContour.length === 0) {
        return true;
    }

    const gap = 3;
    const size = sheetRemnant.size;
    const outerBounds = sheetRemnant.bounds;

    // 1. Быстрая проверка: прямоугольник внутри bounding box остатка
    if (x < 0 + gap || y < 0 + gap ||
        x + w > size.width - gap || y + h > size.height - gap) {
        return false;
    }

    // 2. Проверяем: ЦЕНТР детали внутри реального контура
    // Конвертируем координаты листа в мировые координаты контура
    const centerX = x + w / 2 + outerBounds.minX;
    const centerY = y + h / 2 + outerBounds.minY;

    const insideOuter = isPointInsideContour(centerX, centerY, sheetRemnant.outerContour);

    // Отладка: первые 10 проверок
    if (!window._debugRemnantCount) window._debugRemnantCount = 0;
    if (window._debugRemnantCount < 10) {
        window._debugRemnantCount++;
        console.log(`🔍 isRectInsideRemnant #${window._debugRemnantCount}: sheet(${x.toFixed(1)},${y.toFixed(1)}), world(${centerX.toFixed(1)},${centerY.toFixed(1)}), size=${size.width.toFixed(0)}×${size.height.toFixed(0)}, bounds=[${outerBounds.minX.toFixed(0)},${outerBounds.minY.toFixed(0)}], insideOuter=${insideOuter}`);
    }

    if (!insideOuter) {
        return false;
    }

    // 3. Проверяем: центр НЕ внутри отверстий
    if (sheetRemnant.innerContours && sheetRemnant.innerContours.length > 0) {
        for (const holeContour of sheetRemnant.innerContours) {
            if (isPointInsideContour(centerX, centerY, holeContour)) {
                return false;
            }
        }
    }

    return true;
}

// ═══════════════════════════════════════════════════════════════
// ЭКСПОРТ/ИМПОРТ СОСТОЯНИЯ
// ═══════════════════════════════════════════════════════════════

/**
 * Сохранить состояние остатка в localStorage (без фото, только метаданные)
 */
function saveRemnantMetadata() {
    if (!sheetRemnant) return;

    const metadata = {
        size: sheetRemnant.size,
        bounds: sheetRemnant.bounds,
        contourObjects: sheetRemnant.contourObjects.map(obj => ({
            type: 'line',
            x1: obj.x1,
            y1: obj.y1,
            x2: obj.x2,
            y2: obj.y2
        })),
        scale: sheetRemnant.scale
    };

    localStorage.setItem('sheetRemnant', JSON.stringify(metadata));
}

/**
 * Загрузить метаданные остатка из localStorage
 */
function loadRemnantMetadata() {
    const saved = localStorage.getItem('sheetRemnant');
    if (!saved) return false;

    try {
        const metadata = JSON.parse(saved);

        // Восстанавливаем контур
        sheetRemnant = {
            contourObjects: metadata.contourObjects.map(obj => new Line(obj.x1, obj.y1, obj.x2, obj.y2)),
            image: null, // Фото нужно загрузить отдельно
            scale: metadata.scale,
            size: metadata.size,
            bounds: metadata.bounds
        };

        window.sheetRemnant = sheetRemnant;

        // Добавляем в список
        addRemnantToSheetList();

        console.log('✅ Метаданные остатка загружены');
        return true;
    } catch (err) {
        console.error('Ошибка загрузки метаданных остатка:', err);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

// Загружаем метаданные при старте
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadRemnantMetadata();
    });
} else {
    loadRemnantMetadata();
}

console.log('✅ Sheet Remnant модуль загружен');
