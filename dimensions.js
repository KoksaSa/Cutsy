// ═══════════════════════════════════════════════════════════════
// ФУНКЦИИ РАЗМЕРОВ (DIMENSIONS)
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА СВЯЗЕЙ МЕЖДУ ОБЪЕКТАМИ
// ═══════════════════════════════════════════════════════════════

// Проверяем, касаются ли два объекта
function objectsTouch(obj1, obj2) {
    const points1 = obj1.getPoints();
    const points2 = obj2.getPoints();
    const tolerance = 2;
    for (let p1 of points1) {
        for (let p2 of points2) {
            const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
            if (dist < tolerance) {
                console.log(`  ✅ objectsTouch: найдено касание (dist=${dist.toFixed(2)})`);
                return true;
            }
        }
    }
    return false;
}

// Поиск связанных групп объектов
function findConnectedGroups() {
    console.log('🔍 [findConnectedGroups] Начало поиска групп...');
    console.log(`   Всего объектов: ${objects.length}`);
    
    const groups = [];
    const visited = new Set();
    for (let i = 0; i < objects.length; i++) {
        if (visited.has(i)) continue;
        const group = [objects[i]];
        const queue = [i];
        visited.add(i);
        console.log(`   📦 Новая группа #${groups.length + 1}, начинаем с объекта #${i} (${objects[i].type})`);
        
        while (queue.length > 0) {
            const currentIdx = queue.shift();
            const currentObj = objects[currentIdx];
            for (let j = 0; j < objects.length; j++) {
                if (visited.has(j)) continue;
                if (objectsTouch(currentObj, objects[j])) {
                    group.push(objects[j]);
                    visited.add(j);
                    queue.push(j);
                    console.log(`      + Добавлен объект #${j} (${objects[j].type})`);
                }
            }
        }
        if (group.length > 0) {
            groups.push(group);
            console.log(`   ✅ Группа #${groups.length} завершена: ${group.length} объектов`);
        }
    }
    console.log(`🎉 [findConnectedGroups] Найдено групп: ${groups.length}`);
    return groups;
}

// Получение границ группы объектов
function getGroupBounds(group) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    group.forEach(obj => {
        const points = obj.getPoints();
        points.forEach(pt => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        });
    });
    const bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    console.log(`📐 [getGroupBounds] Границы: minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}, ширина=${bounds.width.toFixed(1)}, высота=${bounds.height.toFixed(1)}`);
    return bounds;
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ РАЗМЕРНЫХ ЛИНИЙ
// ═══════════════════════════════════════════════════════════════

// Создание размерных линий для границ
function createDimensionLines(bounds) {
    const dims = [];
    const offset = 30;
    dims.push({
        x1: bounds.minX,
        y1: bounds.maxY + offset,
        x2: bounds.maxX,
        y2: bounds.maxY + offset,
        value: Math.round(bounds.width),
        type: 'horizontal'
    });
    dims.push({
        x1: bounds.maxX + offset,
        y1: bounds.minY,
        x2: bounds.maxX + offset,
        y2: bounds.maxY,
        value: Math.round(bounds.height),
        type: 'vertical'
    });
    console.log(`📏 [createDimensionLines] Создано 2 размерных линии: горизонтальная=${dims[0].value}, вертикальная=${dims[1].value}`);
    return dims;
}

// Автоматическое создание размеров для всех групп
function autoDimension() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 [autoDimension] ЗАПУСК АВТО-РАЗМЕРОВ');
    console.log('═══════════════════════════════════════════════════════════');

    // Удаляем только авто-размеры (horizontal/vertical), ручные (custom) сохраняем
    const manualDimensions = dimensionLines.filter(dim => dim.type === 'custom');
    const removedCount = dimensionLines.length - manualDimensions.length;
    dimensionLines = manualDimensions;
    console.log(`🗑️ Удалено авто-размеров: ${removedCount}, сохранено ручных: ${manualDimensions.length}`);

    const groups = findConnectedGroups();
    if (groups.length === 0) {
        console.log('⚠️ [autoDimension] Группы не найдены, размеры не созданы');
        render();
        return;
    }

    groups.forEach((group, index) => {
        console.log(`\n📦 Обработка группы #${index + 1} из ${groups.length} (${group.length} объектов)`);
        const bounds = getGroupBounds(group);
        const dims = createDimensionLines(bounds);
        dimensionLines = dimensionLines.concat(dims);
        console.log(`   ✅ Добавлено размеров: ${dims.length}, всего: ${dimensionLines.length}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`✅ [autoDimension] ЗАВЕРШЕНО. Всего создано размерных линий: ${dimensionLines.length}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    render();
}

// Очистка всех размерных линий
function clearDimensions() {
    console.log(`🗑️ [clearDimensions] Удалено размеров: ${dimensionLines.length}`);
    console.log(`🗑️ [clearDimensions] Удалено угловых размеров: ${angleDimensions.length}`);
    dimensionLines = [];
    selectedDimension = null;
    // Очищаем также угловые размеры
    angleDimensions = [];
    selectedAngleDimension = null;
    render();
}

// Поиск размерной линии под точкой
function findDimensionAtPoint(x, y) {
    const tolerance = 15;
    for (let i = 0; i < dimensionLines.length; i++) {
        const dim = dimensionLines[i];
        const dist = pointToLineDistance(x, y, dim.x1, dim.y1, dim.x2, dim.y2);
        if (dist < tolerance) {
            console.log(`🎯 [findDimensionAtPoint] Найдена размерная линия #${i} (type=${dim.type}, value=${dim.value}, dist=${dist.toFixed(2)})`);
            return { index: i, dim };
        }
    }
    return null;
}

// Поиск углового размера под точкой
function findAngleDimensionAtPoint(x, y) {
    const tolerance = 20; // Чуть больше tolerance для угловых размеров
    
    if (typeof angleDimensions === 'undefined' || angleDimensions.length === 0) {
        return null;
    }
    
    for (let i = 0; i < angleDimensions.length; i++) {
        const angleDim = angleDimensions[i];
        
        // Проверяем расстояние до вершины угла
        const distToVertex = Math.sqrt(
            Math.pow(angleDim.x - x, 2) + Math.pow(angleDim.y - y, 2)
        );
        if (distToVertex < tolerance) {
            console.log(`🎯 [findAngleDimensionAtPoint] Найден угловой размер #${i} (вершина, dist=${distToVertex.toFixed(2)})`);
            return { index: i, angleDim };
        }
        
        // Проверяем расстояние до первой линии
        const distToLine1 = pointToLineDistance(x, y, angleDim.x, angleDim.y, angleDim.x1, angleDim.y1);
        if (distToLine1 < tolerance) {
            console.log(`🎯 [findAngleDimensionAtPoint] Найден угловой размер #${i} (линия 1, dist=${distToLine1.toFixed(2)})`);
            return { index: i, angleDim };
        }
        
        // Проверяем расстояние до второй линии
        const distToLine2 = pointToLineDistance(x, y, angleDim.x, angleDim.y, angleDim.x2, angleDim.y2);
        if (distToLine2 < tolerance) {
            console.log(`🎯 [findAngleDimensionAtPoint] Найден угловой размер #${i} (линия 2, dist=${distToLine2.toFixed(2)})`);
            return { index: i, angleDim };
        }
        
        // Проверяем расстояние до дуги
        const distToArc = Math.abs(
            Math.sqrt(Math.pow(angleDim.x - x, 2) + Math.pow(angleDim.y - y, 2)) - angleDim.radius
        );
        if (distToArc < tolerance) {
            console.log(`🎯 [findAngleDimensionAtPoint] Найден угловой размер #${i} (дуга, dist=${distToArc.toFixed(2)})`);
            return { index: i, angleDim };
        }
    }
    
    return null;
}

// Удаление выделенной размерной линии
function deleteSelectedDimension() {
    if (selectedDimension !== null) {
        const deleted = dimensionLines[selectedDimension];
        console.log(`🗑️ [deleteSelectedDimension] Удалена размерная линия #${selectedDimension} (type=${deleted.type}, value=${deleted.value})`);
        dimensionLines.splice(selectedDimension, 1);
        selectedDimension = null;
        render();
    }
}

// Удаление выделенного углового размера
function deleteSelectedAngleDimension() {
    if (typeof selectedAngleDimension !== 'undefined' && selectedAngleDimension !== null) {
        const deleted = angleDimensions[selectedAngleDimension];
        console.log(`🗑️ [deleteSelectedAngleDimension] Удален угловой размер #${selectedAngleDimension} (${deleted.value}°)`);
        angleDimensions.splice(selectedAngleDimension, 1);
        selectedAngleDimension = null;
        render();
    }
}

// Редактирование значения размерной линии
function editDimensionValue(newValue) {
    if (selectedDimension !== null && newValue > 0) {
        const dim = dimensionLines[selectedDimension];
        const oldValue = dim.value;
        const scale = newValue / oldValue;
        
        console.log(`✏️ [editDimensionValue] Изменение размера #${selectedDimension}: ${oldValue} → ${newValue} (scale=${scale.toFixed(3)})`);

        // Собираем изменённые объекты для обновления границ деталей
        const modifiedObjects = [];

        if (dim.type === 'horizontal') {
            objects.forEach(obj => {
                if (obj.type === 'rect') {
                    const centerX = obj.x + obj.width / 2;
                    obj.width = Math.abs(obj.width * scale);
                    modifiedObjects.push(obj);
                } else if (obj.type === 'circle') {
                    obj.radius = obj.radius * scale;
                    modifiedObjects.push(obj);
                } else if (obj.type === 'line') {
                    const centerX = (obj.x1 + obj.x2) / 2;
                    obj.x1 = centerX - (centerX - obj.x1) * scale;
                    obj.x2 = centerX + (obj.x2 - centerX) * scale;
                    modifiedObjects.push(obj);
                }
            });
        } else {
            objects.forEach(obj => {
                if (obj.type === 'rect') {
                    const centerY = obj.y + obj.height / 2;
                    obj.height = Math.abs(obj.height * scale);
                    modifiedObjects.push(obj);
                } else if (obj.type === 'circle') {
                    obj.radius = obj.radius * scale;
                    modifiedObjects.push(obj);
                } else if (obj.type === 'line') {
                    const centerY = (obj.y1 + obj.y2) / 2;
                    obj.y1 = centerY - (centerY - obj.y1) * scale;
                    obj.y2 = centerY + (obj.y2 - centerY) * scale;
                    modifiedObjects.push(obj);
                }
            });
        }
        
        console.log(`   📝 Изменено объектов: ${modifiedObjects.length}`);

        // Обновляем границы деталей, которым принадлежат изменённые объекты
        if (typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
            const updatedParts = new Set();
            modifiedObjects.forEach(obj => {
                for (const part of parts) {
                    if (part.objects && part.objects.includes(obj) && !updatedParts.has(part.id)) {
                        updatePartBounds(part);
                        updatedParts.add(part.id);
                    }
                }
            });
            console.log(`   🔄 Обновлены границы деталей: ${updatedParts.size} шт.`);
        }

        dim.value = newValue;
        selectedDimension = null;
        saveState();
        render();
        console.log(`✅ [editDimensionValue] Готово\n`);
    }
}
