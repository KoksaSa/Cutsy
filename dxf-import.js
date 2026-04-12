// ═══════════════════════════════════════════════════════════════
// ИМПОРТ ДЕТАЛЕЙ ИЗ DXF
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ ИМПОРТА
// ═══════════════════════════════════════════════════════════════

let importedObjects = [];  // Распарсенные объекты из DXF
let dxfBounds = {};         // Границы детали
let dxfFileName = '';       // Имя файла

// ═══════════════════════════════════════════════════════════════
// ФУНКЦИЯ ИМПОРТА DXF
// ═══════════════════════════════════════════════════════════════

async function importDXF(file) {
    if (!file) return null;

    dxfFileName = file.name.replace(/\.dxf$/i, '');

    try {
        const text = await file.text();
        
        // Парсим DXF
        let dxf;
        if (typeof DxfParser !== 'undefined') {
            const parser = new DxfParser();
            dxf = parser.parseSync(text);
        } else {
            console.error('DxfParser не подключён');
            alert('❌ Ошибка: библиотека dxf-parser не подключена');
            return null;
        }

        console.log('DXF Entities:', dxf.entities);

        // Инвертируем дуги ПЕРЕД конвертацией (DXF: Y вверх, Canvas: Y вниз)
        dxf.entities.forEach(entity => {
            const entityType = (entity.type || '').toUpperCase();
            if (entityType === 'ARC') {
                // Временно инвертируем для правильной аппроксимации
                entity.startAngle = -entity.startAngle;
                entity.endAngle = -entity.endAngle;
                entity.angleLength = -entity.angleLength;
            }
        });

        // Преобразуем entity в объекты CAD
        importedObjects = [];
        dxf.entities.forEach(entity => {
            convertDXFEntity(entity);
        });

        if (importedObjects.length === 0) {
            alert('⚠️ В DXF файле не найдено поддерживаемых объектов (LINE, CIRCLE, LWPOLYLINE)');
            return null;
        }

        // Вычисляем границы
        dxfBounds = calculateBounds(importedObjects);

        // Инвертируем Y координаты всех объектов
        const height = dxfBounds.maxY - dxfBounds.minY;
        importedObjects.forEach(obj => {
            invertY(obj, height);
        });

        // Пересчитываем границы после инверсии
        dxfBounds = calculateBounds(importedObjects);

        // Возвращаем успешный результат
        return {
            objects: importedObjects,
            bounds: dxfBounds,
            fileName: dxfFileName,
            entityCount: dxf.entities.length
        };

    } catch (err) {
        console.error('Ошибка импорта DXF:', err);
        alert('❌ Не удалось распарсить DXF: ' + err.message);
        return null;
    }
}

// Инверсия Y координаты
function invertY(obj, maxY) {
    if (obj.type === 'line') {
        obj.y1 = maxY - obj.y1;
        obj.y2 = maxY - obj.y2;
    } else if (obj.type === 'circle') {
        obj.cy = maxY - obj.cy;
    } else if (obj.type === 'rect') {
        obj.y = maxY - obj.y - obj.height;
    } else if (obj.type === 'polygon') {
        obj.cy = maxY - obj.cy;
    }
}

// ═══════════════════════════════════════════════════════════════
// ИЗВЛЕЧЕНИЕ BULGE ЗНАЧЕНИЙ ИЗ LWPOLYLINE
// ═══════════════════════════════════════════════════════════════

// Извлекаем bulge значения из LWPOLYLINE entity
// Bulge хранится с кодом 42 в DXF файле
function extractBulgeValues(entity) {
    const bulgeArray = [];

    // Проверяем vertexData (массив с кодами: 10, 20, 42, ...)
    if (entity.vertexData && Array.isArray(entity.vertexData)) {
        for (let i = 0; i < entity.vertexData.length; i++) {
            const vd = entity.vertexData[i];
            if (vd && vd.bulge !== undefined) {
                bulgeArray.push(vd.bulge);
            } else if (typeof vd === 'object' && vd.code === 42) {
                bulgeArray.push(vd.value);
            }
        }
    }

    // Если vertexData нет или пустой, проверяем vertices
    if (bulgeArray.length === 0 && entity.vertices && entity.vertices.length > 0) {
        entity.vertices.forEach((v) => {
            let bulge = 0;
            if (v.bulge !== undefined) bulge = v.bulge;
            else if (v.b !== undefined) bulge = v.b;
            else if (Array.isArray(v) && v.length > 2) bulge = v[2];
            bulgeArray.push(bulge);
        });
    }

    return bulgeArray;
}

// ═══════════════════════════════════════════════════════════════
// ПРЕОБРАЗОВАНИЕ DXF ENTITY В CAD ОБЪЕКТЫ
// ═══════════════════════════════════════════════════════════════

function convertDXFEntity(entity) {
    console.log('Обработка entity:', entity.type, entity);
    
    switch (entity.type) {
        case 'LINE':
            // LINE может иметь start/end ИЛИ vertices массив
            let startX, startY, endX, endY;
            
            if (entity.start && entity.end) {
                // Формат: start: {x, y}, end: {x, y}
                startX = entity.start.x ?? entity.start[0] ?? 0;
                startY = entity.start.y ?? entity.start[1] ?? 0;
                endX = entity.end.x ?? entity.end[0] ?? 0;
                endY = entity.end.y ?? entity.end[1] ?? 0;
            } else if (entity.vertices && entity.vertices.length === 2) {
                // Формат: vertices: [{x, y}, {x, y}]
                const v1 = entity.vertices[0];
                const v2 = entity.vertices[1];
                startX = v1.x ?? v1[0] ?? 0;
                startY = v1.y ?? v1[1] ?? 0;
                endX = v2.x ?? v2[0] ?? 0;
                endY = v2.y ?? v2[1] ?? 0;
            } else {
                console.log('LINE без координат (нет start/end или vertices), пропущено:', entity);
                break;
            }
            
            console.log('LINE координаты:', {startX, startY, endX, endY}, entity);
            
            const line = new Line(startX, startY, endX, endY);
            importedObjects.push(line);
            break;

        case 'CIRCLE':
            if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined && entity.radius) {
                const circle = new Circle(
                    entity.center.x,
                    entity.center.y,
                    entity.radius
                );
                importedObjects.push(circle);
            } else {
                console.log('CIRCLE без параметров, пропущено:', entity);
            }
            break;

        case 'LWPOLYLINE':
            // Проверяем наличие вершин
            if (!entity.vertices || entity.vertices.length === 0) {
                console.log('LWPOLYLINE без вершин, пропущено');
                break;
            }

            // Нормализуем вершины - поддерживаем разные форматы координат
            const normalizedVertices = entity.vertices.map(v => {
                // Поддержка разных форматов: {x, y}, [x, y], {x: number, y: number}
                if (Array.isArray(v)) {
                    return { x: v[0] ?? 0, y: v[1] ?? 0 };
                } else if (v && typeof v === 'object') {
                    return {
                        x: v.x ?? v[0] ?? 0,
                        y: v.y ?? v[1] ?? 0
                    };
                }
                return null;
            }).filter(v => v !== null);

            if (normalizedVertices.length < 2) {
                console.log('LWPOLYLINE с недостаточным количеством вершин:', normalizedVertices.length);
                break;
            }

            // Извлекаем bulge значения из raw entity данных
            // bulge хранится с кодом 42 в данных DXF
            const bulgeArray = extractBulgeValues(entity);

            // Проверяем, есть ли дуги (bulge != 0)
            const hasArcs = bulgeArray.some((b, i) => i < normalizedVertices.length && Math.abs(b) > 0.001);

            if (!hasArcs && normalizedVertices.length === 4 && isRectangle(normalizedVertices)) {
                // Это прямоугольник без дуг
                const rect = createRectFromVertices(normalizedVertices);
                importedObjects.push(rect);
            } else {
                // Это многоугольник или полилиния с дугами
                for (let i = 0; i < normalizedVertices.length; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    const bulge = bulgeArray[i] || 0;

                    if (Math.abs(bulge) < 0.001) {
                        // Прямая линия
                        const line = new Line(v1.x, v1.y, v2.x, v2.y);
                        importedObjects.push(line);
                    } else {
                        // Дуга - аппроксимируем линиями
                        const arcLines = approximateBulgeArc(v1, v2, bulge);
                        importedObjects.push(...arcLines);
                    }
                }
            }
            break;

        case 'POLYLINE':
            // Аналогично LWPOLYLINE
            if (entity.vertices && entity.vertices.length > 0) {
                // Нормализуем вершины
                const normalizedVertices = entity.vertices.map(v => {
                    if (Array.isArray(v)) {
                        return { x: v[0] ?? 0, y: v[1] ?? 0 };
                    } else if (v && typeof v === 'object') {
                        return { x: v.x ?? v[0] ?? 0, y: v.y ?? v[1] ?? 0 };
                    }
                    return null;
                }).filter(v => v !== null);

                for (let i = 0; i < normalizedVertices.length; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    const line = new Line(v1.x, v1.y, v2.x, v2.y);
                    importedObjects.push(line);
                }
            }
            break;

        case 'ARC':
        case 'Arc':
        case 'arc':
            // Проверяем наличие всех необходимых параметров
            console.log('Обработка ARC:', {
                center: entity.center,
                radius: entity.radius,
                startAngle: entity.startAngle,
                endAngle: entity.endAngle,
                angleLength: entity.angleLength
            });
            
            if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined &&
                entity.radius && entity.radius > 0) {
                
                // Получаем углы с поддержкой разных форматов
                let startAngle = entity.startAngle;
                let endAngle = entity.endAngle;
                
                // Если углов нет, пробуем вычислить из angleLength
                if (startAngle === undefined || endAngle === undefined) {
                    if (entity.angleLength !== undefined) {
                        startAngle = 0;
                        endAngle = entity.angleLength;
                    } else {
                        console.log('ARC без углов, пропущено');
                        break;
                    }
                }
                
                // Аппроксимируем дугу несколькими линиями
                const arcLines = approximateArc(entity);
                console.log('Дуга аппроксимирована на', arcLines.length, 'линий');
                importedObjects.push(...arcLines);
            } else {
                console.log('ARC без необходимых параметров, пропущено:', entity);
            }
            break;

        case 'ELLIPSE':
            // Аппроксимируем эллипс линиями
            if (entity.center && entity.majorAxisEndPoint && entity.axisRatio) {
                const ellipseLines = approximateEllipse(entity);
                importedObjects.push(...ellipseLines);
            }
            break;

        case 'SPLINE':
            // Аппроксимируем сплайн линиями (если есть контрольные точки)
            if (entity.fitPoints && entity.fitPoints.length > 0) {
                const splineLines = approximateSpline(entity.fitPoints);
                importedObjects.push(...splineLines);
            } else if (entity.controlPoints && entity.controlPoints.length > 0) {
                const splineLines = approximateSpline(entity.controlPoints);
                importedObjects.push(...splineLines);
            }
            break;

        case 'POINT':
            // Точки игнорируем (можно добавить маркер если нужно)
            break;

        default:
            console.log('Пропущена entity:', entity.type);
    }
}

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

// Проверка, является ли полилиния прямоугольником
function isRectangle(vertices) {
    if (vertices.length !== 4) return false;
    
    // Проверяем углы (должны быть 90°)
    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        const v3 = vertices[(i + 2) % 4];
        
        const dx1 = v2.x - v1.x;
        const dy1 = v2.y - v1.y;
        const dx2 = v3.x - v2.x;
        const dy2 = v3.y - v2.y;
        
        // Скалярное произведение должно быть близко к 0 (прямой угол)
        const dot = dx1 * dx2 + dy1 * dy2;
        if (Math.abs(dot) > 0.1) return false;
    }
    
    return true;
}

// Создание Rect из вершин
function createRectFromVertices(vertices) {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return new Rect(minX, minY, maxX - minX, maxY - minY);
}

// Аппроксимация дуги линиями
function approximateArc(arc) {
    const lines = [];
    
    // DXF использует: 0° вправо (по оси X), угол растёт против часовой
    let startAngle = arc.startAngle || 0;
    let endAngle = arc.endAngle !== undefined ? arc.endAngle : (startAngle + arc.angle);
    
    // Проверяем направление по angleLength
    const angleLength = arc.angleLength || (endAngle - startAngle);
    const isCounterClockwise = angleLength < 0;
    
    // Если дуга против часовой стрелки, меняем start/end местами
    if (isCounterClockwise) {
        const temp = startAngle;
        startAngle = endAngle;
        endAngle = temp;
    }
    
    // Вычисляем разницу углов
    let angleDiff = endAngle - startAngle;
    
    // Нормализуем (чтобы было в диапазоне -2π до 2π)
    while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI * 2) angleDiff += Math.PI * 2;
    
    // Количество сегментов (10° на сегмент)
    const segments = Math.max(16, Math.ceil(Math.abs(angleDiff) / (Math.PI / 18)));
    const angleStep = angleDiff / segments;
    
    let prevX = arc.center.x + Math.cos(startAngle) * arc.radius;
    let prevY = arc.center.y + Math.sin(startAngle) * arc.radius;
    
    for (let i = 1; i <= segments; i++) {
        const angle = startAngle + i * angleStep;
        const x = arc.center.x + Math.cos(angle) * arc.radius;
        const y = arc.center.y + Math.sin(angle) * arc.radius;
        
        lines.push(new Line(prevX, prevY, x, y));
        prevX = x;
        prevY = y;
    }
    
    return lines;
}

// Аппроксимация эллипса линиями
function approximateEllipse(ellipse) {
    const lines = [];
    const segments = 36; // 10° на сегмент
    
    // Вычисляем большую и малую полуоси
    const a = Math.sqrt(ellipse.majorAxisEndPoint.x * ellipse.majorAxisEndPoint.x + 
                        ellipse.majorAxisEndPoint.y * ellipse.majorAxisEndPoint.y);
    const b = a * ellipse.axisRatio;
    
    // Угол поворота эллипса
    const rotation = Math.atan2(ellipse.majorAxisEndPoint.y, ellipse.majorAxisEndPoint.x);
    
    for (let i = 0; i <= segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const nextAngle = (2 * Math.PI * (i + 1)) / segments;
        
        // Точка на эллипсе
        const x1 = ellipse.center.x + (a * Math.cos(angle) * Math.cos(rotation) - b * Math.sin(angle) * Math.sin(rotation));
        const y1 = ellipse.center.y + (a * Math.cos(angle) * Math.sin(rotation) + b * Math.sin(angle) * Math.cos(rotation));
        const x2 = ellipse.center.x + (a * Math.cos(nextAngle) * Math.cos(rotation) - b * Math.sin(nextAngle) * Math.sin(rotation));
        const y2 = ellipse.center.y + (a * Math.cos(nextAngle) * Math.sin(rotation) + b * Math.sin(nextAngle) * Math.cos(rotation));
        
        lines.push(new Line(x1, y1, x2, y2));
    }
    
    return lines;
}

// Аппроксимация дуги по bulge коэффициенту
// Bulge = tan(θ/4) где θ - угол дуги
// Положительный bulge = дуга против часовой стрелки
// Отрицательный bulge = дуга по часовой стрелке
function approximateBulgeArc(v1, v2, bulge) {
    const lines = [];
    
    // Расстояние между точками
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    if (chordLength < 0.001) {
        return lines; // Точки слишком близко
    }
    
    // Вычисляем угол дуги из bulge
    // bulge = tan(θ/4), поэтому θ = 4 * atan(bulge)
    const sweepAngle = 4 * Math.atan(Math.abs(bulge));
    
    // Вычисляем радиус дуги
    // R = chordLength / (2 * sin(θ/2))
    const radius = chordLength / (2 * Math.sin(sweepAngle / 2));
    
    // Вычисляем расстояние от середины хорды до центра дуги
    // sagitta = R - R * cos(θ/2) = R * (1 - cos(θ/2))
    const sagitta = Math.abs(bulge) * chordLength / 2;
    
    // Находим середину хорды
    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;
    
    // Находим перпендикуляр к хорде
    const perpX = -dy / chordLength;
    const perpY = dx / chordLength;
    
    // Направление зависит от знака bulge
    const direction = bulge > 0 ? 1 : -1;
    
    // Центр дуги
    const centerX = midX + direction * perpX * (radius * Math.cos(sweepAngle / 2));
    const centerY = midY + direction * perpY * (radius * Math.cos(sweepAngle / 2));
    
    // Вычисляем начальный и конечный углы
    const startAngle = Math.atan2(v1.y - centerY, v1.x - centerX);
    let endAngle = Math.atan2(v2.y - centerY, v2.x - centerX);
    
    // Определяем направление дуги
    let angleDiff = endAngle - startAngle;
    if (bulge > 0) {
        // Против часовой
        if (angleDiff < 0) angleDiff += 2 * Math.PI;
    } else {
        // По часовой
        if (angleDiff > 0) angleDiff -= 2 * Math.PI;
    }
    
    // Количество сегментов для аппроксимации
    const segments = Math.max(4, Math.ceil(Math.abs(angleDiff) / (Math.PI / 18)));
    const angleStep = angleDiff / segments;
    
    let prevX = v1.x;
    let prevY = v1.y;
    
    for (let i = 1; i <= segments; i++) {
        const angle = startAngle + i * angleStep;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        lines.push(new Line(prevX, prevY, x, y));
        prevX = x;
        prevY = y;
    }
    
    return lines;
}

// Аппроксимация сплайна линиями
function approximateSpline(points) {
    const lines = [];
    
    if (points.length < 2) return lines;

    // Если точек мало (2-3), просто соединяем их
    if (points.length <= 3) {
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (p1.x !== undefined && p1.y !== undefined && p2.x !== undefined && p2.y !== undefined) {
                lines.push(new Line(p1.x, p1.y, p2.x, p2.y));
            }
        }
        return lines;
    }

    // Для большего количества точек используем кривые Безье
    // Разбиваем сплайн на сегменты по 10°
    const segmentsPerSpan = 10;
    
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        if (p1.x === undefined || p1.y === undefined || p2.x === undefined || p2.y === undefined) {
            continue;
        }

        // Вычисляем контрольные точки для кривой Безье
        // Используем простую интерполяцию между точками
        const prev = i > 0 ? points[i - 1] : p1;
        const next = i < points.length - 2 ? points[i + 2] : p2;

        // Касательные в точках
        const t1x = (p2.x - prev.x) / 2;
        const t1y = (p2.y - prev.y) / 2;
        const t2x = (next.x - p1.x) / 2;
        const t2y = (next.y - p1.y) / 2;

        // Контрольные точки для кривой Безье
        const cp1x = p1.x + t1x / 3;
        const cp1y = p1.y + t1y / 3;
        const cp2x = p2.x - t2x / 3;
        const cp2y = p2.y - t2y / 3;

        // Аппроксимируем кривую Безье линиями
        let prevX = p1.x;
        let prevY = p1.y;

        for (let j = 1; j <= segmentsPerSpan; j++) {
            const t = j / segmentsPerSpan;
            const t2 = t * t;
            const t3 = t2 * t;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;

            // Кубическая кривая Безье
            const x = mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y;

            lines.push(new Line(prevX, prevY, x, y));
            prevX = x;
            prevY = y;
        }
    }

    return lines;
}

// Вычисление границ объектов
function calculateBounds(objects) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    objects.forEach(obj => {
        // Если есть метод getPoints - используем его
        if (typeof obj.getPoints === 'function') {
            const points = obj.getPoints();
            points.forEach(pt => {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            });
        } else {
            // Для простых объектов из DXF
            if (obj.type === 'line') {
                minX = Math.min(minX, obj.x1, obj.x2);
                maxX = Math.max(maxX, obj.x1, obj.x2);
                minY = Math.min(minY, obj.y1, obj.y2);
                maxY = Math.max(maxY, obj.y1, obj.y2);
            } else if (obj.type === 'circle') {
                minX = Math.min(minX, obj.cx - obj.radius);
                maxX = Math.max(maxX, obj.cx + obj.radius);
                minY = Math.min(minY, obj.cy - obj.radius);
                maxY = Math.max(maxY, obj.cy + obj.radius);
            } else if (obj.type === 'rect') {
                minX = Math.min(minX, obj.x);
                maxX = Math.max(maxX, obj.x + obj.width);
                minY = Math.min(minY, obj.y);
                maxY = Math.max(maxY, obj.y + obj.height);
            } else if (obj.type === 'polygon' || obj.type === 'polyline') {
                const points = obj.points || obj.vertices || [];
                points.forEach(pt => {
                    minX = Math.min(minX, pt.x);
                    minY = Math.min(minY, pt.y);
                    maxX = Math.max(maxX, pt.x);
                    maxY = Math.max(maxY, pt.y);
                });
            }
        }
    });

    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА ПРЕДПРОСМОТРА В SVG
// ═══════════════════════════════════════════════════════════════

function drawImportPreview(svgElement) {
    if (!svgElement) return;
    
    svgElement.innerHTML = '';
    
    if (importedObjects.length === 0) return;

    // Вычисляем границы для масштабирования
    const bounds = calculateBounds(importedObjects);
    const padding = 20;
    
    // Вычисляем масштаб для вписывания в SVG
    const svgWidth = parseFloat(svgElement.getAttribute('width')) || 600;
    const svgHeight = parseFloat(svgElement.getAttribute('height')) || 400;
    
    const scaleX = (svgWidth - 2 * padding) / bounds.width;
    const scaleY = (svgHeight - 2 * padding) / bounds.height;
    const scale = Math.min(scaleX, scaleY, 1); // Не увеличиваем
    
    // Смещение для центрирования
    const offsetX = (svgWidth - bounds.width * scale) / 2 - bounds.minX * scale + padding;
    const offsetY = (svgHeight - bounds.height * scale) / 2 - bounds.minY * scale + padding;

    // Рисуем объекты
    importedObjects.forEach(obj => {
        if (obj.type === 'line') {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute('x1', obj.x1 * scale + offsetX);
            line.setAttribute('y1', obj.y1 * scale + offsetY);
            line.setAttribute('x2', obj.x2 * scale + offsetX);
            line.setAttribute('y2', obj.y2 * scale + offsetY);
            line.setAttribute('stroke', '#007acc');
            line.setAttribute('stroke-width', '1.5');
            svgElement.appendChild(line);
        }
        else if (obj.type === 'circle') {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute('cx', obj.cx * scale + offsetX);
            circle.setAttribute('cy', obj.cy * scale + offsetY);
            circle.setAttribute('r', obj.radius * scale);
            circle.setAttribute('stroke', '#c72e2e');
            circle.setAttribute('fill', 'none');
            circle.setAttribute('stroke-width', '1.5');
            svgElement.appendChild(circle);
        }
        else if (obj.type === 'rect') {
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute('x', obj.x * scale + offsetX);
            rect.setAttribute('y', obj.y * scale + offsetY);
            rect.setAttribute('width', obj.width * scale);
            rect.setAttribute('height', obj.height * scale);
            rect.setAttribute('stroke', '#2d7d2d');
            rect.setAttribute('fill', 'none');
            rect.setAttribute('stroke-width', '1.5');
            svgElement.appendChild(rect);
        }
        else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const points = obj.points || obj.vertices || [];
            if (points.length > 0) {
                const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
                const pointsStr = points.map(p => {
                    const px = p.x * scale + offsetX;
                    const py = p.y * scale + offsetY;
                    return `${px},${py}`;
                }).join(' ');
                polygon.setAttribute('points', pointsStr);
                polygon.setAttribute('stroke', '#007acc');
                polygon.setAttribute('fill', 'none');
                polygon.setAttribute('stroke-width', '1.5');
                svgElement.appendChild(polygon);
            }
        }
    });

    // Рисуем рамку границ
    const boundsRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    boundsRect.setAttribute('x', bounds.minX * scale + offsetX);
    boundsRect.setAttribute('y', bounds.minY * scale + offsetY);
    boundsRect.setAttribute('width', bounds.width * scale);
    boundsRect.setAttribute('height', bounds.height * scale);
    boundsRect.setAttribute('stroke', '#ffa500');
    boundsRect.setAttribute('fill', 'none');
    boundsRect.setAttribute('stroke-width', '1');
    boundsRect.setAttribute('stroke-dasharray', '5,5');
    svgElement.appendChild(boundsRect);
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ДЕТАЛИ ИЗ ИМПОРТИРОВАННЫХ ОБЪЕКТОВ
// ═══════════════════════════════════════════════════════════════

function createPartFromImport(quantity, name) {
    if (importedObjects.length === 0) {
        alert('⚠️ Нет импортированных объектов');
        return null;
    }

    // Вычисляем границы для нормализации координат
    const bounds = calculateBounds(importedObjects);
    
    // Нормализуем координаты к (0, 0)
    const offsetX = -bounds.minX;
    const offsetY = -bounds.minY;

    // Глубокое копирование объектов с нормализацией координат
    const copyObjects = importedObjects.map(obj => {
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
        }
        return obj;
    });

    // Пересчитываем границы после нормализации
    const normalizedBounds = calculateBounds(copyObjects);

    // Создаём деталь с нормализованными координатами
    const part = {
        id: typeof currentPartId !== 'undefined' ? ++currentPartId : Date.now(),
        objects: copyObjects,
        quantity: quantity,
        name: name || dxfFileName || `Импорт #${Date.now()}`,
        bounds: {
            minX: 0,
            minY: 0,
            width: normalizedBounds.width,
            height: normalizedBounds.height
        },
        nestingEnabled: true,
        visible: false,  // Импорт НЕ показывает деталь на холсте
        rotationMode: 'auto'  // Режим вращения: 'fast' (0° и 90°), 'full' (19 углов), 'auto' (авто)
    };

    // Добавляем в parts (если существует)
    if (typeof parts !== 'undefined') {
        parts.push(part);

        // НЕ добавляем объекты на холст (visible: false)

        // Обновляем UI (если существует функция)
        if (typeof updatePartsList === 'function') {
            updatePartsList();
        }
        // Сохраняем в кэш
        if (typeof saveToCache === 'function') saveToCache();
    }

    console.log('✅ Импортирована деталь:', part);
    return part;
}

// ═══════════════════════════════════════════════════════════════
// СБРОС ИМПОРТА
// ═══════════════════════════════════════════════════════════════

function resetImport() {
    importedObjects = [];
    dxfBounds = {};
    dxfFileName = '';
}
