// properties-panel.js — извлечено из рабочего бэкапа index.html
console.log('📋 properties-panel.js v3.40 (from backup) загружен');

function showProperties(obj) {
    console.log('🔍 [INDEX.HTML] showProperties вызван', obj ? `type=${obj.type}` : 'obj=null');
    
    const noSel = document.getElementById('noSelection'), form = document.getElementById('propertiesForm');
    const multiInfo = document.getElementById('multiSelectInfo');
    const dimProps = document.getElementById('dimensionProps');
    const dimEditProps = document.getElementById('dimensionEditProps');
    const edgeProps = document.getElementById('edgeProps');
    const textProps = document.getElementById('textProps');

    // Если выбрана размерная линия (не авто-размер)
    if (selectedDimension !== null && dimensionLines[selectedDimension].type === 'custom') {
        const dim = dimensionLines[selectedDimension];
        dimEditProps.style.display = 'flex';
        document.getElementById('dimensionEditValue').value = dim.value;
        dimProps.style.display = 'none';
        edgeProps.style.display = 'none';
        textProps.style.display = 'none';
        noSel.style.display = 'none';
        form.style.display = 'none';
        multiInfo.style.display = 'none';
        return;
    }

    dimEditProps.style.display = 'none';

    // Если выбрана грань
    if (selectedEdge && selectedEdge.edge && selectedEdge.edge.length !== undefined) {
        edgeProps.style.display = 'flex';
        document.getElementById('edgeLength').value = selectedEdge.edge.length.toFixed(2);
        dimProps.style.display = 'none';
        textProps.style.display = 'none';
        noSel.style.display = 'none';
        form.style.display = 'none';
        multiInfo.style.display = 'none';
        return;
    }

    edgeProps.style.display = 'none';

    // Если выбран текст
    if (selectedObjects.length === 1 && selectedObjects[0].type === 'text') {
        const txt = selectedObjects[0];
        noSel.style.display = 'none';
        form.style.display = 'block';
        document.getElementById('objType').value = 'Текст';
        document.getElementById('lineProps').style.display = 'none';
        document.getElementById('circleProps').style.display = 'none';
        document.getElementById('rectProps').style.display = 'none';
        document.getElementById('polygonProps').style.display = 'none';
        document.getElementById('dimensionProps').style.display = 'none';
        document.getElementById('dimensionEditProps').style.display = 'none';
        document.getElementById('edgeProps').style.display = 'none';
        document.getElementById('textProps').style.display = 'flex';
        document.getElementById('textContent').value = txt.text;
        document.getElementById('textFontSize').value = txt.fontSize;
        multiInfo.style.display = 'none';
        return;
    }

    textProps.style.display = 'none';

    // Если выбран размер (авто-размер)
    if (selectedDimension !== null) {
        const dim = dimensionLines[selectedDimension];
        dimProps.style.display = 'flex';
        document.getElementById('dimensionValue').value = dim.value;
        // Показываем текущий угол размера
        const angleInput = document.getElementById('dimensionAngle');
        if (dim.angle !== undefined) {
            angleInput.value = Math.round((dim.angle * 180 / Math.PI) % 360);
        } else {
            angleInput.value = 0; // По умолчанию горизонтально
        }
        noSel.style.display = 'none';
        form.style.display = 'none';
        multiInfo.style.display = 'none';
        return;
    }

    dimProps.style.display = 'none';

    if (selectedObjects.length > 1) {
        multiInfo.style.display = 'block';
        document.getElementById('multiCount').textContent = selectedObjects.length;
        // Обновляем цветовой swatch: показываем цвет если он одинаковый у всех, иначе «Разные»
        const multiSwatch = document.getElementById('multiColorSwatch');
        const multiName = document.getElementById('multiColorName');
        const colors = selectedObjects.map(o => (o.color || '#00aadd').toLowerCase());
        const allSame = colors.every(c => c === colors[0]);
        if (allSame) {
            const palEntry = COLOR_PALETTE.find(c => c.value.toLowerCase() === colors[0]);
            multiSwatch.style.background = colors[0];
            multiName.textContent = palEntry ? palEntry.name : colors[0];
        } else {
            multiSwatch.style.background = 'linear-gradient(135deg, #ff0000, #00ff00, #0000ff)';
            multiName.textContent = 'Разные цвета';
        }
        noSel.style.display = 'none'; form.style.display = 'none'; return;
    }
    multiInfo.style.display = 'none';
    if (!obj) { noSel.style.display = 'block'; form.style.display = 'none'; return; }
    noSel.style.display = 'none'; form.style.display = 'block';
    document.getElementById('objType').value = getTypeName(obj.type);
    // Обновляем цветовой swatch для одного объекта
    const singleSwatch = document.getElementById('singleColorSwatch');
    const singleName = document.getElementById('singleColorName');
    const objColor = (obj.color || '#00aadd').toLowerCase();
    const singlePalEntry = COLOR_PALETTE.find(c => c.value.toLowerCase() === objColor);
    singleSwatch.style.background = objColor;
    singleName.textContent = singlePalEntry ? singlePalEntry.name : objColor;
    document.getElementById('lineProps').style.display = 'none';
    document.getElementById('circleProps').style.display = 'none';
    document.getElementById('rectProps').style.display = 'none';
    document.getElementById('polygonProps').style.display = 'none';
    document.getElementById('lineAlignProps').style.display = 'none';
    
    if (obj.type === 'line') {
        document.getElementById('lineProps').style.display = 'flex';
        document.getElementById('lineLength').value = obj.length.toFixed(2);
        // Показываем блок выравнивания для линий
        document.getElementById('lineAlignProps').style.display = 'block';
    } else if (obj.type === 'circle') {
        document.getElementById('circleProps').style.display = 'flex';
        document.getElementById('circleD').value = (obj.radius * 2).toFixed(2);
    } else if (obj.type === 'rect') {
        document.getElementById('rectProps').style.display = 'flex';
        document.getElementById('rectW').value = obj.absWidth.toFixed(2);
        document.getElementById('rectH').value = obj.absHeight.toFixed(2);
    } else if (obj.type === 'polygon') {
        document.getElementById('polygonProps').style.display = 'flex';
        document.getElementById("polygonSides").value = obj.sides || obj.points?.length || 0;
        document.getElementById("polygonRadius").value = (obj.radius || 0).toFixed(2);
    }
}

function getTypeName(type) {
    return { line: 'Линия', circle: 'Круг', rect: 'Прямоугольник', polygon: 'Многоугольник' }[type] || type;
}

// === Обработчики для полей ввода свойств (Enter) ===
// ═══════════════════════════════════════════════════════════════
// ИЗМЕНЕНИЕ ДЛИНЫ ЛИНИИ С СОХРАНЕНИЕМ СВЯЗЕЙ
// ═══════════════════════════════════════════════════════════════

// Найти все линии, связанные с данной (имеющие общую точку)
function findConnectedLines(line) {
    const connected = [];
    const points = [
        { x: line.x1, y: line.y1, type: 'start' },
        { x: line.x2, y: line.y2, type: 'end' }
    ];
    
    for (const other of objects) {
        if (other.type !== 'line' || other === line) continue;
        
        const otherPoints = [
            { x: other.x1, y: other.y1, type: 'start' },
            { x: other.x2, y: other.y2, type: 'end' }
        ];
        
        // Проверяем, есть ли общая точка
        for (const pt of points) {
            for (const otherPt of otherPoints) {
                if (Math.abs(pt.x - otherPt.x) < 1 && Math.abs(pt.y - otherPt.y) < 1) {
                    connected.push({
                        line: other,
                        connectionPoint: otherPt, // Какая точка другой линии соединена
                        targetPoint: pt // К какой точке нашей линии она подключена
                    });
                }
            }
        }
    }
    
    return connected;
}

// Переместить конечную точку линии и все связанные с ней
function moveLineEndpoint(line, pointType, newX, newY, movedLines = new Set()) {
    if (movedLines.has(line.id)) return; // Уже перемещали эту линию
    movedLines.add(line.id);
    
    const oldX = pointType === 'start' ? line.x1 : line.x2;
    const oldY = pointType === 'start' ? line.y1 : line.y2;
    const dx = newX - oldX;
    const dy = newY - oldY;
    
    // Перемещаем точку текущей линии
    if (pointType === 'start') {
        line.x1 = newX;
        line.y1 = newY;
    } else {
        line.x2 = newX;
        line.y2 = newY;
    }
    
    // Находим все линии, связанные с этой точкой
    for (const other of objects) {
        if (other.type !== 'line' || other === line) continue;
        if (movedLines.has(other.id)) continue;
        
        // Проверяем, соединена ли другая линия с этой точкой
        const isStartConnected = Math.abs(other.x1 - oldX) < 1 && Math.abs(other.y1 - oldY) < 1;
        const isEndConnected = Math.abs(other.x2 - oldX) < 1 && Math.abs(other.y2 - oldY) < 1;
        
        if (isStartConnected) {
            moveLineEndpoint(other, 'start', other.x1 + dx, other.y1 + dy, movedLines);
        } else if (isEndConnected) {
            moveLineEndpoint(other, 'end', other.x2 + dx, other.y2 + dy, movedLines);
        }
    }
}

function applyLineLength() {
    if (selectedObjects.length !== 1 || selectedObjects[0].type !== 'line') return;
    const newLength = parseFloat(document.getElementById('lineLength').value);
    if (newLength > 0) {
        saveState();
        const line = selectedObjects[0];
        const screenCenterX = canvas.width / 2;
        const screenCenterY = canvas.height / 2;
        const dist1 = Math.sqrt(Math.pow(line.x1 - screenCenterX, 2) + Math.pow(line.y1 - screenCenterY, 2));
        const dist2 = Math.sqrt(Math.pow(line.x2 - screenCenterX, 2) + Math.pow(line.y2 - screenCenterY, 2));
        const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
        
        // Вычисляем новую позицию подвижного конца
        let newEndX, newEndY, fixedPoint;
        if (dist1 < dist2) {
            // Двигаем конец (x2, y2), начало зафиксировано
            newEndX = line.x1 + Math.cos(angle) * newLength;
            newEndY = line.y1 + Math.sin(angle) * newLength;
            fixedPoint = { x: line.x1, y: line.y1, type: 'start' };
        } else {
            // Двигаем начало (x1, y1), конец зафиксирован
            newEndX = line.x2 - Math.cos(angle) * newLength;
            newEndY = line.y2 - Math.sin(angle) * newLength;
            fixedPoint = { x: line.x2, y: line.y2, type: 'end' };
        }
        
        // Находим связанные линии
        const connectedLines = findConnectedLines(line);
        
        if (connectedLines.length > 0) {
            // Есть связанные линии - перемещаем их тоже
            const movedPointType = dist1 < dist2 ? 'end' : 'start';
            moveLineEndpoint(line, movedPointType, newEndX, newEndY, new Set());
        } else {
            // Нет связанных линий - просто меняем длину
            if (dist1 < dist2) {
                line.x2 = newEndX;
                line.y2 = newEndY;
            } else {
                line.x1 = newEndX;
                line.y1 = newEndY;
            }
        }

        // Если объект принадлежит детали, обновляем её границы
        const part = findPartForObject(line);
        if (part) {
            updatePartBounds(part);
        }

        render();
        showProperties(line); // Обновляем панель свойств
    }
}

function applyCircleD() {
    if (selectedObjects.length !== 1 || selectedObjects[0].type !== 'circle') return;
    const newDiameter = parseFloat(document.getElementById('circleD').value);
    if (newDiameter > 0) {
        saveState();
        const obj = selectedObjects[0];
        obj.radius = newDiameter / 2;
        
        // Если объект принадлежит детали, обновляем её границы
        const part = findPartForObject(obj);
        if (part) {
            updatePartBounds(part);
        }
        
        render();
        showProperties(obj); // Обновляем панель свойств
    }
}

function applyRectSize() {
    if (selectedObjects.length !== 1 || selectedObjects[0].type !== 'rect') return;
    const w = parseFloat(document.getElementById('rectW').value), h = parseFloat(document.getElementById('rectH').value);
    if (w > 0 && h > 0) {
        saveState();
        const obj = selectedObjects[0];
        const minX = Math.min(obj.x, obj.x + obj.width), minY = Math.min(obj.y, obj.y + obj.height);
        obj.x = minX; obj.y = minY; obj.width = w; obj.height = h;
        
        // Если объект принадлежит детали, обновляем её границы
        const part = findPartForObject(obj);
        if (part) {
            updatePartBounds(part);
        }
        
        render();
        showProperties(obj); // Обновляем панель свойств
    }
}

// ═══════════════════════════════════════════════════════════════
// УМНАЯ РЕЗИНКА - стирание линии до пересечений
// ═══════════════════════════════════════════════════════════════
// eraseLineSmart(line, clickX, clickY) - удаляет сегмент линии
// между пересечениями или до пересечений с другими линиями
function eraseLineSmart(line, clickX, clickY) {
    // Находим все точки пересечения этой линии с другими объектами
    const intersections = [];

    // Добавляем концы самой линии
    intersections.push({ x: line.x1, y: line.y1, t: 0 });
    intersections.push({ x: line.x2, y: line.y2, t: 1 });

    // Находим пересечения с другими линиями
    for (const other of objects) {
        if (other === line) continue;

        let objIntersections = [];
        
        if (other.type === 'line') {
            const intersection = findLineIntersection(line, other);
            if (intersection) {
                objIntersections.push(intersection);
            }
        }
        else if (other.type === 'rect') {
            // Пересечения с прямоугольником (4 грани)
            const edges = getObjectEdges(other);
            for (const edge of edges) {
                const edgeLine = new Line(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
                const intersection = findLineIntersection(line, edgeLine);
                if (intersection) {
                    objIntersections.push(intersection);
                }
            }
        }
        else if (other.type === 'circle') {
            // Пересечения с кругом (до 2 точек)
            const circleIntersections = findLineCircleIntersection(line, other);
            if (circleIntersections) {
                objIntersections = objIntersections.concat(circleIntersections);
            }
        }
        else if (other.type === 'polygon') {
            // Пересечения с многоугольником (грани)
            const vertices = other.getVertices();
            for (let i = 0; i < vertices.length; i++) {
                const next = (i + 1) % vertices.length;
                const edgeLine = new Line(vertices[i].x, vertices[i].y, vertices[next].x, vertices[next].y);
                const intersection = findLineIntersection(line, edgeLine);
                if (intersection) {
                    objIntersections.push(intersection);
                }
            }
        }

        // Добавляем найденные пересечения
        for (const intersection of objIntersections) {
            const dx = line.x2 - line.x1;
            const dy = line.y2 - line.y1;
            const len = Math.sqrt(dx * dx + dy * dy);

            if (len > 0) {
                const t = ((intersection.x - line.x1) * dx + (intersection.y - line.y1) * dy) / (len * len);
                if (t > 0.001 && t < 0.999) { // Не добавляем концы
                    // Проверяем, нет ли уже такой точки
                    const exists = intersections.some(i => 
                        Math.abs(i.x - intersection.x) < 0.1 && Math.abs(i.y - intersection.y) < 0.1
                    );
                    if (!exists) {
                        intersections.push({ x: intersection.x, y: intersection.y, t });
                    }
                }
            }
        }
    }

    // Сортируем пересечения по параметру t
    intersections.sort((a, b) => a.t - b.t);

    // Находим сегмент, на который кликнули
    const clickT = findClickT(line, clickX, clickY);

    // Находим два ближайших пересечения вокруг клика
    let segStart = null, segEnd = null;
    for (let i = 0; i < intersections.length - 1; i++) {
        if (clickT >= intersections[i].t && clickT <= intersections[i + 1].t) {
            segStart = intersections[i];
            segEnd = intersections[i + 1];
            break;
        }
    }

    if (!segStart || !segEnd) return false; // Не нашли сегмент

    // Создаём новые линии из оставшихся сегментов
    const newLines = [];

    // Сегменты до удаляемого
    for (let i = 0; i < intersections.length - 1; i++) {
        if (intersections[i].t < segStart.t - 0.001) {
            newLines.push(new Line(
                intersections[i].x, intersections[i].y,
                intersections[i + 1].x, intersections[i + 1].y
            ));
        }
    }

    // Сегменты после удаляемого
    for (let i = 0; i < intersections.length - 1; i++) {
        if (intersections[i + 1].t > segEnd.t + 0.001) {
            newLines.push(new Line(
                intersections[i].x, intersections[i].y,
                intersections[i + 1].x, intersections[i + 1].y
            ));
        }
    }

    // Удаляем исходную линию, добавляем новые сегменты
    const idx = objects.indexOf(line);
    if (idx >= 0) {
        objects.splice(idx, 1);
        objects.push(...newLines);
        
        // Обновляем part.objects если линия принадлежит детали
        const part = findPartForObject(line);
        if (part) {
            part.objects = part.objects.filter(obj => obj !== line);
            part.objects.push(...newLines);
            updatePartBounds(part);
        }
    }

    return true;
}

// Пересечение линии с кругом (возвращает 0, 1 или 2 точки)
function findLineCircleIntersection(line, circle) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) return null; // Линия - точка
    
    // Вектор от центра круга к началу линии
    const fx = line.x1 - circle.cx;
    const fy = line.y1 - circle.cy;
    
    // Проекции
    const a = lenSq;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - circle.radius * circle.radius;
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null; // Нет пересечений
    
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    
    const intersections = [];
    
    if (t1 >= 0 && t1 <= 1) {
        intersections.push({
            x: line.x1 + t1 * dx,
            y: line.y1 + t1 * dy
        });
    }
    
    if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 0.001) {
        intersections.push({
            x: line.x1 + t2 * dx,
            y: line.y1 + t2 * dy
        });
    }
    
    return intersections.length > 0 ? intersections : null;
}

// ═══════════════════════════════════════════════════════════════
// НАЙТИ ВСЕ ПЕРЕСЕЧЕНИЯ КРУГА С ДРУГИМИ ОБЪЕКТАМИ
// ═══════════════════════════════════════════════════════════════
function findCircleIntersections(circle) {
    const intersections = [];

    for (const obj of objects) {
        if (obj === circle) continue;

        if (obj.type === 'line') {
            const pts = findLineCircleIntersection(obj, circle);
            if (pts) {
                for (const pt of pts) {
                    // Проверяем что такой точки ещё нет
                    const exists = intersections.some(i =>
                        Math.abs(i.x - pt.x) < 0.1 && Math.abs(i.y - pt.y) < 0.1
                    );
                    if (!exists) {
                        const angle = Math.atan2(pt.y - circle.cy, pt.x - circle.cx);
                        intersections.push({ x: pt.x, y: pt.y, angle });
                    }
                }
            }
        }
        else if (obj.type === 'rect' || obj.type === 'polygon') {
            // Пересечения с гранями
            const edges = getObjectEdges(obj);
            for (const edge of edges) {
                const edgeLine = new Line(edge.p1.x, edge.p1.y, edge.p2.x, edge.p2.y);
                const pts = findLineCircleIntersection(edgeLine, circle);
                if (pts) {
                    for (const pt of pts) {
                        const exists = intersections.some(i =>
                            Math.abs(i.x - pt.x) < 0.1 && Math.abs(i.y - pt.y) < 0.1
                        );
                        if (!exists) {
                            const angle = Math.atan2(pt.y - circle.cy, pt.x - circle.cx);
                            intersections.push({ x: pt.x, y: pt.y, angle });
                        }
                    }
                }
            }
        }
    }

    // Сортируем по углу
    intersections.sort((a, b) => a.angle - b.angle);
    return intersections;
}

// ═══════════════════════════════════════════════════════════════
// СТЕРЕТЬ ДУГУ КРУГА (между двумя ближайшими пересечениями к клику)
// ═══════════════════════════════════════════════════════════════
function eraseCircleArc(circle, clickX, clickY, intersections) {
    // Угол клика на круге
    const clickAngle = Math.atan2(clickY - circle.cy, clickX - circle.cx);

    // Находим два ближайших пересечения вокруг клика
    let startIdx = -1, endIdx = -1;
    let minAngleDiff = Infinity;

    for (let i = 0; i < intersections.length; i++) {
        const next = (i + 1) % intersections.length;
        const a1 = intersections[i].angle;
        const a2 = intersections[next].angle;

        // Проверяем что клик между этими пересечениями
        let angleDiff = a2 - a1;
        if (angleDiff < 0) angleDiff += 2 * Math.PI;

        let clickDiff = clickAngle - a1;
        if (clickDiff < 0) clickDiff += 2 * Math.PI;

        if (clickDiff >= 0 && clickDiff <= angleDiff) {
            startIdx = i;
            endIdx = next;
            break;
        }
    }

    if (startIdx === -1) return []; // Не нашли дугу

    // Аппроксимируем оставшуюся часть круга линиями
    const startAngle = intersections[endIdx].angle;
    let endAngle = intersections[startIdx].angle;
    
    // Убеждаемся что идём по правильной дуге
    if (endAngle < startAngle) endAngle += 2 * Math.PI;

    const arcAngle = endAngle - startAngle;
    const segments = Math.max(8, Math.ceil(arcAngle / (Math.PI / 18))); // 10° на сегмент
    const angleStep = arcAngle / segments;

    const newLines = [];
    let prevX = circle.cx + Math.cos(startAngle) * circle.radius;
    let prevY = circle.cy + Math.sin(startAngle) * circle.radius;

    for (let i = 1; i <= segments; i++) {
        const angle = startAngle + i * angleStep;
        const x = circle.cx + Math.cos(angle) * circle.radius;
        const y = circle.cy + Math.sin(angle) * circle.radius;

        newLines.push(new Line(prevX, prevY, x, y));
        prevX = x;
        prevY = y;
    }

    return newLines;
}

// Вычислить параметр t для точки клика на линии
function findClickT(line, clickX, clickY) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) return 0.5;
    
    const t = ((clickX - line.x1) * dx + (clickY - line.y1) * dy) / lenSq;
    return Math.max(0, Math.min(1, t));
}

function applyPolygonProps() {
    if (selectedObjects.length !== 1 || selectedObjects[0].type !== 'polygon') return;
    const sides = parseInt(document.getElementById('polygonSides').value), radius = parseFloat(document.getElementById('polygonRadius').value);
    if (sides >= 3 && sides <= 20 && radius > 0) {
        saveState();
        const obj = selectedObjects[0];
        obj.sides = sides;
        obj.radius = radius;
        
        // Если объект принадлежит детали, обновляем её границы
        const part = findPartForObject(obj);
        if (part) {
            updatePartBounds(part);
        }
        
        render();
        showProperties(obj); // Обновляем панель свойств
    }
}

function applyTextProps() {
    if (selectedObjects.length !== 1 || selectedObjects[0].type !== 'text') return;
    const txt = selectedObjects[0];
    const newText = document.getElementById('textContent').value;
    const newFontSize = parseInt(document.getElementById('textFontSize').value) || 14;
    saveState();
    txt.text = newText;
    txt.fontSize = newFontSize;
    
    // Если объект принадлежит детали, обновляем её границы
    const part = findPartForObject(txt);
    if (part) {
        updatePartBounds(part);
    }
    
    render();
    showProperties(txt); // Обновляем панель свойств
}

function applyDimensionEditValue() {
    const newValue = parseFloat(document.getElementById('dimensionEditValue').value);
    if (newValue > 0 && selectedDimension !== null) {
        dimensionLines[selectedDimension].value = newValue;
        selectedDimension = null;
        render();
    }
}

function applyEdgeLength() {
    const newLength = parseFloat(document.getElementById('edgeLength').value);
    if (newLength > 0) editEdgeLength(newLength);
}

// Навешиваем обработчики Enter на поля ввода
document.getElementById('lineLength').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLineLength(); });
document.getElementById('circleD').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCircleD(); });
document.getElementById('rectW').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyRectSize(); });
document.getElementById('rectH').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyRectSize(); });
document.getElementById('polygonSides').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyPolygonProps(); });
document.getElementById('polygonRadius').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyPolygonProps(); });
document.getElementById('dimensionEditValue').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyDimensionEditValue(); });
document.getElementById('edgeLength').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyEdgeLength(); });
document.getElementById('textContent').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyTextProps(); });
document.getElementById('textFontSize').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyTextProps(); });

document.getElementById('deleteObj').addEventListener('click', () => {
    if (selectedObjects.length === 0) return;
    saveState();

    // Удаляем объекты из холста
    const _rem = objects.filter(o => !selectedObjects.includes(o)); objects.length = 0; objects.push(..._rem);

    // Удаляем объекты из всех деталей (part.objects) и обновляем границы
    parts.forEach(part => {
        if (part.objects) {
            const hadChanges = part.objects.some(obj => selectedObjects.includes(obj));
            part.objects = part.objects.filter(obj => !selectedObjects.includes(obj));

            // Если удалили объекты из детали, обновляем её границы
            if (hadChanges && part.objects.length > 0) {
                updatePartBounds(part);
            }
        }
    });

    selectedObjects.length = 0;
    showProperties(null);
    render();
});

// Обработчики для размеров
document.getElementById('deleteDimension').addEventListener('click', deleteSelectedDimension);
document.getElementById('deleteDimensionEdit').addEventListener('click', () => {
    if (selectedDimension !== null) {
        dimensionLines.splice(selectedDimension, 1);
        selectedDimension = null;
        render();
    }
});

// ═══════════════════════════════════════════════════════════
// УДАЛЕНИЕ УГЛОВЫХ РАЗМЕРОВ ПО DELETE
// ═══════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedAngleDimension !== null && !e.target.matches('input, textarea')) {
        angleDimensions.splice(selectedAngleDimension, 1);
        selectedAngleDimension = null;
        console.log('🗑️ Угловой размер удалён');
        render();
    }
});

// Обработчик для применения угла размерной линии
document.getElementById('applyDimensionAngle').addEventListener('click', () => {
    if (selectedDimension === null) {
        alert('Сначала выберите размерную линию');
        return;
    }

    const angleDeg = parseFloat(document.getElementById('dimensionAngle').value) || 0;
    
    // Нормализуем угол (0-360)
    const normalizedAngle = ((angleDeg % 360) + 360) % 360;
    const angleRad = normalizedAngle * Math.PI / 180;

    const dim = dimensionLines[selectedDimension];
    
    // Сохраняем исходную длину
    const length = Math.sqrt(
        Math.pow(dim.x2 - dim.x1, 2) + Math.pow(dim.y2 - dim.y1, 2)
    );

    // Вычисляем центр размерной линии
    const centerX = (dim.x1 + dim.x2) / 2;
    const centerY = (dim.y1 + dim.y2) / 2;

    // Вычисляем новые координаты с учетом угла
    const halfLength = length / 2;
    dim.x1 = centerX - Math.cos(angleRad) * halfLength;
    dim.y1 = centerY - Math.sin(angleRad) * halfLength;
    dim.x2 = centerX + Math.cos(angleRad) * halfLength;
    dim.y2 = centerY + Math.sin(angleRad) * halfLength;
    
    // Сохраняем угол в объекте размера
    dim.angle = angleRad;

    console.log(`📐 Угол размерной линии изменен на ${normalizedAngle.toFixed(1)}°`);
    
    saveState();
    render();
});

// Обработчик Enter для поля угла
document.getElementById('dimensionAngle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('applyDimensionAngle').click();
    }
});

// Обработчики для выравнивания линий (правая панель)
document.getElementById('alignHProp').addEventListener('click', () => {
    if (selectedObjects.length === 0 || !selectedObjects.some(o => o.type === 'line')) {
        alert('Выберите одну или несколько линий для выравнивания');
        return;
    }
    alignLinesHorizontal();
});

document.getElementById('alignVProp').addEventListener('click', () => {
    if (selectedObjects.length === 0 || !selectedObjects.some(o => o.type === 'line')) {
        alert('Выберите одну или несколько линий для выравнивания');
        return;
    }
    alignLinesVertical();
});

document.getElementById('alignParallelProp').addEventListener('click', () => {
    if (!selectedObjects.length || selectedObjects[0].type !== 'line') {
        alert('Сначала выберите линию, которую нужно выровнять');
        return;
    }
    parallelMode = 'parallel';
    parallelStep = 1;
    referenceLineForParallel = selectedObjects[0];  // Запоминаем выбранную линию как целевую
    selectedObjects.length = 0;  // Сбрасываем выделение
});

document.getElementById('alignPerpendicularProp').addEventListener('click', () => {
    if (!selectedObjects.length || selectedObjects[0].type !== 'line') {
        alert('Сначала выберите линию, которую нужно выровнять');
        return;
    }
    parallelMode = 'perpendicular';
    parallelStep = 1;
    referenceLineForParallel = selectedObjects[0];  // Запоминаем выбранную линию как целевую
    selectedObjects.length = 0;  // Сбрасываем выделение
});
    
document.getElementById('makeParallelToEdge').addEventListener('click', () => {
    if (!selectedEdge) return;
    const lines = selectedObjects.filter(o => o.type === 'line');
    if (lines.length === 0) {
        alert('Выберите одну или несколько линий для выравнивания');
        return;
    }
    saveState();
    const refAngle = selectedEdge.edge.angle;
    lines.forEach(line => {
        const center = line.center;
        const length = line.length;
        line.x1 = center.x - Math.cos(refAngle) * length / 2;
        line.y1 = center.y - Math.sin(refAngle) * length / 2;
        line.x2 = center.x + Math.cos(refAngle) * length / 2;
        line.y2 = center.y + Math.sin(refAngle) * length / 2;
    });
    render();
});

function editEdgeLength(newLength) {
    if (!selectedEdge || newLength <= 0) return;
    saveState();
    const { obj, edge } = selectedEdge;
    const center = obj.center;
    if (obj.type === 'rect') {
        if (edge.index === 0 || edge.index === 2) {
            obj.width = newLength;
            obj.x = center.x - newLength / 2;
        } else {
            obj.height = newLength;
            obj.y = center.y - newLength / 2;
        }
    } else if (obj.type === 'polygon') {
        const n = obj.sides;
        obj.radius = newLength / (2 * Math.sin(Math.PI / n));
    } else if (obj.type === 'line') {
        obj.length = newLength;
    }
    selectedEdge = null;
    render();
}

// ═══════════════════════════════════════════════════════════════
// ПАЛИТРА ЦВЕТОВ (глобальные утилиты, idempotent)
// ═══════════════════════════════════════════════════════════════
if (typeof window.COLOR_PALETTE === 'undefined') {
    window.COLOR_PALETTE = [
        { value: '#00aadd', name: 'Голубой' },
        { value: '#000000', name: 'Чёрный' },
        { value: '#4DFF4D', name: 'Зелёный' },
        { value: '#FFA6D3', name: 'Розовый' },
        { value: '#FFFF79', name: 'Жёлтый' },
        { value: '#FFA6A6', name: 'Красный' },
        { value: '#A64DFF', name: 'Фиолетовый' },
        { value: '#4DA6A6', name: 'Бирюзовый' },
        { value: '#FFA679', name: 'Оранжевый' },
        { value: '#4DA64D', name: 'Тёмно-зелёный' },
        { value: '#FF4DA6', name: 'Малиновый' },
        { value: '#4DA6FF', name: 'Синий' },
        { value: '#4DFFA6', name: 'Салатовый' },
        { value: '#FF4DFF', name: 'Пурпурный' },
        { value: '#4D4DFF', name: 'Тёмно-синий' },
        { value: '#A6A6FF', name: 'Лавандовый' },
    ];
}

if (typeof window.contrastTextColor === 'undefined') {
    window.contrastTextColor = function(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        return lum > 150 ? '#000' : '#fff';
    };
}

if (typeof window.closeAllColorDropdowns === 'undefined') {
    window.closeAllColorDropdowns = function() {
        document.querySelectorAll('.color-dropdown.open').forEach(dd => dd.remove());
    };
}

function updateObjectsList() {
    const list = document.getElementById('objectsList'); list.innerHTML = '';
    objects.forEach((obj, index) => {
        const item = document.createElement('div');
        item.className = 'object-item';
        if (selectedObjects.includes(obj)) item.classList.add('selected');

        // Добавляем размер к названию объекта
        let sizeText = '';
        if (obj.type === 'line') {
            sizeText = `L ${(obj.length || 0).toFixed(2)} мм`;
        } else if (obj.type === 'circle') {
            sizeText = `D ${((obj.radius || 0) * 2).toFixed(2)} мм`;
        } else if (obj.type === 'rect') {
            sizeText = `${(obj.absWidth || 0).toFixed(2)} × ${(obj.absHeight || 0).toFixed(2)} мм`;
        } else if (obj.type === 'polygon') {
            sizeText = `${obj.sides} уг. D ${((obj.radius || 0) * 2).toFixed(2)} мм`;
        }

        // Текущий цвет объекта
        const color = obj.color || '#00aadd';
        const textColor = contrastTextColor(color);
        const colorName = (COLOR_PALETTE.find(c => c.value.toLowerCase() === color.toLowerCase()) || {}).name || 'Другой';

        item.innerHTML = `
            <span>${getTypeName(obj.type)} #${index + 1} <small style="color:#aaa; margin-left:5px">(${sizeText})</small></span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button class="color-picker-btn" data-obj-index="${index}" style="display:flex;align-items:center;justify-content:center;padding:2px;width:24px;height:20px;background:${color};border:1px solid #555;border-radius:3px;cursor:pointer;" title="${colorName}">
                    <span style="width:12px;height:12px;border-radius:2px;background:${color};border:1px solid rgba(255,255,255,0.3);"></span>
                </button>
                <button class="delete-obj">×</button>
            </div>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-obj')) return;
            if (e.target.closest('.color-picker-btn')) return;
            if (isCtrlPressed) { const idx = selectedObjects.indexOf(obj); if (idx >= 0) selectedObjects.splice(idx, 1); else selectedObjects.push(obj); }
            else selectedObjects.length = 0; selectedObjects.push(obj);
            currentTool = 'select';
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tool="select"]').classList.add('active');
            document.getElementById('currentTool').textContent = 'Инструмент: Выбрать';
            if (typeof lineDimensionInput !== 'undefined' && lineDimensionInput) {
                lineDimensionInput.style.display = 'none';
                lineDimensionInput.value = '';
            }
            if (typeof shapeInputStage !== 'undefined') shapeInputStage = 0;
            if (typeof isDrawing !== 'undefined') { isDrawing = false; currentShape = null; }
            showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); render();
        });

        // Обработчик клика по кнопке цвета — открыть палитру
        item.querySelector('.color-picker-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllColorDropdowns();

            const btn = e.currentTarget;
            const rect = btn.getBoundingClientRect();

            // Создаём выпадающую палитру (только цветные квадраты)
            const dropdown = document.createElement('div');
            dropdown.className = 'color-dropdown open';
            // Вычисляем позицию: если не влезает вниз — открываем вверх
            const dropdownHeight = COLOR_PALETTE.length * 24 + 12; // примерная высота
            const spaceBelow = window.innerHeight - rect.bottom - 4;
            const spaceAbove = rect.top - 4;
            let dropdownTop;
            if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
                dropdownTop = rect.bottom + 2;
            } else {
                dropdownTop = Math.max(4, rect.top - dropdownHeight - 2);
            }

            dropdown.style.cssText = `
                position:fixed;
                left:${rect.left}px;
                top:${dropdownTop}px;
                z-index:10000;
                background:#2a2a2a;
                border:1px solid #555;
                border-radius:6px;
                padding:4px;
                display:grid;
                grid-template-columns:1fr;
                gap:2px;
                box-shadow:0 4px 16px rgba(0,0,0,0.5);
                max-height:calc(100vh - 8px);
                overflow-y:auto;
            `;

            // Кастомный скроллбар для тёмной темы
            dropdown.classList.add('color-dropdown-scroll');

            COLOR_PALETTE.forEach(c => {
                const isSelected = c.value.toLowerCase() === color.toLowerCase();
                const swatchBtn = document.createElement('button');
                swatchBtn.title = c.name;
                swatchBtn.style.cssText = `
                    width:28px;height:20px;
                    background:${c.value};
                    border:2px solid ${isSelected ? '#00aaff' : 'transparent'};
                    border-radius:3px;cursor:pointer;
                    padding:0;
                `;
                if (isSelected) swatchBtn.style.boxShadow = '0 0 0 1px #00aaff';
                swatchBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    obj.color = c.value;
                    closeAllColorDropdowns();
                    render();
                    if (typeof saveState === 'function') saveState();
                    updateObjectsList();
                });
                dropdown.appendChild(swatchBtn);
            });

            document.body.appendChild(dropdown);

            // Закрыть при клике вне
            const closeHandler = (ev) => {
                if (!dropdown.contains(ev.target) && ev.target !== btn) {
                    dropdown.remove();
                    document.removeEventListener('click', closeHandler, true);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
        });

        item.querySelector('.delete-obj').addEventListener('click', (e) => {
            e.stopPropagation(); saveState();
            const _idx = objects.indexOf(obj); if (_idx >= 0) objects.splice(_idx, 1); // v4.69: in-place
            if (selectedObjects.includes(obj)) { const _si = selectedObjects.indexOf(obj); if (_si >= 0) selectedObjects.splice(_si, 1); showProperties(selectedObjects.length === 1 ? selectedObjects[0] : null); }
            render();
        });
        list.appendChild(item);
    });
}

// ── Обработчик кнопки цвета для одного объекта ──
document.getElementById('singleColorBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllColorDropdowns();

    if (selectedObjects.length !== 1) return;
    const obj = selectedObjects[0];

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    const objColor = (obj.color || '#00aadd').toLowerCase();

    const dropdown = document.createElement('div');
    dropdown.className = 'color-dropdown open';

    const dropdownHeight = COLOR_PALETTE.length * 24 + 12;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    let dropdownTop;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
        dropdownTop = rect.bottom + 2;
    } else {
        dropdownTop = Math.max(4, rect.top - dropdownHeight - 2);
    }

    dropdown.style.cssText = `
        position:fixed;
        left:${rect.left}px;
        top:${dropdownTop}px;
        z-index:10000;
        background:#2a2a2a;
        border:1px solid #555;
        border-radius:6px;
        padding:4px;
        display:grid;
        grid-template-columns:1fr;
        gap:2px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);
        max-height:calc(100vh - 8px);
        overflow-y:auto;
    `;
    dropdown.classList.add('color-dropdown-scroll');

    COLOR_PALETTE.forEach(c => {
        const isSelected = c.value.toLowerCase() === objColor;
        const swatchBtn = document.createElement('button');
        swatchBtn.title = c.name;
        swatchBtn.style.cssText = `
            width:28px;height:20px;
            background:${c.value};
            border:2px solid ${isSelected ? '#00aaff' : 'transparent'};
            border-radius:3px;cursor:pointer;
            padding:0;
        `;
        if (isSelected) swatchBtn.style.boxShadow = '0 0 0 1px #00aaff';
        swatchBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (typeof saveState === 'function') saveState();
            obj.color = c.value;
            closeAllColorDropdowns();
            render();
            updateObjectsList();
            // Обновляем swatch
            const sw = document.getElementById('singleColorSwatch');
            const nm = document.getElementById('singleColorName');
            const palEntry = COLOR_PALETTE.find(p => p.value.toLowerCase() === c.value.toLowerCase());
            sw.style.background = c.value;
            nm.textContent = palEntry ? palEntry.name : c.value;
        });
        dropdown.appendChild(swatchBtn);
    });

    document.body.appendChild(dropdown);

    const closeHandler = (ev) => {
        if (!dropdown.contains(ev.target) && ev.target !== btn) {
            dropdown.remove();
            document.removeEventListener('click', closeHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
});

// ── Обработчик кнопки цвета для множественного выделения ──
document.getElementById('multiColorBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllColorDropdowns();

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    // Текущий общий цвет (если все одинаковые)
    const colors = selectedObjects.map(o => (o.color || '#00aadd').toLowerCase());
    const allSame = colors.every(c => c === colors[0]);
    const currentColor = allSame ? colors[0] : null;

    const dropdown = document.createElement('div');
    dropdown.className = 'color-dropdown open';

    const dropdownHeight = COLOR_PALETTE.length * 24 + 12;
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    let dropdownTop;
    if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
        dropdownTop = rect.bottom + 2;
    } else {
        dropdownTop = Math.max(4, rect.top - dropdownHeight - 2);
    }

    dropdown.style.cssText = `
        position:fixed;
        left:${rect.left}px;
        top:${dropdownTop}px;
        z-index:10000;
        background:#2a2a2a;
        border:1px solid #555;
        border-radius:6px;
        padding:4px;
        display:grid;
        grid-template-columns:1fr;
        gap:2px;
        box-shadow:0 4px 16px rgba(0,0,0,0.5);
        max-height:calc(100vh - 8px);
        overflow-y:auto;
    `;
    dropdown.classList.add('color-dropdown-scroll');

    COLOR_PALETTE.forEach(c => {
        const isSelected = currentColor && c.value.toLowerCase() === currentColor;
        const swatchBtn = document.createElement('button');
        swatchBtn.title = c.name;
        swatchBtn.style.cssText = `
            width:28px;height:20px;
            background:${c.value};
            border:2px solid ${isSelected ? '#00aaff' : 'transparent'};
            border-radius:3px;cursor:pointer;
            padding:0;
        `;
        if (isSelected) swatchBtn.style.boxShadow = '0 0 0 1px #00aaff';
        swatchBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            // Применяем цвет ко всем выделенным объектам
            if (typeof saveState === 'function') saveState();
            for (const obj of selectedObjects) {
                obj.color = c.value;
            }
            closeAllColorDropdowns();
            render();
            updateObjectsList();
            showProperties(null); // Обновим панель
            // Переотобразим мульти-панель
            if (selectedObjects.length > 1) {
                const multiInfo = document.getElementById('multiSelectInfo');
                multiInfo.style.display = 'block';
                document.getElementById('multiCount').textContent = selectedObjects.length;
                const multiSwatch = document.getElementById('multiColorSwatch');
                const multiName = document.getElementById('multiColorName');
                const palEntry = COLOR_PALETTE.find(p => p.value.toLowerCase() === c.value.toLowerCase());
                multiSwatch.style.background = c.value;
                multiName.textContent = palEntry ? palEntry.name : c.value;
            }
        });
        dropdown.appendChild(swatchBtn);
    });

    document.body.appendChild(dropdown);

    const closeHandler = (ev) => {
        if (!dropdown.contains(ev.target) && ev.target !== btn) {
            dropdown.remove();
            document.removeEventListener('click', closeHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
});

function updateStatusBar() {
    document.getElementById('objectCount').textContent = `Объектов: ${objects.length}`;
    document.getElementById('selectedCount').textContent = `Выбрано: ${selectedObjects.length}`;
    document.getElementById('undoStack').textContent = `История: ${undoStack.length}`;
    
    // Обновляем индикатор выделенных деталей на листе
    const nestedSelectInfo = document.getElementById('nestedSelectInfo');
    const nestedSelectedCount = document.getElementById('nestedSelectedCount');
    if (showSheetView && selectedNestedParts.length > 0) {
        nestedSelectInfo.style.display = 'flex';
        nestedSelectedCount.textContent = `Выделено деталей: ${selectedNestedParts.length}`;
    } else {
        nestedSelectInfo.style.display = 'none';
    }
}

function getSelectionCenter() {
    if (selectedObjects.length === 0) return { x: 0, y: 0 };
    if (selectedObjects.length === 1) return selectedObjects[0].center;
    let sumX = 0, sumY = 0;
    selectedObjects.forEach(obj => { sumX += obj.center.x; sumY += obj.center.y; });
    return { x: sumX / selectedObjects.length, y: sumY / selectedObjects.length };
}

// Получение начальной позиции объекта (для перетаскивания)
function getInitialObjectPosition(obj) {
    if (obj.type === 'line') return { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
    if (obj.type === 'circle') return { cx: obj.cx, cy: obj.cy };
    if (obj.type === 'rect') return { x: obj.x, y: obj.y };
    if (obj.type === 'polygon') return { cx: obj.cx, cy: obj.cy };
    if (obj.type === 'text') return { x: obj.x, y: obj.y };
    if (obj.type === 'arc') return { cx: obj.cx, cy: obj.cy };
    return {};
}

// Восстановление начальной позиции объекта
function restoreInitialObjectPosition(obj, positions) {
    if (obj.type === 'line') { obj.x1 = positions.x1; obj.y1 = positions.y1; obj.x2 = positions.x2; obj.y2 = positions.y2; }
    if (obj.type === 'circle') { obj.cx = positions.cx; obj.cy = positions.cy; }
    if (obj.type === 'rect') { obj.x = positions.x; obj.y = positions.y; }
    if (obj.type === 'polygon') { obj.cx = positions.cx; obj.cy = positions.cy; }
    if (obj.type === 'text') { obj.x = positions.x; obj.y = positions.y; }
    if (obj.type === 'arc') { obj.cx = positions.cx; obj.cy = positions.cy; }
}