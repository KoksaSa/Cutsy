// n: SilikinK Project
// ═══════════════════════════════════════════════════════════════
// ИМПОРТ ДЕТАЛЕЙ ИЗ DXF
// ═══════════════════════════════════════════════════════════════

let importedObjects = [];
let dxfBounds = {};
let dxfFileName = '';

async function importDXF(file) {
    if (!file) return null;

    dxfFileName = file.name.replace(/\.dxf$/i, '');

    try {
        const text = await file.text();
        
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

        importedObjects = [];
        dxf.entities.forEach(entity => {
            convertDXFEntity(entity);
        });

        if (importedObjects.length === 0) {
            alert('⚠️ В DXF файле не найдено поддерживаемых объектов');
            return null;
        }

        dxfBounds = calculateBounds(importedObjects);
        console.log('DXF Import Bounds:', dxfBounds);

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

function extractBulgeValues(entity) {
    const bulgeArray = [];

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

function convertDXFEntity(entity) {
    console.log('Обработка entity:', entity.type, entity);
    
    switch (entity.type) {
        case 'LINE':
            let startX, startY, endX, endY;
            
            if (entity.start && entity.end) {
                startX = entity.start.x ?? entity.start[0] ?? 0;
                startY = entity.start.y ?? entity.start[1] ?? 0;
                endX = entity.end.x ?? entity.end[0] ?? 0;
                endY = entity.end.y ?? entity.end[1] ?? 0;
            } else if (entity.vertices && entity.vertices.length === 2) {
                const v1 = entity.vertices[0];
                const v2 = entity.vertices[1];
                startX = v1.x ?? v1[0] ?? 0;
                startY = v1.y ?? v1[1] ?? 0;
                endX = v2.x ?? v2[0] ?? 0;
                endY = v2.y ?? v2[1] ?? 0;
            } else {
                console.log('LINE без координат, пропущено');
                break;
            }
            
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
            }
            break;

        case 'LWPOLYLINE':
            if (!entity.vertices || entity.vertices.length === 0) break;

            const normalizedVertices = entity.vertices.map(v => {
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

            if (normalizedVertices.length < 2) break;

            const bulgeArray = extractBulgeValues(entity);
            const hasArcs = bulgeArray.some((b, i) => i < normalizedVertices.length && Math.abs(b) > 0.001);

            if (!hasArcs && normalizedVertices.length === 4 && isRectangle(normalizedVertices)) {
                const rect = createRectFromVertices(normalizedVertices);
                importedObjects.push(rect);
            } else {
                for (let i = 0; i < normalizedVertices.length; i++) {
                    const v1 = normalizedVertices[i];
                    const v2 = normalizedVertices[(i + 1) % normalizedVertices.length];
                    let bulge = bulgeArray[i] || 0;

                    if (Math.abs(bulge) < 0.001) {
                        const line = new Line(v1.x, v1.y, v2.x, v2.y);
                        importedObjects.push(line);
                    } else {
                        const arcLines = approximateBulgeArc(v1, v2, bulge);
                        importedObjects.push(...arcLines);
                    }
                }
            }
            break;

        case 'POLYLINE':
            if (entity.vertices && entity.vertices.length > 0) {
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
            if (entity.center && entity.center.x !== undefined && entity.center.y !== undefined &&
                entity.radius && entity.radius > 0) {
                
                const arcLines = approximateArc(entity);
                importedObjects.push(...arcLines);
            }
            break;

        case 'ELLIPSE':
            if (entity.center && entity.majorAxisEndPoint && entity.axisRatio) {
                const ellipseLines = approximateEllipse(entity);
                importedObjects.push(...ellipseLines);
            }
            break;

        case 'SPLINE':
            if (entity.fitPoints && entity.fitPoints.length > 0) {
                const splineLines = approximateSpline(entity.fitPoints);
                importedObjects.push(...splineLines);
            } else if (entity.controlPoints && entity.controlPoints.length > 0) {
                const splineLines = approximateSpline(entity.controlPoints);
                importedObjects.push(...splineLines);
            }
            break;

        default:
            console.log('Пропущена entity:', entity.type);
    }
}

function isRectangle(vertices) {
    if (vertices.length !== 4) return false;
    
    for (let i = 0; i < 4; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % 4];
        const v3 = vertices[(i + 2) % 4];
        
        const dx1 = v2.x - v1.x;
        const dy1 = v2.y - v1.y;
        const dx2 = v3.x - v2.x;
        const dy2 = v3.y - v2.y;
        
        const dot = dx1 * dx2 + dy1 * dy2;
        if (Math.abs(dot) > 0.1) return false;
    }
    
    return true;
}

function createRectFromVertices(vertices) {
    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    return new Rect(minX, minY, maxX - minX, maxY - minY);
}

// ═══════════════════════════════════════════════════════════════
// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ ARC (с конвертацией градусов в радианы)
// ═══════════════════════════════════════════════════════════════

let arcDebugCounter = 1;

function approximateArc(arc) {
    const lines = [];
    
    // Извлекаем данные
    let centerX, centerY;
    let radius = arc.radius;
    let startAngle = arc.startAngle;
    let endAngle = arc.endAngle;
    let angleLength = arc.angleLength;
    
    if (arc.center) {
        centerX = arc.center.x ?? arc.center[0];
        centerY = arc.center.y ?? arc.center[1];
    }
    
    if (!radius || centerX === undefined || centerY === undefined) {
        return lines;
    }
    
    // Устанавливаем углы
    if (startAngle === undefined) startAngle = 0;
    if (endAngle === undefined && angleLength !== undefined) {
        endAngle = startAngle + angleLength;
    }
    if (angleLength === undefined && endAngle !== undefined) {
        angleLength = endAngle - startAngle;
    }
    if (angleLength === undefined) {
        angleLength = Math.PI * 2;
        endAngle = startAngle + angleLength;
    }
    
    // Определяем направление дуги
    const isClockwise = angleLength < 0;
    
    // Нормализуем начальный угол в диапазон [0, 2π)
    const twoPi = Math.PI * 2;
    let normalizedStart = startAngle;
    while (normalizedStart < 0) normalizedStart += twoPi;
    while (normalizedStart >= twoPi) normalizedStart -= twoPi;
    
    // Вычисляем угол дуги в положительном направлении
    let sweepAngle;
    if (isClockwise) {
        // Для CW дуги: берем положительный угол, но потом инвертируем направление
        sweepAngle = -angleLength;
    } else {
        sweepAngle = angleLength;
    }
    
    // Нормализуем sweepAngle
    while (sweepAngle > twoPi) sweepAngle -= twoPi;
    while (sweepAngle < 0) sweepAngle += twoPi;
    
    // Для CW дуг инвертируем направление при отрисовке
    // (компенсация инверсии Y)
    let finalStartAngle, finalSweepAngle;
    
    if (isClockwise) {
        // CW дуга: при инверсии Y должна стать CCW
        // Для этого меняем начальный угол и направление
        finalStartAngle = normalizedStart;
        finalSweepAngle = sweepAngle; // Отрисовываем как CCW
    } else {
        // CCW дуга: оставляем как есть
        finalStartAngle = normalizedStart;
        finalSweepAngle = sweepAngle;
    }
    
    // Количество сегментов
    const segments = Math.max(8, Math.min(100, Math.ceil(finalSweepAngle / (Math.PI / 18))));
    const angleStep = finalSweepAngle / segments;
    
    let prevX = centerX + Math.cos(finalStartAngle) * radius;
    let prevY = centerY + Math.sin(finalStartAngle) * radius;
    
    for (let i = 1; i <= segments; i++) {
        const angle = finalStartAngle + i * angleStep;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        if (isFinite(x) && isFinite(y) && isFinite(prevX) && isFinite(prevY)) {
            lines.push(new Line(prevX, prevY, x, y));
        }
        prevX = x;
        prevY = y;
    }
    
    // Отладочный вывод
    console.log(`Дуга: центр(${centerX.toFixed(2)}, ${centerY.toFixed(2)}), ` +
                `углы ${(normalizedStart*180/Math.PI).toFixed(0)}° → ${((normalizedStart+finalSweepAngle)*180/Math.PI).toFixed(0)}°, ` +
                `исходное направление=${isClockwise ? 'CW' : 'CCW'}, ` +
                `фактическое направление=${finalSweepAngle > 0 ? 'CCW' : 'CW'}, ` +
                `линий=${lines.length}`);
    
    return lines;
}

function approximateBulgeArc(v1, v2, bulge) {
    const lines = [];
    
    if (!v1 || !v2 || v1.x === undefined || v1.y === undefined || 
        v2.x === undefined || v2.y === undefined) {
        return lines;
    }
    
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    if (chordLength < 0.001) {
        lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
        return lines;
    }
    
    try {
        if (Math.abs(bulge) < 0.001) {
            lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
            return lines;
        }
        
        // Для bulge близкого к 1 (полукруг) используем специальную обработку
        const isNearHalfCircle = Math.abs(Math.abs(bulge) - 1) < 0.001;
        
        // НЕ ИНВЕРТИРУЕМ bulge для этого файла
        // Проблема в том, что bulge уже имеет правильное направление
        let correctedBulge;
        
        if (isNearHalfCircle) {
            // Для полукругов оставляем bulge как есть
            correctedBulge = bulge;
        } else {
            // Для остальных инвертируем
            correctedBulge = -bulge;
        }
        
        const sweepAngle = 4 * Math.atan(Math.abs(correctedBulge));
        const radius = chordLength / (2 * Math.sin(sweepAngle / 2));
        
        if (!isFinite(radius) || radius < 0.001) {
            lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
            return lines;
        }
        
        const midX = (v1.x + v2.x) / 2;
        const midY = (v1.y + v2.y) / 2;
        const perpX = -dy / chordLength;
        const perpY = dx / chordLength;
        const distanceToCenter = Math.sqrt(radius * radius - (chordLength * chordLength) / 4);
        const direction = correctedBulge > 0 ? 1 : -1;
        
        const centerX = midX + direction * perpX * distanceToCenter;
        const centerY = midY + direction * perpY * distanceToCenter;
        
        let startAngle = Math.atan2(v1.y - centerY, v1.x - centerX);
        let endAngle = Math.atan2(v2.y - centerY, v2.x - centerX);
        
        let angleDiff = endAngle - startAngle;
        if (correctedBulge > 0) {
            if (angleDiff < 0) angleDiff += 2 * Math.PI;
        } else {
            if (angleDiff > 0) angleDiff -= 2 * Math.PI;
        }
        
        const segments = Math.max(8, Math.min(50, Math.ceil(Math.abs(angleDiff) / (Math.PI / 36))));
        const angleStep = angleDiff / segments;
        
        let prevX = v1.x;
        let prevY = v1.y;
        
        for (let i = 1; i <= segments; i++) {
            const angle = startAngle + i * angleStep;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            if (isFinite(x) && isFinite(y) && isFinite(prevX) && isFinite(prevY)) {
                lines.push(new Line(prevX, prevY, x, y));
            }
            prevX = x;
            prevY = y;
        }
        
    } catch (err) {
        console.error('Ошибка в approximateBulgeArc:', err);
        lines.push(new Line(v1.x, v1.y, v2.x, v2.y));
    }
    
    return lines.length > 0 ? lines : [new Line(v1.x, v1.y, v2.x, v2.y)];
}

function approximateEllipse(ellipse) {
    const lines = [];
    const segments = 36;
    
    const a = Math.sqrt(ellipse.majorAxisEndPoint.x * ellipse.majorAxisEndPoint.x + 
                        ellipse.majorAxisEndPoint.y * ellipse.majorAxisEndPoint.y);
    const b = a * ellipse.axisRatio;
    const rotation = Math.atan2(ellipse.majorAxisEndPoint.y, ellipse.majorAxisEndPoint.x);
    
    for (let i = 0; i <= segments; i++) {
        const angle = (2 * Math.PI * i) / segments;
        const nextAngle = (2 * Math.PI * (i + 1)) / segments;
        
        const x1 = ellipse.center.x + (a * Math.cos(angle) * Math.cos(rotation) - b * Math.sin(angle) * Math.sin(rotation));
        const y1 = ellipse.center.y + (a * Math.cos(angle) * Math.sin(rotation) + b * Math.sin(angle) * Math.cos(rotation));
        const x2 = ellipse.center.x + (a * Math.cos(nextAngle) * Math.cos(rotation) - b * Math.sin(nextAngle) * Math.sin(rotation));
        const y2 = ellipse.center.y + (a * Math.cos(nextAngle) * Math.sin(rotation) + b * Math.sin(nextAngle) * Math.cos(rotation));
        
        lines.push(new Line(x1, y1, x2, y2));
    }
    
    return lines;
}

function approximateSpline(points) {
    const lines = [];
    
    if (points.length < 2) return lines;

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

    const segmentsPerSpan = 10;
    
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        if (p1.x === undefined || p1.y === undefined || p2.x === undefined || p2.y === undefined) {
            continue;
        }

        const prev = i > 0 ? points[i - 1] : p1;
        const next = i < points.length - 2 ? points[i + 2] : p2;

        const t1x = (p2.x - prev.x) / 2;
        const t1y = (p2.y - prev.y) / 2;
        const t2x = (next.x - p1.x) / 2;
        const t2y = (next.y - p1.y) / 2;

        const cp1x = p1.x + t1x / 3;
        const cp1y = p1.y + t1y / 3;
        const cp2x = p2.x - t2x / 3;
        const cp2y = p2.y - t2y / 3;

        let prevX = p1.x;
        let prevY = p1.y;

        for (let j = 1; j <= segmentsPerSpan; j++) {
            const t = j / segmentsPerSpan;
            const t2 = t * t;
            const t3 = t2 * t;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;

            const x = mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y;

            lines.push(new Line(prevX, prevY, x, y));
            prevX = x;
            prevY = y;
        }
    }

    return lines;
}

function calculateBounds(objects) {
    console.log('=== ВЫЧИСЛЕНИЕ ГРАНИЦ ===');
    console.log('Объектов для вычисления границ:', objects.length);
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let objectsWithPoints = 0;
    
    objects.forEach(obj => {
        if (obj.type === 'line') {
            objectsWithPoints++;
            minX = Math.min(minX, obj.x1, obj.x2);
            maxX = Math.max(maxX, obj.x1, obj.x2);
            minY = Math.min(minY, obj.y1, obj.y2);
            maxY = Math.max(maxY, obj.y1, obj.y2);
        } else if (obj.type === 'circle') {
            objectsWithPoints++;
            minX = Math.min(minX, obj.cx - obj.radius);
            maxX = Math.max(maxX, obj.cx + obj.radius);
            minY = Math.min(minY, obj.cy - obj.radius);
            maxY = Math.max(maxY, obj.cy + obj.radius);
        } else if (obj.type === 'rect') {
            objectsWithPoints++;
            minX = Math.min(minX, obj.x);
            maxX = Math.max(maxX, obj.x + obj.width);
            minY = Math.min(minY, obj.y);
            maxY = Math.max(maxY, obj.y + obj.height);
        }
    });
    
    console.log(`Объектов с координатами: ${objectsWithPoints}`);
    console.log(`Границы: minX=${minX}, minY=${minY}, maxX=${maxX}, maxY=${maxY}`);
    console.log(`Ширина=${maxX - minX}, Высота=${maxY - minY}`);
    
    return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

function drawImportPreview(svgElement) {
    if (!svgElement) return;
    
    svgElement.innerHTML = '';
    
    if (importedObjects.length === 0) {
        console.log('Нет объектов для отрисовки');
        return;
    }
    
    console.log('=== ОТРИСОВКА PREVIEW ===');
    console.log('Объектов для отрисовки:', importedObjects.length);
    
    const bounds = calculateBounds(importedObjects);
    console.log('Границы для отрисовки:', bounds);
    
    const padding = 20;
    const svgWidth = parseFloat(svgElement.getAttribute('width')) || 600;
    const svgHeight = parseFloat(svgElement.getAttribute('height')) || 400;
    
    const scaleX = (svgWidth - 2 * padding) / bounds.width;
    const scaleY = (svgHeight - 2 * padding) / bounds.height;
    const scale = Math.min(scaleX, scaleY, 1);
    
    const offsetX = (svgWidth - bounds.width * scale) / 2 - bounds.minX * scale + padding;
    const offsetY = (svgHeight - bounds.height * scale) / 2 - bounds.minY * scale + padding;
    
    console.log(`Масштаб: ${scale}, offsetX: ${offsetX}, offsetY: ${offsetY}`);
    
    let drawnLines = 0;
    
    importedObjects.forEach(obj => {
        if (obj.type === 'line') {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            const x1 = obj.x1 * scale + offsetX;
            const y1 = obj.y1 * scale + offsetY;
            const x2 = obj.x2 * scale + offsetX;
            const y2 = obj.y2 * scale + offsetY;
            
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', '#007acc');
            line.setAttribute('stroke-width', '1.5');
            svgElement.appendChild(line);
            drawnLines++;
        }
    });
    
    console.log(`Отрисовано линий: ${drawnLines}`);
    console.log(`Всего элементов в SVG: ${svgElement.children.length}`);
}
function createPartFromImport(quantity, name) {
    if (importedObjects.length === 0) {
        alert('⚠️ Нет импортированных объектов');
        return null;
    }

    const bounds = calculateBounds(importedObjects);
    
    const offsetX = -bounds.minX;
    const offsetY = -bounds.minY;

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

    const normalizedBounds = calculateBounds(copyObjects);

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
        visible: false,
        rotationMode: 'auto',
        spacing: 3
    };

    if (typeof parts !== 'undefined') {
        parts.push(part);
        if (typeof updatePartsList === 'function') updatePartsList();
        if (typeof saveToCache === 'function') saveToCache();
    }

    console.log('✅ Импортирована деталь:', part);
    return part;
}

function resetImport() {
    importedObjects = [];
    dxfBounds = {};
    dxfFileName = '';
}