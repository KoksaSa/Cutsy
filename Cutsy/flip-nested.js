// ═══════════════════════════════════════════════════════════════
// ОТРАЖЕНИЕ ДЕТАЛЕЙ НА ЛИСТЕ
// ═══════════════════════════════════════════════════════════════

// Отражение детали по X или Y с отражением геометрии
// nested - размещённая деталь на листе
// axis - 'X' или 'Y'
// sheetWidth, sheetHeight - размеры листа
// nestedParts - массив размещённых деталей
// allParts - массив всех деталей (источник объектов)
function flipNestedPart(nested, axis, sheetWidth, sheetHeight, nestedParts, allParts) {
    console.log(`🔄 [FLIP NESTED PART] Отражение детали #${nested.partId} по оси ${axis}`);
    
    const baseWidth = nested.baseWidth || nested.width;
    const baseHeight = nested.baseHeight || nested.height;

    // Находим исходную деталь для получения объектов
    const part = allParts.find(p => p.id === nested.partId);
    if (!part || !part.objects || part.objects.length === 0) {
        console.log(`❌ У детали #${nested.partId} нет объектов для отражения`);
        return false;
    }

    // Используем part.bounds для корректного отражения
    const boundsMinX = part.bounds.minX || 0;
    const boundsMinY = part.bounds.minY || 0;
    const boundsWidth = part.bounds.width;
    const boundsHeight = part.bounds.height;

    // Определяем, нужно ли отражать или вернуть исходное состояние
    const isFlippedX = nested.flippedX || false;
    const isFlippedY = nested.flippedY || false;

    // Флаг: будет ли отражение после применения
    const willBeFlipped = axis === 'X' ? !isFlippedX : !isFlippedY;

    // Берём исходные объекты или уже отражённые
    let sourceObjects = part.objects;
    let sourceBaseWidth = baseWidth;
    let sourceBaseHeight = baseHeight;

    // Если деталь уже была отражена, используем текущие объекты
    if (isFlippedX || isFlippedY) {
        sourceObjects = nested.objects;
        // Для уже отражённой детали нужно использовать её текущие размеры
        sourceBaseWidth = baseWidth;
        sourceBaseHeight = baseHeight;
    }

    // Отражаем все объекты детали с учётом bounds.minX/minY
    const flippedObjects = sourceObjects.map(obj => {
        if (obj.type === 'line') {
            if (axis === 'X') {
                // Отражение по X: newX = boundsWidth - (oldX - minX) + minX = boundsWidth + 2*minX - oldX
                const newX1 = boundsWidth + 2 * boundsMinX - obj.x1;
                const newX2 = boundsWidth + 2 * boundsMinX - obj.x2;
                return new Line(newX1, obj.y1, newX2, obj.y2);
            } else { // axis === 'Y'
                const newY1 = boundsHeight + 2 * boundsMinY - obj.y1;
                const newY2 = boundsHeight + 2 * boundsMinY - obj.y2;
                return new Line(obj.x1, newY1, obj.x2, newY2);
            }
        } else if (obj.type === 'circle') {
            if (axis === 'X') {
                return new Circle(boundsWidth + 2 * boundsMinX - obj.cx, obj.cy, obj.radius);
            } else {
                return new Circle(obj.cx, boundsHeight + 2 * boundsMinY - obj.cy, obj.radius);
            }
        } else if (obj.type === 'rect') {
            if (axis === 'X') {
                return new Rect(boundsWidth + 2 * boundsMinX - obj.x - obj.width, obj.y, obj.width, obj.height);
            } else {
                return new Rect(obj.x, boundsHeight + 2 * boundsMinY - obj.y - obj.height, obj.width, obj.height);
            }
        } else if (obj.type === 'polygon') {
            if (axis === 'X') {
                return new Polygon(boundsWidth + 2 * boundsMinX - obj.cx, obj.cy, obj.radius, obj.sides);
            } else {
                return new Polygon(obj.cx, boundsHeight + 2 * boundsMinY - obj.cy, obj.radius, obj.sides);
            }
        } else if (obj.type === 'text') {
            if (axis === 'X') {
                return new Text(boundsWidth + 2 * boundsMinX - obj.x, obj.y, obj.text, obj.fontSize);
            } else {
                return new Text(obj.x, boundsHeight + 2 * boundsMinY - obj.y, obj.text, obj.fontSize);
            }
        }
        return obj;
    });
    
    // Вычисляем границы отражённой детали
    const flippedBounds = calculateBounds(flippedObjects);
    
    // Создаём тестовый полигон для проверки
    const testHull = [
        { x: 0, y: 0 },
        { x: flippedBounds.width, y: 0 },
        { x: flippedBounds.width, y: flippedBounds.height },
        { x: 0, y: flippedBounds.height }
    ];
    
    // Получаем текущий угол поворота
    const currentAngle = nested.angle || 0;
    
    // Центр детали для вращения
    const centerX = flippedBounds.width / 2;
    const centerY = flippedBounds.height / 2;
    
    // Поворачиваем bounding box
    const rotatedHull = rotatePolygon(testHull, currentAngle, centerX, centerY);

    // Находим bottom-left повёрнутого hull
    let tempRef = rotatedHull[0];
    for (const p of rotatedHull) {
        if (p.y < tempRef.y || (p.y === tempRef.y && p.x < tempRef.x)) {
            tempRef = p;
        }
    }

    // Нормализуем: сдвигаем hull так чтобы bottom-left = (0,0)
    const tempNormalizedHull = rotatedHull.map(p => ({
        x: p.x - tempRef.x,
        y: p.y - tempRef.y
    }));

    // Получаем bounding box
    const tempBbox = getBoundingBox(tempNormalizedHull);

    // Дополнительный сдвиг: чтобы bounding box начинался с (0,0)
    const normalizedHull = tempNormalizedHull.map(p => ({
        x: p.x - tempBbox.minX,
        y: p.y - tempBbox.minY
    }));

    // refPoint для render.js: tempRef + tempBbox.min
    const refPoint = {
        x: tempRef.x + tempBbox.minX,
        y: tempRef.y + tempBbox.minY
    };

    // Пересчитываем bounding box после поворота
    const rotatedBbox = { width: tempBbox.width, height: tempBbox.height };

    // ═══════════════════════════════════════════════════════════
    // КОРРЕКЦИЯ ПОЗИЦИИ: сдвигаем деталь чтобы она не выходила за лист
    // (отражение всегда разрешено, но деталь должна остаться в пределах листа)
    // ═══════════════════════════════════════════════════════════
    let newX = nested.x;
    let newY = nested.y;

    // Сдвигаем по X если выходит за левый край
    if (newX < 0) newX = 0;
    // Сдвигаем по X если выходит за правый край
    if (newX + rotatedBbox.width > sheetWidth) newX = sheetWidth - rotatedBbox.width;
    // Сдвигаем по Y если выходит за верхний край
    if (newY < 0) newY = 0;
    // Сдвигаем по Y если выходит за нижний край
    if (newY + rotatedBbox.height > sheetHeight) newY = sheetHeight - rotatedBbox.height;

    // Обновляем данные детали
    nested.x = newX;
    nested.y = newY;
    nested.polygon = normalizedHull;
    nested.width = rotatedBbox.width;
    nested.height = rotatedBbox.height;
    nested.refPoint = refPoint;

    // Обновляем флаги отражения
    if (axis === 'X') {
        nested.flippedX = !isFlippedX; // Переключаем флаг
    } else {
        nested.flippedY = !isFlippedY; // Переключаем флаг
    }

    // Обновляем объекты детали (с нормализацией координат)
    // Объекты уже отражены в flippedObjects, нужно только нормализовать
    const offsetX = -flippedBounds.minX;
    const offsetY = -flippedBounds.minY;
    
    nested.objects = flippedObjects.map(obj => {
        if (obj.type === 'line') {
            return new Line(
                obj.x1 + offsetX, obj.y1 + offsetY,
                obj.x2 + offsetX, obj.y2 + offsetY
            );
        } else if (obj.type === 'circle') {
            return new Circle(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius
            );
        } else if (obj.type === 'rect') {
            return new Rect(
                obj.x + offsetX, obj.y + offsetY,
                obj.width, obj.height
            );
        } else if (obj.type === 'polygon') {
            return new Polygon(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius, obj.sides
            );
        } else if (obj.type === 'text') {
            return new Text(
                obj.x + offsetX, obj.y + offsetY,
                obj.text, obj.fontSize
            );
        }
        return obj;
    });
    
    console.log(`✅ Отражение детали #${nested.partId} по ${axis}`);
    return true;
}
