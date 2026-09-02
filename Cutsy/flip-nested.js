// ═══════════════════════════════════════════════════════════════
// ОТРАЖЕНИЕ ДЕТАЛЕЙ НА ЛИСТЕ — ИСПРАВЛЕННАЯ ВЕРСИЯ
// ═══════════════════════════════════════════════════════════════
// Багфиксы:
//   - fallback для calculateBounds / rotatePolygon / getBoundingBox
//     (вместо return false при отсутствии — inline-реализация)
//   - Math.max(0, ...) при clamp — защита от отрицательной позиции
//   - валидация входных параметров (nested, axis)
//   - убраны информационные console.log
//   - DRY: polyline draw/contains вынесены в вспомогательную функцию
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: добавление методов polyline
// (DRY — используется при отражении и при нормализации)
// ═══════════════════════════════════════════════════════════════
function addPolylineDrawMethods(pl) {
    if (typeof addPolylineMethods === 'function') {
        addPolylineMethods(pl);
    } else {
        pl.draw = function(ctx) {
            if (!this.points || this.points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(this.points[0].x, this.points[0].y);
            for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
            ctx.stroke();
        };
        pl.contains = function(x, y) {
            if (!this.points || this.points.length < 2) return false;
            for (let i = 0; i < this.points.length - 1; i++) {
                const p1 = this.points[i], p2 = this.points[i + 1];
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
}

// ═══════════════════════════════════════════════════════════════
// Отражение детали по X или Y с отражением геометрии
// nested - размещённая деталь на листе
// axis - 'X' или 'Y'
// sheetWidth, sheetHeight - размеры листа
// nestedParts - массив размещённых деталей
// allParts - массив всех деталей (источник объектов)
// ═══════════════════════════════════════════════════════════════
function flipNestedPart(nested, axis, sheetWidth, sheetHeight, nestedParts, allParts) {
    // Валидация входных параметров
    if (!nested || typeof nested !== 'object') {
        console.error('flipNestedPart: nested не передан или не объект');
        return false;
    }
    if (axis !== 'X' && axis !== 'Y') {
        console.error('flipNestedPart: axis должен быть "X" или "Y", получено:', axis);
        return false;
    }
    if (typeof sheetWidth !== 'number' || typeof sheetHeight !== 'number' || sheetWidth <= 0 || sheetHeight <= 0) {
        console.error('flipNestedPart: некорректные размеры листа:', sheetWidth, sheetHeight);
        return false;
    }

    const baseWidth = nested.baseWidth || nested.width;
    const baseHeight = nested.baseHeight || nested.height;

    // Находим исходную деталь для получения объектов
    const part = allParts.find(function(p) { return p.id === nested.partId; });
    if (!part || !part.objects || part.objects.length === 0) {
        console.warn('У детали #' + nested.partId + ' нет объектов для отражения');
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

    // Берём исходные объекты или уже отражённые
    let sourceObjects = part.objects;

    // Если деталь уже была отражена, используем текущие объекты
    if (isFlippedX || isFlippedY) {
        sourceObjects = nested.objects;
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРАЖАЕМ ВСЕ ОБЪЕКТЫ ДЕТАЛИ
    // ═══════════════════════════════════════════════════════════
    const flippedObjects = sourceObjects.map(function(obj) {
        if (obj.type === 'line') {
            if (axis === 'X') {
                const newX1 = boundsWidth + 2 * boundsMinX - obj.x1;
                const newX2 = boundsWidth + 2 * boundsMinX - obj.x2;
                return new Line(newX1, obj.y1, newX2, obj.y2);
            } else {
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
        } else if (obj.type === 'arc') {
            let newCx, newCy, newStartAngle, newEndAngle, newDirection;
            if (axis === 'X') {
                newCx = boundsWidth + 2 * boundsMinX - obj.cx;
                newCy = obj.cy;
                newStartAngle = Math.PI - obj.startAngle;
                newEndAngle = Math.PI - obj.endAngle;
            } else {
                newCx = obj.cx;
                newCy = boundsHeight + 2 * boundsMinY - obj.cy;
                newStartAngle = -obj.startAngle;
                newEndAngle = -obj.endAngle;
            }
            // Нормализуем углы в [0, 2π)
            newStartAngle = ((newStartAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            newEndAngle = ((newEndAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            // При отражении направление меняется на противоположное
            newDirection = obj.direction === 'CW' ? 'CCW' : 'CW';
            const arc = new Arc(newCx, newCy, obj.radius, newStartAngle, newEndAngle, newDirection);
            arc.id = obj.id;
            return arc;
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const flippedPoints = obj.points.map(function(pt) {
                const newPt = {};
                if (axis === 'X') {
                    newPt.x = boundsWidth + 2 * boundsMinX - pt.x;
                    newPt.y = pt.y;
                } else {
                    newPt.x = pt.x;
                    newPt.y = boundsHeight + 2 * boundsMinY - pt.y;
                }
                // v4.78: При зеркалинии bulge меняет знак (дуга меняет направление)
                if (typeof pt.bulge === 'number') {
                    newPt.bulge = -pt.bulge;
                }
                return newPt;
            });
            const pl = { type: obj.type, points: flippedPoints, id: obj.id };
            addPolylineDrawMethods(pl);
            return pl;
        } else if (obj.type === 'text') {
            if (axis === 'X') {
                return new Text(boundsWidth + 2 * boundsMinX - obj.x, obj.y, obj.text, obj.fontSize);
            } else {
                return new Text(obj.x, boundsHeight + 2 * boundsMinY - obj.y, obj.text, obj.fontSize);
            }
        }
        return obj;
    });

    // ═══════════════════════════════════════════════════════════
    // ВЫЧИСЛЕНИЕ ГРАНИЦ И ПОЛИГОНА
    // ═══════════════════════════════════════════════════════════

    // calculateBounds — с fallback
    let flippedBounds;
    if (typeof calculateBounds === 'function') {
        flippedBounds = calculateBounds(flippedObjects);
    } else {
        // Fallback: вычисляем bounds из объектов вручную
        let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
        flippedObjects.forEach(function(obj) {
            if (obj.type === 'line') {
                bMinX = Math.min(bMinX, obj.x1, obj.x2);
                bMinY = Math.min(bMinY, obj.y1, obj.y2);
                bMaxX = Math.max(bMaxX, obj.x1, obj.x2);
                bMaxY = Math.max(bMaxY, obj.y1, obj.y2);
            } else if (obj.type === 'circle' || obj.type === 'arc') {
                const r = Math.abs(obj.radius || 0);
                bMinX = Math.min(bMinX, (obj.cx || 0) - r);
                bMinY = Math.min(bMinY, (obj.cy || 0) - r);
                bMaxX = Math.max(bMaxX, (obj.cx || 0) + r);
                bMaxY = Math.max(bMaxY, (obj.cy || 0) + r);
            } else if (obj.type === 'rect') {
                bMinX = Math.min(bMinX, obj.x);
                bMinY = Math.min(bMinY, obj.y);
                bMaxX = Math.max(bMaxX, obj.x + obj.width);
                bMaxY = Math.max(bMaxY, obj.y + obj.height);
            } else if (obj.type === 'polygon') {
                const verts = (typeof obj.getVertices === 'function') ? obj.getVertices() : [];
                verts.forEach(function(v) {
                    bMinX = Math.min(bMinX, v.x);
                    bMinY = Math.min(bMinY, v.y);
                    bMaxX = Math.max(bMaxX, v.x);
                    bMaxY = Math.max(bMaxY, v.y);
                });
            } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                const pts = obj.points || obj.vertices || [];
                pts.forEach(function(p) {
                    if (p && typeof p.x === 'number') {
                        bMinX = Math.min(bMinX, p.x);
                        bMinY = Math.min(bMinY, p.y);
                        bMaxX = Math.max(bMaxX, p.x);
                        bMaxY = Math.max(bMaxY, p.y);
                    }
                });
            } else if (obj.type === 'text') {
                bMinX = Math.min(bMinX, obj.x || 0);
                bMinY = Math.min(bMinY, obj.y || 0);
                bMaxX = Math.max(bMaxX, obj.x || 0);
                bMaxY = Math.max(bMaxY, obj.y || 0);
            }
        });
        flippedBounds = { minX: bMinX, minY: bMinY, width: bMaxX - bMinX, height: bMaxY - bMinY };
    }

    // Создаём тестовый полигон для проверки
    const testHull = [
        { x: 0, y: 0 },
        { x: flippedBounds.width, y: 0 },
        { x: flippedBounds.width, y: flippedBounds.height },
        { x: 0, y: flippedBounds.height }
    ];

    // v4.77: При отражении угол поворота ИНВЕРТИРУЕТСЯ.
    // Математика: mirror(rotate(p, X)) = rotate(mirror(p), -X).
    // Если движок разместил под углом X, а пользователь отразил,
    // то visual = mirror(rotate(original, X)) = rotate(mirror(original), -X).
    // Значит nested.angle должен стать -X, чтобы export/render
    // применяя угол к mirror(original), дали правильный результат.
    // Двойное отражение (X затем X) вернёт угол: -(-X) = X.
    // Двойное отражение (X затем Y) = rotate 180: -(-X) = X,
    // т.к. mirror_X(mirror_Y(p)) = rotate_180(p), а rotate_180 не меняет угол.
    const prevAngle = (typeof nested.angle === 'number') ? nested.angle : 0;
    const currentAngle = -prevAngle;
    nested.angle = currentAngle;

    // Центр детали для вращения
    const centerX = flippedBounds.width / 2;
    const centerY = flippedBounds.height / 2;

    // Поворачиваем bounding box — с fallback (как в rotateSelectedAsGroup)
    let rotatedHull;
    if (typeof rotatePolygon === 'function') {
        rotatedHull = rotatePolygon(testHull, currentAngle, centerX, centerY);
    } else {
        const cos = Math.cos(currentAngle);
        const sin = Math.sin(currentAngle);
        rotatedHull = testHull.map(function(p) {
            return {
                x: centerX + (p.x - centerX) * cos - (p.y - centerY) * sin,
                y: centerY + (p.x - centerX) * sin + (p.y - centerY) * cos
            };
        });
    }

    // Находим bottom-left повёрнутого hull
    let tempRef = rotatedHull[0];
    for (const p of rotatedHull) {
        if (p.y < tempRef.y || (p.y === tempRef.y && p.x < tempRef.x)) {
            tempRef = p;
        }
    }

    // Нормализуем: сдвигаем hull так чтобы bottom-left = (0,0)
    const tempNormalizedHull = rotatedHull.map(function(p) {
        return { x: p.x - tempRef.x, y: p.y - tempRef.y };
    });

    // getBoundingBox — с fallback (как в rotateSelectedAsGroup)
    let tempBbox;
    if (typeof getBoundingBox === 'function') {
        tempBbox = getBoundingBox(tempNormalizedHull);
    } else {
        tempBbox = tempNormalizedHull.reduce(function(b, p) {
            return {
                minX: Math.min(b.minX, p.x), minY: Math.min(b.minY, p.y),
                maxX: Math.max(b.maxX, p.x), maxY: Math.max(b.maxY, p.y),
                width: Math.max(b.maxX, p.x) - Math.min(b.minX, p.x),
                height: Math.max(b.maxY, p.y) - Math.min(b.minY, p.y)
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    }

    // Дополнительный сдвиг: чтобы bounding box начинался с (0,0)
    const normalizedHull = tempNormalizedHull.map(function(p) {
        return { x: p.x - tempBbox.minX, y: p.y - tempBbox.minY };
    });

    // refPoint для render.js
    const refPoint = {
        x: tempRef.x + tempBbox.minX,
        y: tempRef.y + tempBbox.minY
    };

    // Пересчитываем bounding box после поворота
    const rotatedBbox = { width: tempBbox.width, height: tempBbox.height };

    // ═══════════════════════════════════════════════════════════
    // КОРРЕКЦИЯ ПОЗИЦИИ: сдвигаем деталь чтобы она не выходила за лист
    // Math.max(0, ...) — защита от отрицательной позиции если деталь шире листа
    // ═══════════════════════════════════════════════════════════
    let newX = nested.x;
    let newY = nested.y;

    if (newX < 0) newX = 0;
    if (newX + rotatedBbox.width > sheetWidth) newX = Math.max(0, sheetWidth - rotatedBbox.width);
    if (newY < 0) newY = 0;
    if (newY + rotatedBbox.height > sheetHeight) newY = Math.max(0, sheetHeight - rotatedBbox.height);

    // Обновляем данные детали
    nested.x = newX;
    nested.y = newY;
    nested.polygon = normalizedHull.map(p => ({ x: p.x + newX, y: p.y + newY })); // v4.74: sheet coords
    nested.width = rotatedBbox.width;
    nested.height = rotatedBbox.height;
    nested.refPoint = refPoint;

    // Обновляем флаги отражения
    if (axis === 'X') {
        nested.flippedX = !isFlippedX;
    } else {
        nested.flippedY = !isFlippedY;
    }

    // ═══════════════════════════════════════════════════════════
    // НОРМАЛИЗАЦИЯ ОБЪЕКТОВ (сдвиг к началу координат)
    // ═══════════════════════════════════════════════════════════
    const offsetX = -flippedBounds.minX;
    const offsetY = -flippedBounds.minY;

    nested.objects = flippedObjects.map(function(obj) {
        if (obj.type === 'line') {
            const line = new Line(
                obj.x1 + offsetX, obj.y1 + offsetY,
                obj.x2 + offsetX, obj.y2 + offsetY
            );
            if (obj.color) line.color = obj.color;
            return line;
        } else if (obj.type === 'circle') {
            const circle = new Circle(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius
            );
            if (obj.color) circle.color = obj.color;
            return circle;
        } else if (obj.type === 'rect') {
            const rect = new Rect(
                obj.x + offsetX, obj.y + offsetY,
                obj.width, obj.height
            );
            if (obj.color) rect.color = obj.color;
            return rect;
        } else if (obj.type === 'polygon') {
            const polygon = new Polygon(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius, obj.sides
            );
            if (obj.color) polygon.color = obj.color;
            return polygon;
        } else if (obj.type === 'arc') {
            const arc = new Arc(
                obj.cx + offsetX, obj.cy + offsetY,
                obj.radius,
                obj.startAngle, obj.endAngle, obj.direction
            );
            arc.id = obj.id;
            if (obj.color) arc.color = obj.color;
            return arc;
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pl = {
                type: obj.type,
                points: obj.points.map(function(pt) {
                    const newPt = { x: pt.x + offsetX, y: pt.y + offsetY };
                    // v4.78: Сохраняем bulge при нормализации
                    if (typeof pt.bulge === 'number') newPt.bulge = pt.bulge;
                    return newPt;
                }),
                id: obj.id,
                color: obj.color || '#000000'
            };
            addPolylineDrawMethods(pl);
            return pl;
        } else if (obj.type === 'text') {
            const text = new Text(
                obj.x + offsetX, obj.y + offsetY,
                obj.text, obj.fontSize
            );
            if (obj.color) text.color = obj.color;
            return text;
        }
        return obj;
    });

    return true;
}

// ═══════════════════════════════════════════════════════════════
// ПОВОРОТ ДЕТАЛИ НА ЛИСТЕ
// nested - размещённая деталь на листе
// angle - угол поворота в градусах (положительный = по часовой)
// sheetWidth, sheetHeight - размеры листа
// allParts - массив всех деталей (источник объектов)
// ═══════════════════════════════════════════════════════════════
function rotateNestedPart(nested, angle, sheetWidth, sheetHeight, allParts) {
    // Валидация входных параметров
    if (!nested || typeof nested !== 'object') {
        console.error('rotateNestedPart: nested не передан или не объект');
        return false;
    }
    if (typeof angle !== 'number') {
        console.error('rotateNestedPart: angle должен быть числом');
        return false;
    }
    if (typeof sheetWidth !== 'number' || typeof sheetHeight !== 'number' || sheetWidth <= 0 || sheetHeight <= 0) {
        console.error('rotateNestedPart: некорректные размеры листа:', sheetWidth, sheetHeight);
        return false;
    }

    // Находим исходную деталь для получения размеров
    const part = allParts.find(function(p) { return p.id === nested.partId; });
    if (!part) {
        console.warn('Дetail #' + nested.partId + ' не найдена для поворота');
        return false;
    }

    // Получаем текущий угол и добавляем новый
    const currentAngle = nested.angle || 0;
    const newAngle = currentAngle + angle * Math.PI / 180;

    // Базовые размеры детали
    const baseW = nested.baseWidth || nested.width || (part.bounds ? part.bounds.width : 0);
    const baseH = nested.baseHeight || nested.height || (part.bounds ? part.bounds.height : 0);

    if (baseW <= 0 || baseH <= 0) {
        console.error('rotateNestedPart: некорректные размеры детали:', baseW, baseH);
        return false;
    }

    // ═══════════════════════════════════════════════════════════
    // ПОВОРОТ HULL И ВЫЧИСЛЕНИЕ BBOX
    // ═══════════════════════════════════════════════════════════
    
    // Создаём hull прямоугольника
    const hull = [
        { x: 0, y: 0 },
        { x: baseW, y: 0 },
        { x: baseW, y: baseH },
        { x: 0, y: baseH }
    ];

    // Центр для вращения
    const cx = baseW / 2;
    const cy = baseH / 2;

    // Поворачиваем hull
    let rotatedHull;
    if (typeof rotatePolygon === 'function') {
        rotatedHull = rotatePolygon(hull, newAngle, cx, cy);
    } else {
        // Fallback если rotatePolygon недоступна
        const cos = Math.cos(newAngle);
        const sin = Math.sin(newAngle);
        rotatedHull = hull.map(function(p) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            return {
                x: cx + dx * cos - dy * sin,
                y: cy + dx * sin + dy * cos
            };
        });
    }

    // Находим reference point (bottom-left)
    let ref;
    if (typeof getReferencePoint === 'function') {
        ref = getReferencePoint(rotatedHull);
    } else {
        ref = rotatedHull.reduce(function(r, p) {
            return (p.y < r.y || (p.y === r.y && p.x < r.x)) ? p : r;
        }, rotatedHull[0]);
    }

    // Сдвигаем hull чтобы reference point был в (0, 0)
    const shifted = rotatedHull.map(function(p) {
        return { x: p.x - ref.x, y: p.y - ref.y };
    });

    // Вычисляем bounding box
    let bbox;
    if (typeof getBoundingBox === 'function') {
        bbox = getBoundingBox(shifted);
    } else {
        bbox = shifted.reduce(function(b, p) {
            return {
                minX: Math.min(b.minX, p.x),
                minY: Math.min(b.minY, p.y),
                maxX: Math.max(b.maxX, p.x),
                maxY: Math.max(b.maxY, p.y),
                width: Math.max(b.maxX, p.x) - Math.min(b.minX, p.x),
                height: Math.max(b.maxY, p.y) - Math.min(b.minY, p.y)
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    }

    // Нормализуем hull
    const finalHull = shifted.map(function(p) {
        return { x: p.x - bbox.minX, y: p.y - bbox.minY };
    });

    const newRef = { x: ref.x + bbox.minX, y: ref.y + bbox.minY };

    // ═══════════════════════════════════════════════════════════
    // ОБНОВЛЕНИЕ ДАННЫХ ДЕТАЛИ
    // ═══════════════════════════════════════════════════════════
    
    // Сохраняем позицию на листе (nested.x/y — это top-left BBOX на листе).
    // refPoint — локальная точка внутри geometry, она НЕ равна nested.x/y.
    // При повороте BBOX меняет W/H, поэтому корректируем x/y чтобы деталь
    // оставалась в пределах листа и не уходила за границы.
    const newX = Math.max(0, Math.min(nested.x, sheetWidth - bbox.width));
    const newY = Math.max(0, Math.min(nested.y, sheetHeight - bbox.height));

    // Обновляем данные
    nested.x = newX;
    nested.y = newY;
    nested.angle = newAngle;
    nested.width = bbox.width;
    nested.height = bbox.height;
    nested.polygon = finalHull.map(p => ({ x: p.x + newX, y: p.y + newY })); // v4.74: sheet coords
    nested.refPoint = newRef;

    return true;
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.flipNestedPart = flipNestedPart;
    window.rotateNestedPart = rotateNestedPart;
}