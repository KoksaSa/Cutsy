// i: SilikinK Project
// ═══════════════════════════════════════════════════════════════
// ФУНКЦИИ ОТРИСОВКИ (RENDER)
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// v4.60: Объявляем ПЕРЕД использованием (let не поднимается как var)
var _circleDistOverlay = null;

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА КОНТУРА ОСТАТКА (вспомогательная функция)
// ═══════════════════════════════════════════════════════════════

function drawContourObjects(ctx, contourObjects) {
    for (const obj of contourObjects) {
        ctx.beginPath();

        if (obj.type === 'line') {
            ctx.moveTo(obj.x1, obj.y1);
            ctx.lineTo(obj.x2, obj.y2);
            ctx.stroke();
        } else if (obj.type === 'arc') {
            // Дуга: рисуем через ctx.arc()
            // Canvas Y-down: direction='CW' → ccw=true (убывание угла на экране)
            const ccw = obj.direction === 'CW';
            ctx.arc(obj.cx, obj.cy, obj.radius, obj.startAngle, obj.endAngle, ccw);
            ctx.stroke();
        } else if (obj.type === 'circle') {
            ctx.arc(obj.cx, obj.cy, obj.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else if (obj.type === 'rect') {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
                } else if (obj.type === 'polygon') {
                    const vertices = (typeof obj.getVertices === 'function') ? obj.getVertices() : [];
            if (vertices.length > 0) {
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let i = 1; i < vertices.length; i++) {
                    ctx.lineTo(vertices[i].x, vertices[i].y);
                }
                ctx.closePath();
                ctx.stroke();
            }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
            if (pts.length >= 2) {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i].x, pts[i].y);
                }
                if (obj.closed) {
                    ctx.closePath();
                }
                ctx.stroke();
            }
        } else if (obj.type === 'spline') {
            // v4.57: Сплайн — рисуем через fitPoints (на кривой)
            const spts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
                .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
            if (spts.length >= 2) {
                ctx.moveTo(spts[0].x, spts[0].y);
                for (let si = 1; si < spts.length; si++) {
                    ctx.lineTo(spts[si].x, spts[si].y);
                }
                if (obj.closed || obj.isClosed ||
                    (Math.abs(spts[0].x - spts[spts.length-1].x) < 0.01 &&
                     Math.abs(spts[0].y - spts[spts.length-1].y) < 0.01)) {
                    ctx.closePath();
                }
                ctx.stroke();
            }
        } else if (obj.type === 'ellipse') {
            // v4.57: Отрисовка эллипса
            const cx = obj.cx || 0, cy = obj.cy || 0;
            const rx = Math.abs(obj.rx || 0), ry = Math.abs(obj.ry || 0);
            if (rx > 0 && ry > 0) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(rx, ry);
                ctx.arc(0, 0, 1, 0, Math.PI * 2);
                ctx.restore();
                ctx.stroke();
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА СЕТКИ
// ═══════════════════════════════════════════════════════════════

function drawGrid() {
    // ═══════════════════════════════════════════════════════════
    // Не рисуем если сетка выключена
    // ═══════════════════════════════════════════════════════════
    if (!window.showGrid) {
        return;
    }

    // ═══════════════════════════════════════════════════════════
    // ОПТИМИЗАЦИЯ: Не рисуем сетку при очень маленьком зуме
    // ═══════════════════════════════════════════════════════════
    if (zoom < 0.2) {
        return; // Сетка слишком мелкая, не рисуем
    }

    // ═══════════════════════════════════════════════════════════
    // СЕТКА С ШАГОМ 50 ММ (линии + подписи)
    // ═══════════════════════════════════════════════════════════
    const gridSize = 50;

    // Вычисляем видимую область в мировых координатах
    const viewWidth = canvas.width / zoom;
    const viewHeight = canvas.height / zoom;

    // ═══════════════════════════════════════════════════════════
    // ОПТИМИЗАЦИЯ: Ограничиваем количество линий (макс. 500)
    // ═══════════════════════════════════════════════════════════
    const maxGridLines = 500;
    const viewGridWidth = viewWidth / gridSize;
    const viewGridHeight = viewHeight / gridSize;
    const totalGridLines = viewGridWidth * viewGridHeight;

    // Если слишком много линий - увеличиваем шаг
    let actualGridSize = gridSize;
    if (totalGridLines > maxGridLines) {
        actualGridSize = gridSize * Math.ceil(Math.sqrt(totalGridLines / maxGridLines));
    }

    // ═══════════════════════════════════════════════════════════
    // РИСУЕМ ЛИНИИ СЕТКИ (батчинг для производительности)
    // ═══════════════════════════════════════════════════════════
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1 / zoom;

    // Вертикальные линии - рисуем все за один beginPath
    ctx.beginPath();
    for (let x = Math.floor(-viewWidth / actualGridSize) * actualGridSize; x <= viewWidth; x += actualGridSize) {
        // Пропускаем если это ось (она рисуется отдельно)
        if (Math.abs(x) < 1) continue;

        ctx.moveTo(x, -viewHeight);
        ctx.lineTo(x, viewHeight);
    }
    ctx.stroke();

    // Горизонтальные линии - рисуем все за один beginPath
    ctx.beginPath();
    for (let y = Math.floor(-viewHeight / actualGridSize) * actualGridSize; y <= viewHeight; y += actualGridSize) {
        // Пропускаем если это ось (она рисуется отдельно)
        if (Math.abs(y) < 1) continue;

        ctx.moveTo(-viewWidth, y);
        ctx.lineTo(viewWidth, y);
    }
    ctx.stroke();

    // ═══════════════════════════════════════════════════════════
    // ЧИСЛОВЫЕ ПОДПИСИ НА РАЗМЕТКЕ (каждые 50 мм)
    // ═══════════════════════════════════════════════════════════
    // Рисуем подписи только если масштаб достаточно большой
    if (zoom >= 0.5 && zoom <= 12.0) {
        const fontSize = Math.max(9, Math.min(14, 11 / zoom));
        ctx.font = `${fontSize}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Подписи по оси X (вдоль оси X)
        ctx.fillStyle = '#888';
        for (let x = Math.floor(-viewWidth / actualGridSize) * actualGridSize; x <= viewWidth; x += actualGridSize) {
            if (Math.abs(x) < 1) continue; // Пропускаем 0

            // Рисуем числовую подпись
            ctx.fillText(
                x.toString(),
                x,
                -8 / zoom
            );
        }

        // Подписи по оси Y (вдоль оси Y)
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let y = Math.floor(-viewHeight / actualGridSize) * actualGridSize; y <= viewHeight; y += actualGridSize) {
            if (Math.abs(y) < 1) continue; // Пропускаем 0

            ctx.fillText(
                y.toString(),
                8 / zoom,
                y
            );
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА ОСЕЙ
// ═══════════════════════════════════════════════════════════════

function drawAxes() {
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2 / zoom;

    // Ось X
    ctx.beginPath();
    ctx.moveTo(-canvas.width / zoom, 0);
    ctx.lineTo(canvas.width / zoom, 0);
    ctx.stroke();

    // Ось Y
    ctx.beginPath();
    ctx.moveTo(0, -canvas.height / zoom);
    ctx.lineTo(0, canvas.height / zoom);
    ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════
// ОТРИСОВКА ЛИСТА С РАСКЛАДКОЙ
// ═══════════════════════════════════════════════════════════════
// drawSheet() - рисует миниатюру листа с размещёнными деталями
// Вызывается из render() когда showSheetView = true

function drawSheet() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Сбрасываем трансформации

    // ═══════════════════════════════════════════════════════════
    // РАМКА ЛИСТА (для стандартных листов - прямоугольник)
    // ═══════════════════════════════════════════════════════════
    const margin = 50;
    const baseSheetW = Math.min(sheetSize.width / 3, 400);
    const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
    const sheetW = baseSheetW * sheetZoom;
    const sheetH = baseSheetH * sheetZoom;
    const sheetX = canvas.width - sheetW - margin + sheetPanX;
    const sheetY = margin + sheetPanY;

    // Проверяем, это остаток листа с контуром?
    const isRemnant = useRemnant && sheetRemnant && sheetRemnant.outerContour && sheetRemnant.outerContour.length > 0;

    if (isRemnant) {
        // Для остатка: рисуем реальный контур вместо прямоугольника
        const scaleX = sheetW / sheetSize.width;
        const scaleY = sheetH / sheetSize.height;

        // Смещение контура: сдвигаем так, чтобы minX/minY были в левом верхнем углу рамки
        const bounds = sheetRemnant.bounds;
        const offsetX = sheetX - bounds.minX * scaleX;
        const offsetY = sheetY - bounds.minY * scaleY;

        // Внешний контур - синяя рамка
        ctx.save();
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        // Рисуем все объекты внешнего контура
        for (const obj of sheetRemnant.outerContour) {
            ctx.beginPath();
            if (obj.type === 'line') {
                ctx.moveTo(offsetX + obj.x1 * scaleX, offsetY + obj.y1 * scaleY);
                ctx.lineTo(offsetX + obj.x2 * scaleX, offsetY + obj.y2 * scaleY);
            } else if (obj.type === 'arc') {
                const ccw = obj.direction === 'CW';
                ctx.ellipse(offsetX + obj.cx * scaleX, offsetY + obj.cy * scaleY, obj.radius * scaleX, obj.radius * scaleY, 0, obj.startAngle, obj.endAngle, ccw);
            } else if (obj.type === 'circle') {
                ctx.ellipse(offsetX + obj.cx * scaleX, offsetY + obj.cy * scaleY, obj.radius * scaleX, obj.radius * scaleY, 0, 0, Math.PI * 2);
            } else if (obj.type === 'rect') {
                ctx.rect(offsetX + obj.x * scaleX, offsetY + obj.y * scaleY, obj.width * scaleX, obj.height * scaleY);
            } else if (obj.type === 'polygon') {
                const vertices = obj.getVertices ? obj.getVertices() : [];
                if (vertices.length > 0) {
                    ctx.moveTo(offsetX + vertices[0].x * scaleX, offsetY + vertices[0].y * scaleY);
                    for (let i = 1; i < vertices.length; i++) {
                        ctx.lineTo(offsetX + vertices[i].x * scaleX, offsetY + vertices[i].y * scaleY);
                    }
                    ctx.closePath();
                }
            } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                const pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                if (pts.length >= 2) {
                    ctx.moveTo(offsetX + pts[0].x * scaleX, offsetY + pts[0].y * scaleY);
                    for (let i = 1; i < pts.length; i++) {
                        ctx.lineTo(offsetX + pts[i].x * scaleX, offsetY + pts[i].y * scaleY);
                    }
                    if (obj.closed) {
                        ctx.closePath();
                    }
                }
            } else if (obj.type === 'spline') {
                // v4.57: Сплайн — рисуем через fitPoints
                const spts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
                    .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                if (spts.length >= 2) {
                    ctx.moveTo(offsetX + spts[0].x * scaleX, offsetY + spts[0].y * scaleY);
                    for (let si = 1; si < spts.length; si++) {
                        ctx.lineTo(offsetX + spts[si].x * scaleX, offsetY + spts[si].y * scaleY);
                    }
                    if (obj.closed || obj.isClosed) ctx.closePath();
                }
            }
            ctx.stroke();
        }

        // Отверстия - синий пунктир (тот же цвет что и рамка)
        if (sheetRemnant.innerContours && sheetRemnant.innerContours.length > 0) {
            ctx.strokeStyle = '#007acc';
            ctx.setLineDash([4, 3]);
            for (const holeContour of sheetRemnant.innerContours) {
                for (const obj of holeContour) {
                    ctx.beginPath();
                    if (obj.type === 'line') {
                        ctx.moveTo(offsetX + obj.x1 * scaleX, offsetY + obj.y1 * scaleY);
                        ctx.lineTo(offsetX + obj.x2 * scaleX, offsetY + obj.y2 * scaleY);
                    } else if (obj.type === 'arc') {
                        const ccw = obj.direction === 'CW';
                        ctx.ellipse(offsetX + obj.cx * scaleX, offsetY + obj.cy * scaleY, obj.radius * scaleX, obj.radius * scaleY, 0, obj.startAngle, obj.endAngle, ccw);
                    } else if (obj.type === 'circle') {
                        ctx.ellipse(offsetX + obj.cx * scaleX, offsetY + obj.cy * scaleY, obj.radius * scaleX, obj.radius * scaleY, 0, 0, Math.PI * 2);
                    } else if (obj.type === 'rect') {
                        ctx.rect(offsetX + obj.x * scaleX, offsetY + obj.y * scaleY, obj.width * scaleX, obj.height * scaleY);
                    } else if (obj.type === 'polygon') {
                        const vertices = obj.getVertices ? obj.getVertices() : [];
                        if (vertices.length > 0) {
                            ctx.moveTo(offsetX + vertices[0].x * scaleX, offsetY + vertices[0].y * scaleY);
                            for (let i = 1; i < vertices.length; i++) {
                                ctx.lineTo(offsetX + vertices[i].x * scaleX, offsetY + vertices[i].y * scaleY);
                            }
                            ctx.closePath();
                        }
                    } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                        const pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                        if (pts.length >= 2) {
                            ctx.moveTo(offsetX + pts[0].x * scaleX, offsetY + pts[0].y * scaleY);
                            for (let i = 1; i < pts.length; i++) {
                                ctx.lineTo(offsetX + pts[i].x * scaleX, offsetY + pts[i].y * scaleY);
                            }
                            if (obj.closed) {
                                ctx.closePath();
                            }
                        }
                    } else if (obj.type === 'spline') {
                        // v4.57: Сплайн — рисуем через fitPoints
                        const spts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
                            .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                        if (spts.length >= 2) {
                            ctx.moveTo(offsetX + spts[0].x * scaleX, offsetY + spts[0].y * scaleY);
                            for (let si = 1; si < spts.length; si++) {
                                ctx.lineTo(offsetX + spts[si].x * scaleX, offsetY + spts[si].y * scaleY);
                            }
                            if (obj.closed || obj.isClosed) ctx.closePath();
                        }
                    }
                    ctx.stroke();
                }
            }
        }
        ctx.setLineDash([]);
        ctx.restore();

        // Фон листа - полупрозрачный
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(sheetX, sheetY, sheetW, sheetH);

    } else {
        // Для стандартных листов - обычная прямоугольная рамка
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(sheetX, sheetY, sheetW, sheetH);

        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 2;
        ctx.strokeRect(sheetX, sheetY, sheetW, sheetH);
    }

    // Заголовок
    let sheetLabel;
    if (isRemnant) {
        const size = sheetRemnant.size || { width: 0, height: 0 };
        sheetLabel = t('sheet_info_top_remnant', {
            width: parseFloat(size.width.toFixed(2)),
            height: parseFloat(size.height.toFixed(2)),
            zoom: sheetZoom.toFixed(1)
        });
    } else {
        sheetLabel = t('sheet_info_top', {
            width: sheetSize.width,
            height: sheetSize.height,
            zoom: sheetZoom.toFixed(1)
        });
    }
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(10, 12 * sheetZoom)}px Segoe UI`;
    ctx.textAlign = 'left';
    ctx.fillText(sheetLabel, sheetX, sheetY - 10);

    // Масштабируем координаты для отображения (с учётом sheetZoom)
    const scaleX = sheetW / sheetSize.width;
    const scaleY = sheetH / sheetSize.height;

    // Цвета для деталей на листе — назначаются один раз и сохраняются на part
    const baseColors = ['#00ff00', '#00bfff', '#ff69b4', '#ffd700', '#ff6347', '#9370db', '#3cb371', '#ffa500', '#20b2aa', '#da70d6'];
    const DEFAULT_OBJ_COLORS = new Set(['#00aadd', '#000000']); // Цвета, которые объекты получают при создании — не считаются «пользовательскими»

    // Вспомогательная функция: цвет объекта на листе раскладки
    function getObjectSheetColor(obj, part) {
        // Если у объекта свой цвет (отличающийся от дефолтного) — используем его
        if (obj.color && !DEFAULT_OBJ_COLORS.has(obj.color.toLowerCase())) return obj.color;
        // Если у детали уже назначен цвет по умолчанию — используем его
        if (part.defaultSheetColor) return part.defaultSheetColor;
        // Назначаем новой детали уникальный цвет (ещё не занятый другими деталями)
        const usedColors = new Set(parts.filter(p => p.defaultSheetColor).map(p => p.defaultSheetColor));
        const freeColor = baseColors.find(c => !usedColors.has(c));
        part.defaultSheetColor = freeColor || baseColors[(parts.indexOf(part)) % baseColors.length];
        return part.defaultSheetColor;
    }

    // Рисуем размещённые детали
    nestedParts.forEach((nested, idx) => {
        const part = _partsMap.get(nested.partId);
        if (!part) return;

        // Позиция на листе (рамка уже смещена)
        const drawX = sheetX + nested.x * scaleX;
        const drawY = sheetY + nested.y * scaleY;
        // Для bounding box используем размеры повёрнутой детали
        const w = nested.width * scaleX;
        const h = nested.height * scaleY;

        // part уже найден выше в цикле

        // Рисуем деталь через объекты с поворотом (реальная геометрия)
        // Используем nested.objects если есть (после отражения), иначе part.objects
        const objectsToDraw = nested.objects && nested.objects.length > 0 ? nested.objects : part.objects;

        if (objectsToDraw && objectsToDraw.length > 0) {
            ctx.lineWidth = 1;

            // Получаем угол поворота (в радианах)
            const rotationAngle = nested.angle || 0;

            // Вращение вокруг центра ИСХОДНОГО bounding box
            // v4.40 FIX R2: swap W<->H at 90/270 if no baseWidth
            let bboxWidth = nested.baseWidth || nested.width;
            let bboxHeight = nested.baseHeight || nested.height;
            if (!nested.baseWidth) {
                const _deg = Math.round((rotationAngle * 180 / Math.PI) % 360);
                if (Math.abs(_deg) === 90 || Math.abs(_deg) === 270) { [bboxWidth, bboxHeight] = [bboxHeight, bboxWidth]; }
            }
            const centerX = bboxWidth / 2;
            const centerY = bboxHeight / 2;

            // Функция вращения точки вокруг центра
            const rotatePoint = (px, py, angle, cx, cy) => {
                if (angle === 0) return { x: px, y: py };
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                return {
                    x: cx + (px - cx) * cos - (py - cy) * sin,
                    y: cy + (px - cx) * sin + (py - cy) * cos
                };
            };

            // Используем сохранённый refPoint из nesting.js
            // Если нет (для старых размещений), вычисляем заново
            let refPoint = nested.refPoint;
            if (!refPoint) {
                const bboxHull = [
                    { x: 0, y: 0 },
                    { x: bboxWidth, y: 0 },
                    { x: bboxWidth, y: bboxHeight },
                    { x: 0, y: bboxHeight }
                ];
                const rotatedBboxHull = bboxHull.map(p => rotatePoint(p.x, p.y, rotationAngle, centerX, centerY));
                refPoint = rotatedBboxHull[0];
                for (const p of rotatedBboxHull) {
                    const py = Math.round(p.y * 1000000) / 1000000;
                    const refY = Math.round(refPoint.y * 1000000) / 1000000;
                    const px = Math.round(p.x * 1000000) / 1000000;
                    const refX = Math.round(refPoint.x * 1000000) / 1000000;
                    if (py < refY || (py === refY && px < refX)) {
                        refPoint = p;
                    }
                }
            }

            // Теперь рисуем с нормализацией относительно part.bounds.minX/minY
            const partBbox = part.bounds || { minX: 0, minY: 0 };
            const normOffsetX = partBbox.minX || 0;
            const normOffsetY = partBbox.minY || 0;

            // v4.60: Полупрозрачная заливка детали (перед линиями)
            // v4.60 FIX: Передаём objectsToDraw (nested.objects если есть) —
            // иначе при отражении заливка берёт оригинальную геометрию
            if (typeof drawPartFillOnSheet === 'function') {
                drawPartFillOnSheet(ctx, part, {
                    drawX, drawY, scaleX, scaleY,
                    rotation: rotationAngle,
                    centerX, centerY,
                    normOffsetX, normOffsetY,
                    refPoint
                }, objectsToDraw);
            }

            objectsToDraw.forEach(obj => {
                const objColor = getObjectSheetColor(obj, part);
                ctx.strokeStyle = objColor;
                if (obj.type === 'line') {
                    const p1 = rotatePoint(obj.x1 - normOffsetX, obj.y1 - normOffsetY, rotationAngle, centerX, centerY);
                    const p2 = rotatePoint(obj.x2 - normOffsetX, obj.y2 - normOffsetY, rotationAngle, centerX, centerY);
                    ctx.beginPath();
                    ctx.moveTo(drawX + (p1.x - refPoint.x) * scaleX, drawY + (p1.y - refPoint.y) * scaleY);
                    ctx.lineTo(drawX + (p2.x - refPoint.x) * scaleX, drawY + (p2.y - refPoint.y) * scaleY);
                    ctx.stroke();
                } else if (obj.type === 'arc') {
                    // v4.60: Отрисовка дуги через точки (надёжнее чем ctx.ellipse)
                    // Вычисляем точки вручную если нет getPoints (сериализованные объекты)
                    let pts = [];
                    if (typeof obj.getPoints === 'function') {
                        pts = obj.getPoints(48);
                    } else {
                        // v4.60: Вычисляем точки дуги вручную (как getPoints в dxf-import.js)
                        const r = Math.abs(obj.radius || 0);
                        if (r > 0 && typeof obj.startAngle === 'number' && typeof obj.endAngle === 'number') {
                            let sweep;
                            if (obj.direction === 'CW') {
                                sweep = obj.startAngle - obj.endAngle;
                                if (sweep < 0) sweep += Math.PI * 2;
                            } else {
                                sweep = obj.endAngle - obj.startAngle;
                                if (sweep < 0) sweep += Math.PI * 2;
                            }
                            const segments = Math.max(12, Math.min(72, Math.ceil(sweep / (Math.PI / 36))));
                            const step = sweep / segments;
                            const dir = obj.direction === 'CW' ? -1 : 1;
                            for (let i = 0; i <= segments; i++) {
                                const angle = obj.startAngle + dir * step * i;
                                pts.push({
                                    x: obj.cx + Math.cos(angle) * r,
                                    y: obj.cy + Math.sin(angle) * r
                                });
                            }
                        }
                    }
                    if (pts.length >= 2) {
                        ctx.beginPath();
                        const p0 = rotatePoint(pts[0].x - normOffsetX, pts[0].y - normOffsetY, rotationAngle, centerX, centerY);
                        ctx.moveTo(drawX + (p0.x - refPoint.x) * scaleX, drawY + (p0.y - refPoint.y) * scaleY);
                        for (let i = 1; i < pts.length; i++) {
                            const pi = rotatePoint(pts[i].x - normOffsetX, pts[i].y - normOffsetY, rotationAngle, centerX, centerY);
                            ctx.lineTo(drawX + (pi.x - refPoint.x) * scaleX, drawY + (pi.y - refPoint.y) * scaleY);
                        }
                        ctx.stroke();
                    }
                } else if (obj.type === 'rect') {
                    const corners = [
                        { x: obj.x - normOffsetX, y: obj.y - normOffsetY },
                        { x: obj.x + obj.width - normOffsetX, y: obj.y - normOffsetY },
                        { x: obj.x + obj.width - normOffsetX, y: obj.y + obj.height - normOffsetY },
                        { x: obj.x - normOffsetX, y: obj.y + obj.height - normOffsetY }
                    ];
                    const rotatedCorners = corners.map(c => rotatePoint(c.x, c.y, rotationAngle, centerX, centerY));
                    ctx.beginPath();
                    ctx.moveTo(drawX + (rotatedCorners[0].x - refPoint.x) * scaleX, drawY + (rotatedCorners[0].y - refPoint.y) * scaleY);
                    for (let i = 1; i < rotatedCorners.length; i++) {
                        ctx.lineTo(drawX + (rotatedCorners[i].x - refPoint.x) * scaleX, drawY + (rotatedCorners[i].y - refPoint.y) * scaleY);
                    }
                    ctx.closePath();
                    ctx.stroke();
                } else if (obj.type === 'circle') {
                    const rotatedCenter = rotatePoint(obj.cx - normOffsetX, obj.cy - normOffsetY, rotationAngle, centerX, centerY);
                    ctx.beginPath();
                    ctx.ellipse(
                        drawX + (rotatedCenter.x - refPoint.x) * scaleX,
                        drawY + (rotatedCenter.y - refPoint.y) * scaleY,
                        obj.radius * scaleX,
                        obj.radius * scaleY,
                        0,
                        0, 2 * Math.PI
                    );
                    ctx.stroke();
                } else if (obj.type === 'polygon') {
                    const vertices = obj.getVertices ? obj.getVertices() : [];
                    if (vertices.length > 0) {
                        const rotatedVertices = vertices.map(v => rotatePoint(v.x - normOffsetX, v.y - normOffsetY, rotationAngle, centerX, centerY));
                        ctx.beginPath();
                        ctx.moveTo(drawX + (rotatedVertices[0].x - refPoint.x) * scaleX, drawY + (rotatedVertices[0].y - refPoint.y) * scaleY);
                        for (let i = 1; i < rotatedVertices.length; i++) {
                            ctx.lineTo(drawX + (rotatedVertices[i].x - refPoint.x) * scaleX, drawY + (rotatedVertices[i].y - refPoint.y) * scaleY);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    }
                } else if (obj.type === 'text') {
                    const rotatedText = rotatePoint((obj.x || centerX) - normOffsetX, (obj.y || centerY) - normOffsetY, rotationAngle, centerX, centerY);
                    ctx.save();
                    ctx.translate(drawX + (rotatedText.x - refPoint.x) * scaleX, drawY + (rotatedText.y - refPoint.y) * scaleY);
                    ctx.rotate(rotationAngle);
                    ctx.fillStyle = objColor;
                    ctx.font = `${(obj.fontSize || 14) * scaleX}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(obj.text || '', 0, 0);
                    ctx.restore();
                } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                    const pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                    if (pts.length >= 2) {
                        const rotatedPts = pts.map(p => rotatePoint(p.x - normOffsetX, p.y - normOffsetY, rotationAngle, centerX, centerY));
                        ctx.beginPath();
                        ctx.moveTo(drawX + (rotatedPts[0].x - refPoint.x) * scaleX, drawY + (rotatedPts[0].y - refPoint.y) * scaleY);
                        for (let i = 1; i < rotatedPts.length; i++) {
                            ctx.lineTo(drawX + (rotatedPts[i].x - refPoint.x) * scaleX, drawY + (rotatedPts[i].y - refPoint.y) * scaleY);
                        }
                        if (obj.closed) {
                            ctx.closePath();
                        }
                        ctx.stroke();
                    }
                } else if (obj.type === 'spline') {
                    // v4.57: Сплайн — рисуем через fitPoints
                    const spts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
                        .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                    if (spts.length >= 2) {
                        const rotatedSpts = spts.map(p => rotatePoint(p.x - normOffsetX, p.y - normOffsetY, rotationAngle, centerX, centerY));
                        ctx.beginPath();
                        ctx.moveTo(drawX + (rotatedSpts[0].x - refPoint.x) * scaleX, drawY + (rotatedSpts[0].y - refPoint.y) * scaleY);
                        for (let si = 1; si < rotatedSpts.length; si++) {
                            ctx.lineTo(drawX + (rotatedSpts[si].x - refPoint.x) * scaleX, drawY + (rotatedSpts[si].y - refPoint.y) * scaleY);
                        }
                        if (obj.closed || obj.isClosed) ctx.closePath();
                        ctx.stroke();
                    }
                }
            });

            // Номер детали вдоль длинной стороны bounding box
            const centerXBox = drawX + w / 2;
            const centerYBox = drawY + h / 2;
            const partName = part?.name || `#${nested.partId}`;
            // Цвет подписи — fallback-цвет детали
            const labelColor = part.defaultSheetColor || baseColors[0];
            
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = labelColor;
            
            // Определяем длинную сторону
            if (w >= h) {
                // Ширина больше или равна высоте - текст горизонтально
                ctx.fillText(partName, centerXBox, centerYBox);
            } else {
                // Высота больше - текст вертикально (поворот на 90°)
                ctx.save();
                ctx.translate(centerXBox, centerYBox);
                ctx.rotate(Math.PI / 2);
                ctx.fillText(partName, 0, 0);
                ctx.restore();
            }
        } else {
            // Если нет объектов - рисуем bounding box
            const fallbackColor = part.defaultSheetColor || baseColors[0];
            ctx.strokeStyle = fallbackColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX, drawY, w, h);

            // Номер детали вдоль длинной стороны bounding box
            const centerXBox = drawX + w / 2;
            const centerYBox = drawY + h / 2;
            const partName = part?.name || `#${nested.partId}`;
            
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = fallbackColor;
            
            // Определяем длинную сторону
            if (w >= h) {
                // Ширина больше или равна высоте - текст горизонтально
                ctx.fillText(partName, centerXBox, centerYBox);
            } else {
                // Высота больше - текст вертикально (поворот на 90°)
                ctx.save();
                ctx.translate(centerXBox, centerYBox);
                ctx.rotate(Math.PI / 2);
                ctx.fillText(partName, 0, 0);
                ctx.restore();
            }
        }

        // Выделение выбранных деталей
        if (selectedNestedParts.includes(idx)) {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX - 2, drawY - 2, w + 4, h + 4);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // ОТОБРАЖЕНИЕ СВОБОДНОГО МЕСТА (ОСТАТКА) НА ЛИСТЕ
    // ═══════════════════════════════════════════════════════════
    if (nestedParts.length > 0) {
        // ═══════════════════════════════════════════════════════════
        // ОТРИСОВКА ОСТАТКА ЛИСТА (ТОЧНЫЙ РАСЧЁТ ПО 4 СТОРОНАМ)
        // ═══════════════════════════════════════════════════════════

        // Находим крайние точки всех размещённых деталей
        let minX = Infinity, minY = Infinity;
        let maxX = 0, maxY = 0;
        
        nestedParts.forEach(nested => {
            const rightEdge = nested.x + nested.width;
            const bottomEdge = nested.y + nested.height;
            if (nested.x < minX) minX = nested.x;
            if (nested.y < minY) minY = nested.y;
            if (rightEdge > maxX) maxX = rightEdge;
            if (bottomEdge > maxY) maxY = bottomEdge;
        });

        // Вычисляем остатки по всем 4 сторонам
        const remainingLeft = minX;           // Слева от первой детали
        const remainingTop = minY;            // Сверху от первой детали
        const remainingRight = sheetSize.width - maxX;   // Справа от последней детали
        const remainingBottom = sheetSize.height - maxY; // Снизу от последней детали

        // Экраные координаты
        const sheetRightX = sheetX + sheetW;
        const sheetBottomY = sheetY + sheetH;
        const leftX = sheetX + minX * scaleX;
        const topY = sheetY + minY * scaleY;
        const rightX = sheetX + maxX * scaleX;
        const bottomY = sheetY + maxY * scaleY;

        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.fillStyle = '#FFA500';
        ctx.font = 'bold 11px Segoe UI';

        // ═══════════════════════════════════════════════════════════
        // ОСТАТОК СЛЕВА (вертикальная линия)
        // ═══════════════════════════════════════════════════════════
        if (remainingLeft > 50) {
            ctx.beginPath();
            ctx.moveTo(leftX, sheetY);
            ctx.lineTo(leftX, sheetBottomY);
            ctx.stroke();

            // Текст размера (горизонтально, внутри остатка)
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((remainingLeft || 0).toFixed(2) + ' мм', (sheetX + leftX) / 2, (sheetY + sheetBottomY) / 2);
        }

        // ═══════════════════════════════════════════════════════════
        // ОСТАТОК СВЕРХУ (горизонтальная линия)
        // ═══════════════════════════════════════════════════════════
        if (remainingTop > 50) {
            ctx.beginPath();
            ctx.moveTo(sheetX, topY);
            ctx.lineTo(sheetRightX, topY);
            ctx.stroke();

            // Текст размера (вертикально, внутри остатка)
            ctx.save();
            ctx.translate((sheetX + sheetRightX) / 2, (sheetY + topY) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((remainingTop || 0).toFixed(2) + ' мм', 0, 0);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // ОСТАТОК СПРАВА (вертикальная линия + текст на нижней горизонтальной)
        // ═══════════════════════════════════════════════════════════
        if (remainingRight > 50) {
            ctx.beginPath();
            ctx.moveTo(rightX, sheetY);
            ctx.lineTo(rightX, sheetBottomY);
            ctx.stroke();

            // Текст размера (горизонтально, на нижней линии справа)
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText((remainingRight || 0).toFixed(2) + ' мм', sheetRightX - 10, sheetBottomY - 5);
        }

        // ═══════════════════════════════════════════════════════════
        // ОСТАТОК СНИЗУ (горизонтальная линия)
        // ═══════════════════════════════════════════════════════════
        if (remainingBottom > 50) {
            ctx.beginPath();
            ctx.moveTo(sheetX, bottomY);
            ctx.lineTo(sheetRightX, bottomY);
            ctx.stroke();

            // Текст размера (вертикально, внутри остатка)
            ctx.save();
            ctx.translate((sheetX + sheetRightX) / 2, (bottomY + sheetBottomY) / 2);
            ctx.rotate(Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((remainingBottom || 0).toFixed(2) + ' мм', 0, 0);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // ОБЩАЯ ИНФОРМАЦИЯ В ЦЕНТРЕ (суммарный остаток)
        // ═══════════════════════════════════════════════════════════
        const totalUsedArea = nestedParts.reduce((sum, n) => sum + (n.width * n.height), 0);
        const totalSheetArea = sheetSize.width * sheetSize.height;
        const totalRemainingArea = totalSheetArea - totalUsedArea;
        const remainingPercent = ((totalRemainingArea / totalSheetArea) * 100).toFixed(1);

        ctx.fillStyle = 'rgba(255, 165, 0, 0.85)';
        ctx.font = 'bold 12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const centerX = (sheetX + sheetRightX) / 2;
        const centerY = (sheetY + sheetBottomY) / 2;
        
        const remainingM2 = (totalRemainingArea / 1000000).toFixed(2);
        ctx.fillText(
            `Свободно: ${remainingM2} м² (${remainingPercent}%)`,
            centerX,
            centerY
        );
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ЭЛЕМЕНТОВ РАЗМЕТКИ (прямоугольник, круг, полигон)
    // ═══════════════════════════════════════════════════════════
    // Используем window.markupRects для доступа к глобальной переменной
    const rectsToDraw = window.markupRects || markupRects || [];
    rectsToDraw.forEach((item, idx) => {
        if (item.type === 'circle') {
            // Отрисовка круга
            const drawCx = sheetX + item.cx * scaleX;
            const drawCy = sheetY + item.cy * scaleY;
            const drawR = item.radius * scaleX;

            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(drawCx, drawCy, drawR, 0, Math.PI * 2);
            ctx.stroke();

            // Радиус и центр
            ctx.fillStyle = '#FFA500';
            ctx.font = 'bold 11px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(`R${(item.radius || 0).toFixed(2)}`, drawCx, drawCy - 5);

            // Выделение
            if (idx === selectedRectIndex) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 3]);
                ctx.beginPath();
                ctx.arc(drawCx, drawCy, drawR + 3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        } else if (item.type === 'polygon') {
            // Отрисовка полигона
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            
            const firstPoint = item.points[0];
            ctx.moveTo(sheetX + firstPoint.x * scaleX, sheetY + firstPoint.y * scaleY);
            
            for (let i = 1; i < item.points.length; i++) {
                const pt = item.points[i];
                ctx.lineTo(sheetX + pt.x * scaleX, sheetY + pt.y * scaleY);
            }
            
            ctx.closePath();
            ctx.stroke();
            
            // Площадь полигона (формула шнуровки)
            let area = 0;
            for (let i = 0; i < item.points.length; i++) {
                const j = (i + 1) % item.points.length;
                area += item.points[i].x * item.points[j].y;
                area -= item.points[j].x * item.points[i].y;
            }
            area = Math.abs(area) / 2;

            // Центр полигона
            let cx = 0, cy = 0;
            for (const pt of item.points) {
                cx += pt.x;
                cy += pt.y;
            }
            cx /= item.points.length;
            cy /= item.points.length;

            ctx.fillStyle = '#FFA500';
            ctx.font = 'bold 11px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(area)} мм²`, sheetX + cx * scaleX, sheetY + cy * scaleY);

            // Выделение
            if (idx === selectedRectIndex) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 3]);
                ctx.beginPath();
                for (let i = 0; i < item.points.length; i++) {
                    const pt = item.points[i];
                    const drawX = sheetX + pt.x * scaleX;
                    const drawY = sheetY + pt.y * scaleY;
                    if (i === 0) ctx.moveTo(drawX, drawY);
                    else ctx.lineTo(drawX, drawY);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.setLineDash([]);
            }
        } else {
            // Отрисовка прямоугольника (по умолчанию)
            const drawX = sheetX + item.x * scaleX;
            const drawY = sheetY + item.y * scaleY;
            const drawW = item.width * scaleX;
            const drawH = item.height * scaleY;

            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(drawX, drawY, drawW, drawH);

            // Размеры внутри прямоугольника
            ctx.fillStyle = '#FFA500';
            ctx.font = 'bold 11px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (drawW > 60) {
                ctx.fillText(
                    (item.width || 0).toFixed(2),
                    drawX + drawW / 2,
                    drawY + drawH / 2 - 10
                );
            }

            if (drawH > 40) {
                ctx.fillText(
                    (item.height || 0).toFixed(2),
                    drawX + drawW / 2,
                    drawY + drawH / 2 + 10
                );
            }

            // Выделение
            if (idx === selectedRectIndex) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 3]);
                ctx.strokeRect(drawX - 2, drawY - 2, drawW + 4, drawH + 4);
                ctx.setLineDash([]);
            }
        }
    });

    // Рисуем текущий элемент в процессе рисования
    if (currentMarkupMode === 'rect' && currentRect) {
        const drawX = sheetX + currentRect.x * scaleX;
        const drawY = sheetY + currentRect.y * scaleY;
        const drawW = Math.abs(currentRect.width * scaleX);
        const drawH = Math.abs(currentRect.height * scaleY);

        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        const w = Math.abs(currentRect.width);
        const h = Math.abs(currentRect.height);

        ctx.fillStyle = '#FFA500';
        ctx.font = 'bold 11px Segoe UI';
        ctx.textAlign = 'center';

        if (drawW > 60) {
            ctx.fillText((w || 0).toFixed(2), drawX + drawW / 2, drawY + drawH / 2 - 10);
        }

        if (drawH > 40) {
            ctx.fillText((h || 0).toFixed(2), drawX + drawW / 2, drawY + drawH / 2 + 10);
        }
    } else if (currentMarkupMode === 'circle' && currentCircle) {
        const drawCx = sheetX + currentCircle.cx * scaleX;
        const drawCy = sheetY + currentCircle.cy * scaleY;
        const drawR = currentCircle.radius * scaleX;

        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(drawCx, drawCy, drawR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#FFA500';
        ctx.font = 'bold 11px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(`R${(currentCircle.radius || 0).toFixed(2)}`, drawCx, drawCy - 5);
    } else if (currentMarkupMode === 'polygon' && isDrawingMarkupPolygon && markupPolygonPoints.length > 0) {
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        
        const firstPoint = markupPolygonPoints[0];
        ctx.moveTo(sheetX + firstPoint.x * scaleX, sheetY + firstPoint.y * scaleY);
        
        for (let i = 1; i < markupPolygonPoints.length; i++) {
            const pt = markupPolygonPoints[i];
            ctx.lineTo(sheetX + pt.x * scaleX, sheetY + pt.y * scaleY);
        }
        
        // Линия до курсора
        const mouseX = window.lastMarkupMouseX !== undefined ? window.lastMarkupMouseX : 0;
        const mouseY = window.lastMarkupMouseY !== undefined ? window.lastMarkupMouseY : 0;
        ctx.lineTo(sheetX + mouseX * scaleX, sheetY + mouseY * scaleY);
        
        ctx.stroke();

        // Точки вершин
        ctx.fillStyle = '#FFA500';
        for (const pt of markupPolygonPoints) {
            ctx.beginPath();
            ctx.arc(sheetX + pt.x * scaleX, sheetY + pt.y * scaleY, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ЛИНИИ ОБРЕЗКИ ОСТАТКА
    // ═══════════════════════════════════════════════════════════
    // Используем линию из текущего листа если есть allSheets
    const currentSheet = window.allSheets && window.allSheets.length > 0
        ? window.allSheets[window.currentSheetIndex || 0] : null;
    const cutLine = currentSheet ? currentSheet.cutRemnantLine : window.cutRemnantLine;
    const showCutLine = currentSheet ? currentSheet.showCutRemnantLine : window.showCutRemnantLine;

    if (showCutLine && cutLine !== null) {
        const lineY = sheetY + cutLine.y * scaleY;
        const startX = sheetX + 4 * scaleX;
        const endX = sheetX + (sheetSize.width - 4) * scaleX;

        // Пунктирная красная линия
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(startX, lineY);
        ctx.lineTo(endX, lineY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Маркер перетаскивания в центре
        const centerX = (startX + endX) / 2;
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.arc(centerX, lineY, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Надпись
        ctx.fillStyle = '#ff3333';
        ctx.font = 'bold 11px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(`✂️ Y=${(cutLine.y || 0).toFixed(2)} мм`, centerX, lineY - 12);
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ПУНКТИРНОЙ ЛИНИИ ДИАГОНАЛЬНОГО ПАТТЕРНА
    // ═══════════════════════════════════════════════════════════
    if (window.diagonalLayoutEnabled && window.diagonalPatternDragging && window.diagonalPatternStartPoint && window.diagonalPatternEndPoint) {
        const startX = sheetX + window.diagonalPatternStartPoint.x * scaleX;
        const startY = sheetY + window.diagonalPatternStartPoint.y * scaleY;
        const endX = sheetX + window.diagonalPatternEndPoint.x * scaleX;
        const endY = sheetY + window.diagonalPatternEndPoint.y * scaleY;

        // Зелёная пунктирная линия
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Маркер начальной точки (центр исходной детали)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(startX, startY, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Маркер конечной точки
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(endX, endY, 6, 0, 2 * Math.PI);
        ctx.fill();

        // Надпись с расстоянием
        const dx = window.diagonalPatternEndPoint.x - window.diagonalPatternStartPoint.x;
        const dy = window.diagonalPatternEndPoint.y - window.diagonalPatternStartPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;

        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${(distance || 0).toFixed(2)} мм`, midX, midY - 10);

        // ═══════════════════════════════════════════════════════════
        // ВИЗУАЛИЗАЦИЯ КОЛИЧЕСТВА ДЕТАЛЕЙ (стрелки ↑↓)
        // ═══════════════════════════════════════════════════════════
        const count = window.diagonalPatternCount || 2;
        const countLabel = `📐 ${count} шт. ↑↓`;
        
        // Фон метки
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const labelWidth = ctx.measureText(countLabel).width + 20;
        const labelHeight = 30;
        const labelX = midX - labelWidth / 2;
        const labelY = midY - 35;
        
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        
        // Текст
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(countLabel, midX, midY - 19);
        
        // Подсказка
        ctx.fillStyle = '#888';
        ctx.font = '10px Segoe UI';
        ctx.fillText('↑↓ меняют кол-во', midX, midY + 15);

        // v4.41: показываем шаг между копиями
        const stepDist = count > 1 ? (distance / (count - 1)) : 0;
        ctx.fillStyle = '#aaa';
        ctx.font = '10px Segoe UI';
        ctx.fillText('шаг: ' + stepDist.toFixed(1) + ' мм', midX, midY + 28);
        
        // v4.42: Рисуем превью копий — поддерживаем группу (массив) или одиночную деталь
        const sources = window.diagonalPatternSources || (window.diagonalPatternSource ? [window.diagonalPatternSource] : []);
        if (sources.length > 0) {
            // Для каждой детали группы рисуем превью
            for (const src of sources) {
            const dx = window.diagonalPatternEndPoint.x - window.diagonalPatternStartPoint.x;
            const dy = window.diagonalPatternEndPoint.y - window.diagonalPatternStartPoint.y;
            const srcW = src.width * scaleX;
            const srcH = src.height * scaleY;  // Исправлено: используем height (повёрнутый bbox), а не baseHeight

            // Находим деталь для получения objects
            const srcPart = _partsMap.get(src.partId);
            const srcObjects = src.objects && src.objects.length > 0 ? src.objects : (srcPart ? srcPart.objects : null);

            // Подготовка параметров поворота (как при отрисовке реальных деталей)
            const rotationAngle = src.angle || 0;
            // v4.40 FIX R2: swap W<->H at 90/270 if no baseWidth
            let bboxWidth = src.baseWidth || src.width;
            let bboxHeight = src.baseHeight || src.height;
            if (!src.baseWidth) {
                const _deg = Math.round((rotationAngle * 180 / Math.PI) % 360);
                if (Math.abs(_deg) === 90 || Math.abs(_deg) === 270) { [bboxWidth, bboxHeight] = [bboxHeight, bboxWidth]; }
            }
            const rotCenterX = bboxWidth / 2;
            const rotCenterY = bboxHeight / 2;

            const rotatePoint = (px, py, angle, cx, cy) => {
                if (angle === 0) return { x: px, y: py };
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                return {
                    x: cx + (px - cx) * cos - (py - cy) * sin,
                    y: cy + (px - cx) * sin + (py - cy) * cos
                };
            };

            // Вычисляем refPoint (так же как при отрисовке реальных деталей)
            let srcRefPoint = src.refPoint;
            if (!srcRefPoint) {
                const bboxHull = [
                    { x: 0, y: 0 },
                    { x: bboxWidth, y: 0 },
                    { x: bboxWidth, y: bboxHeight },
                    { x: 0, y: bboxHeight }
                ];
                const rotatedBboxHull = bboxHull.map(p => rotatePoint(p.x, p.y, rotationAngle, rotCenterX, rotCenterY));
                srcRefPoint = rotatedBboxHull[0];
                for (const p of rotatedBboxHull) {
                    const py = Math.round(p.y * 1000000) / 1000000;
                    const refY = Math.round(srcRefPoint.y * 1000000) / 1000000;
                    const px = Math.round(p.x * 1000000) / 1000000;
                    const refX = Math.round(srcRefPoint.x * 1000000) / 1000000;
                    if (py < refY || (py === refY && px < refX)) {
                        srcRefPoint = p;
                    }
                }
            }

            const srcPartBbox = srcPart ? (srcPart.bounds || { minX: 0, minY: 0 }) : { minX: 0, minY: 0 };
            const normOffsetX = srcPartBbox.minX || 0;
            const normOffsetY = srcPartBbox.minY || 0;

            // Копии вдоль линии (пунктирные) — НЕ рисуем исходную деталь (она уже на листе)
            for (let i = 1; i < count; i++) {
                const t = i / (count - 1);
                const groupCenterX = window.diagonalPatternStartPoint.x + dx * t;
                const groupCenterY = window.diagonalPatternStartPoint.y + dy * t;
                // v4.42 FIX: относительное смещение детали от центра группы
                const relOffsetX = (src.x + src.width / 2) - window.diagonalPatternStartPoint.x;
                const relOffsetY = (src.y + src.height / 2) - window.diagonalPatternStartPoint.y;
                const copyCenterX = groupCenterX + relOffsetX;
                const copyCenterY = groupCenterY + relOffsetY;

                // Позиция top-left на листе (пересчёт из центра, как в createDiagonalPattern)
                const copyOffsetX = copyCenterX - (src.x + src.width / 2);
                const copyOffsetY = copyCenterY - (src.y + src.height / 2);
                const copyX = src.x + copyOffsetX;
                const copyY = src.y + copyOffsetY;

                const drawCopyX = sheetX + copyX * scaleX;
                const drawCopyY = sheetY + copyY * scaleY;

                if (srcObjects && srcObjects.length > 0) {
                    // Рисуем реальную геометрию (призрачную)
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 3]);

                    srcObjects.forEach(obj => {
                        if (obj.type === 'line') {
                            const p1 = rotatePoint(obj.x1 - normOffsetX, obj.y1 - normOffsetY, rotationAngle, rotCenterX, rotCenterY);
                            const p2 = rotatePoint(obj.x2 - normOffsetX, obj.y2 - normOffsetY, rotationAngle, rotCenterX, rotCenterY);
                            ctx.beginPath();
                            ctx.moveTo(drawCopyX + (p1.x - srcRefPoint.x) * scaleX, drawCopyY + (p1.y - srcRefPoint.y) * scaleY);
                            ctx.lineTo(drawCopyX + (p2.x - srcRefPoint.x) * scaleX, drawCopyY + (p2.y - srcRefPoint.y) * scaleY);
                            ctx.stroke();
                        } else if (obj.type === 'arc') {
                            // v4.60: Отрисовка дуги через точки (надёжнее чем ctx.ellipse)
                            let pts = [];
                            if (typeof obj.getPoints === 'function') {
                                pts = obj.getPoints(48);
                            } else {
                                // Вычисляем точки дуги вручную
                                const r = Math.abs(obj.radius || 0);
                                if (r > 0 && typeof obj.startAngle === 'number' && typeof obj.endAngle === 'number') {
                                    let sweep;
                                    if (obj.direction === 'CW') {
                                        sweep = obj.startAngle - obj.endAngle;
                                        if (sweep < 0) sweep += Math.PI * 2;
                                    } else {
                                        sweep = obj.endAngle - obj.startAngle;
                                        if (sweep < 0) sweep += Math.PI * 2;
                                    }
                                    const segments = Math.max(12, Math.min(72, Math.ceil(sweep / (Math.PI / 36))));
                                    const step = sweep / segments;
                                    const dir = obj.direction === 'CW' ? -1 : 1;
                                    for (let i = 0; i <= segments; i++) {
                                        const angle = obj.startAngle + dir * step * i;
                                        pts.push({
                                            x: obj.cx + Math.cos(angle) * r,
                                            y: obj.cy + Math.sin(angle) * r
                                        });
                                    }
                                }
                            }
                            if (pts.length >= 2) {
                                ctx.beginPath();
                                const p0 = rotatePoint(pts[0].x - normOffsetX, pts[0].y - normOffsetY, rotationAngle, rotCenterX, rotCenterY);
                                ctx.moveTo(drawCopyX + (p0.x - srcRefPoint.x) * scaleX, drawCopyY + (p0.y - srcRefPoint.y) * scaleY);
                                for (let j = 1; j < pts.length; j++) {
                                    const pj = rotatePoint(pts[j].x - normOffsetX, pts[j].y - normOffsetY, rotationAngle, rotCenterX, rotCenterY);
                                    ctx.lineTo(drawCopyX + (pj.x - srcRefPoint.x) * scaleX, drawCopyY + (pj.y - srcRefPoint.y) * scaleY);
                                }
                                ctx.stroke();
                            }
                        } else if (obj.type === 'rect') {
                            const corners = [
                                { x: obj.x - normOffsetX, y: obj.y - normOffsetY },
                                { x: obj.x + obj.width - normOffsetX, y: obj.y - normOffsetY },
                                { x: obj.x + obj.width - normOffsetX, y: obj.y + obj.height - normOffsetY },
                                { x: obj.x - normOffsetX, y: obj.y + obj.height - normOffsetY }
                            ];
                            const rotatedCorners = corners.map(c => rotatePoint(c.x, c.y, rotationAngle, rotCenterX, rotCenterY));
                            ctx.beginPath();
                            ctx.moveTo(drawCopyX + (rotatedCorners[0].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedCorners[0].y - srcRefPoint.y) * scaleY);
                            for (let j = 1; j < rotatedCorners.length; j++) {
                                ctx.lineTo(drawCopyX + (rotatedCorners[j].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedCorners[j].y - srcRefPoint.y) * scaleY);
                            }
                            ctx.closePath();
                            ctx.stroke();
                        } else if (obj.type === 'circle') {
                            const rotatedCenter = rotatePoint(obj.cx - normOffsetX, obj.cy - normOffsetY, rotationAngle, rotCenterX, rotCenterY);
                            ctx.beginPath();
                            ctx.ellipse(
                                drawCopyX + (rotatedCenter.x - srcRefPoint.x) * scaleX,
                                drawCopyY + (rotatedCenter.y - srcRefPoint.y) * scaleY,
                                obj.radius * scaleX,
                                obj.radius * scaleY,
                                0,
                                0, 2 * Math.PI
                            );
                            ctx.stroke();
                        } else if (obj.type === 'polygon') {
                            const vertices = obj.getVertices ? obj.getVertices() : [];
                            if (vertices.length > 0) {
                                const rotatedVertices = vertices.map(v => rotatePoint(v.x - normOffsetX, v.y - normOffsetY, rotationAngle, rotCenterX, rotCenterY));
                                ctx.beginPath();
                                ctx.moveTo(drawCopyX + (rotatedVertices[0].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedVertices[0].y - srcRefPoint.y) * scaleY);
                                for (let j = 1; j < rotatedVertices.length; j++) {
                                    ctx.lineTo(drawCopyX + (rotatedVertices[j].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedVertices[j].y - srcRefPoint.y) * scaleY);
                                }
                                ctx.closePath();
                                ctx.stroke();
                            }
                        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                            const pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                            if (pts.length >= 2) {
                                const rotatedPts = pts.map(p => rotatePoint(p.x - normOffsetX, p.y - normOffsetY, rotationAngle, rotCenterX, rotCenterY));
                                ctx.beginPath();
                                ctx.moveTo(drawCopyX + (rotatedPts[0].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedPts[0].y - srcRefPoint.y) * scaleY);
                                for (let j = 1; j < rotatedPts.length; j++) {
                                    ctx.lineTo(drawCopyX + (rotatedPts[j].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedPts[j].y - srcRefPoint.y) * scaleY);
                                }
                                if (obj.closed) {
                                    ctx.closePath();
                                }
                                ctx.stroke();
                            }
                        } else if (obj.type === 'spline') {
                            // v4.57: Сплайн — рисуем через fitPoints
                            const spts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
                                .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
                            if (spts.length >= 2) {
                                const rotatedSpts = spts.map(p => rotatePoint(p.x - normOffsetX, p.y - normOffsetY, rotationAngle, rotCenterX, rotCenterY));
                                ctx.beginPath();
                                ctx.moveTo(drawCopyX + (rotatedSpts[0].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedSpts[0].y - srcRefPoint.y) * scaleY);
                                for (let sj = 1; sj < rotatedSpts.length; sj++) {
                                    ctx.lineTo(drawCopyX + (rotatedSpts[sj].x - srcRefPoint.x) * scaleX, drawCopyY + (rotatedSpts[sj].y - srcRefPoint.y) * scaleY);
                                }
                                if (obj.closed || obj.isClosed) ctx.closePath();
                                ctx.stroke();
                            }
                        }
                    });
                } else {
                    // Fallback: прямоугольник если нет объектов
                    const copyScreenX = sheetX + copyCenterX * scaleX;
                    const copyScreenY = sheetY + copyCenterY * scaleY;
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 3]);
                    ctx.strokeRect(copyScreenX - srcW / 2, copyScreenY - srcH / 2, srcW, srcH);
                }
            }
            ctx.setLineDash([]);
        } // end if (srcObjects)
        } // end for (src of sources)
    }

    // ═══════════════════════════════════════════════════════════
    // v4.80: ПРЕВЬЮ ПРЯМОУГОЛЬНОГО ПАТТЕРНА
    // ═══════════════════════════════════════════════════════════
    if (window.rectPatternDragging && window.rectPatternStartPoint && window.rectPatternEndPoint) {
        const startX = sheetX + window.rectPatternStartPoint.x * scaleX;
        const startY = sheetY + window.rectPatternStartPoint.y * scaleY;
        const endX = sheetX + window.rectPatternEndPoint.x * scaleX;
        const endY = sheetY + window.rectPatternEndPoint.y * scaleY;

        // Вычисляем cols × rows из count
        const count = window.rectPatternCount || 4;
        let cols = Math.ceil(Math.sqrt(count));
        let rows = Math.ceil(count / cols);
        while (cols * (rows - 1) >= count && rows > 1) rows--;
        const stepX = window.rectPatternStepX || 50;
        const stepY = window.rectPatternStepY || 50;

        // Пунктирная рамка области паттерна
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(
            Math.min(startX, endX), Math.min(startY, endY),
            Math.abs(endX - startX), Math.abs(endY - startY)
        );
        ctx.setLineDash([]);

        // Маркеры центра и угла
        ctx.fillStyle = '#00ddff';
        ctx.beginPath(); ctx.arc(startX, startY, 6, 0, 2 * Math.PI); ctx.fill();

        // Метка с количеством
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const label = `📐 ${count} шт (${cols}×${rows}) ↑↓`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const lw = ctx.measureText(label).width + 20;
        ctx.fillRect(midX - lw/2, midY - 35, lw, 30);
        ctx.fillStyle = '#00ddff';
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY - 19);
        ctx.fillStyle = '#888';
        ctx.font = '10px Segoe UI';
        ctx.fillText('↑↓ меняют кол-во, клик — применить', midX, midY + 15);
        ctx.fillText(`шаг: ${stepX}×${stepY}мм`, midX, midY + 28);

        // Превью призрачных копий (по сетке)
        // v2.9: используем groupCenter для позиционирования (как circ pattern)
        const sources = window.rectPatternSources || [];
        const groupCenter = window.rectPatternGroupCenter || window.rectPatternStartPoint;
        if (sources.length > 0 && groupCenter) {
            ctx.strokeStyle = 'rgba(0, 221, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    if (col === 0 && row === 0) continue;
                    if (row * cols + col >= count) break;
                    const dx = col * stepX;
                    const dy = row * stepY;
                    // v2.9: позиция = startPoint + relOffset(groupCenter) + (dx, dy)
                    for (const src of sources) {
                        const relX = (src.x + src.width / 2) - groupCenter.x;
                        const relY = (src.y + src.height / 2) - groupCenter.y;
                        const copyCenterX = window.rectPatternStartPoint.x + relX + dx;
                        const copyCenterY = window.rectPatternStartPoint.y + relY + dy;
                        const drawCopyX = sheetX + (copyCenterX - src.width / 2) * scaleX;
                        const drawCopyY = sheetY + (copyCenterY - src.height / 2) * scaleY;
                        ctx.strokeRect(drawCopyX, drawCopyY, src.width * scaleX, src.height * scaleY);
                    }
                }
            }
            ctx.setLineDash([]);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // v2.9: ПРЕВЬЮ rectPattern WaitCenter — ожидание клика для первого угла
    // ═══════════════════════════════════════════════════════════
    if (window.rectPatternWaitCenter) {
        const count = window.rectPatternCount || 4;
        const label = `📐 Кликните для первого угла прямоугольника\n${count} шт — Esc отмена`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = 'bold 13px Segoe UI';
        const lines = label.split('\n');
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const padX = 12, padY = 8;
        const labelX = sheetX + 10;
        const labelY = sheetY + 10;
        ctx.fillRect(labelX, labelY, maxW + padX * 2, lines.length * 18 + padY * 2);
        ctx.fillStyle = '#00ddff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, labelX + padX, labelY + padY + i * 18));
    }

    // ═══════════════════════════════════════════════════════════
    // v2.6: ПРЕВЬЮ WaitCenter — ожидание клика для центра окружности
    // ═══════════════════════════════════════════════════════════
    if (window.circPatternWaitCenter) {
        const count = window.circPatternCount || 6;
        const arcAngleDeg = window.circPatternArcAngle || 360;
        const label = `⭕ Кликните для центра окружности\n${count} шт, ${arcAngleDeg}° — Esc отмена`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = 'bold 13px Segoe UI';
        const lines = label.split('\n');
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const padX = 12, padY = 8;
        const labelX = sheetX + 10;
        const labelY = sheetY + 10;
        ctx.fillRect(labelX, labelY, maxW + padX * 2, lines.length * 18 + padY * 2);
        ctx.fillStyle = '#00ddff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, labelX + padX, labelY + padY + i * 18));
    }

    // ═══════════════════════════════════════════════════════════
    // v4.80: ПРЕВЬЮ КРУГОВОГО ПАТТЕРНА
    // v2.6: radius = dist(center, mouse), startAngle = atan2 (растягивание)
    // ═══════════════════════════════════════════════════════════
    if (window.circPatternDragging && window.circPatternCenter && window.circPatternEndPoint) {
        const centerX = sheetX + window.circPatternCenter.x * scaleX;
        const centerY = sheetY + window.circPatternCenter.y * scaleY;
        const endX = sheetX + window.circPatternEndPoint.x * scaleX;
        const endY = sheetY + window.circPatternEndPoint.y * scaleY;
        const radius = (window.circPatternRadius || 50) * scaleX;
        const count = window.circPatternCount || 6;
        const arcAngleDeg = window.circPatternArcAngle || 360;
        const startAngle = window.circPatternStartAngle || 0;

        // Окружность паттерна (пунктир)
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);

        // Маркер центра
        ctx.fillStyle = '#00ddff';
        ctx.beginPath(); ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI); ctx.fill();

        // Линия от центра к курсору (показывает startAngle)
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Метка с количеством и углом дуги
        const midX = (centerX + endX) / 2;
        const midY = (centerY + endY) / 2;
        const label = `⭕ ${count} шт, R=${(window.circPatternRadius || 0).toFixed(0)}мм, ${arcAngleDeg}°`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const lw = ctx.measureText(label).width + 20;
        ctx.fillRect(midX - lw/2, midY - 35, lw, 30);
        ctx.fillStyle = '#00ddff';
        ctx.font = 'bold 13px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY - 19);
        ctx.fillStyle = '#888';
        ctx.font = '10px Segoe UI';
        ctx.fillText('↑↓ кол-во, ←→ дуга, клик = применить', midX, midY + 15);

        // Превью призрачных копий по дуге (с учётом startAngle)
        // v2.4: показываем ВСЕ позиции включая i=0 (на курсоре) — нет пустоты
        // v2.7: relX/relY от groupCenter (центр выделения), НЕ от center (клик)
        //   → объекты лежат НА окружности radius, а не смещены на (деталь-клик)
        const sources = window.circPatternSources || [];
        const groupCenter = window.circPatternGroupCenter || window.circPatternCenter;
        if (sources.length > 0 && groupCenter) {
            const angleStep = (arcAngleDeg * Math.PI / 180) / (arcAngleDeg === 360 ? count : (count - 1 || 1));
            ctx.strokeStyle = 'rgba(0, 221, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            for (let i = 0; i < count; i++) {
                const angleRad = startAngle + i * angleStep;
                for (const src of sources) {
                    // v2.7: смещение от groupCenter + radius → объект на окружности
                    const relX = (src.x + src.width / 2) - groupCenter.x + window.circPatternRadius;
                    const relY = (src.y + src.height / 2) - groupCenter.y;
                    const cos = Math.cos(angleRad);
                    const sin = Math.sin(angleRad);
                    const rotX = relX * cos - relY * sin;
                    const rotY = relX * sin + relY * cos;
                    const copyCenterX = window.circPatternCenter.x + rotX;
                    const copyCenterY = window.circPatternCenter.y + rotY;
                    const drawCopyX = sheetX + (copyCenterX - src.width / 2) * scaleX;
                    const drawCopyY = sheetY + (copyCenterY - src.height / 2) * scaleY;
                    ctx.strokeRect(drawCopyX, drawCopyY, src.width * scaleX, src.height * scaleY);
                }
            }
            ctx.setLineDash([]);
        }
    }

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ ХОЛСТА
// ═══════════════════════════════════════════════════════════════
// render() - основная отрисовка всего холста
// Вызывается после каждого изменения (перемещение, рисование, зум)

// v4.47: Простая функция render без rAF throttle (убран P2 для совместимости)
// R4: parts -> Map для O(1) поиска вместо O(n) parts.find()
let _partsMap = new Map();
window.render = function render() {
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // R4: parts cache — создаётся один раз per frame
    _partsMap = (typeof parts !== 'undefined' && parts) ? new Map(parts.map(p => [p.id, p])) : new Map();

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ЛИНИИ МИКРОСТЫКА (если активен режим рисования)
    // ═══════════════════════════════════════════════════════════
    if (currentTool === 'microjoint' && window.microjointEnabled && 
        window.microjointIsDrawing && window.microjointLineStart && window.microjointLineEnd) {
        
        ctx.save();
        ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
        ctx.scale(zoom, zoom);
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([10 / zoom, 5 / zoom]);
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(window.microjointLineStart.x, window.microjointLineStart.y);
        ctx.lineTo(window.microjointLineEnd.x, window.microjointLineEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Кружки на концах
        ctx.fillStyle = '#00ff00';
        
        ctx.beginPath();
        ctx.arc(window.microjointLineStart.x, window.microjointLineStart.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(window.microjointLineEnd.x, window.microjointLineEnd.y, 5 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
        
        ctx.restore();
    }

    // Сохраняем контекст и применяем трансформации
    ctx.save();
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);

    drawGrid();
    
    // Рисуем оси только если сетка включена
    if (window.showGrid) {
        drawAxes();
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ФОТО-ФОНА ОСТАТКА
    // ═══════════════════════════════════════════════════════════
    // Рисуем фото на ОСНОВНОМ холсте во время калибровки ИЛИ после неё
    if (sheetBackgroundImage && (isCalibrating || window.sheetBackgroundImageVisible)) {
        const imgWidth = sheetBackgroundImage.width / sheetImageScale;
        const imgHeight = sheetBackgroundImage.height / sheetImageScale;

        // v4.47: смещение и поворот фото после выравнивания
        const _imgOffX = window.sheetImageOffsetX || 0;
        const _imgOffY = window.sheetImageOffsetY || 0;
        const _imgRot = window.sheetImageRotation || 0;

        ctx.save();
        ctx.globalAlpha = isCalibrating ? 0.8 : 0.65;
        // v4.47: применяем смещение и поворот
        ctx.translate(_imgOffX, _imgOffY);
        if (_imgRot !== 0) {
            ctx.rotate(_imgRot);
        }
        ctx.drawImage(sheetBackgroundImage, 0, 0, imgWidth, imgHeight);
        
        // ═══════════════════════════════════════════════════════
        // КРЕСТИК ЗАКРЫТИЯ ФОТО (только после калибровки)
        // ═══════════════════════════════════════════════════════
        if (!isCalibrating && window.sheetBackgroundImageVisible) {
            const closeBtnSize = 18 / zoom;          // фиксированный ~18px на экране
            const padding = 6 / zoom;
            const closeBtnX = imgWidth - closeBtnSize - padding;
            const closeBtnY = padding;
            
            // Красный круг
            ctx.fillStyle = 'rgba(220, 50, 50, 0.95)';
            ctx.beginPath();
            ctx.arc(closeBtnX + closeBtnSize / 2, closeBtnY + closeBtnSize / 2, closeBtnSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
            
            // Белый X
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5 / zoom;
            ctx.lineCap = 'round';
            ctx.beginPath();
            const inset = 5 / zoom;
            ctx.moveTo(closeBtnX + inset, closeBtnY + inset);
            ctx.lineTo(closeBtnX + closeBtnSize - inset, closeBtnY + closeBtnSize - inset);
            ctx.moveTo(closeBtnX + closeBtnSize - inset, closeBtnY + inset);
            ctx.lineTo(closeBtnX + inset, closeBtnY + closeBtnSize - inset);
            ctx.stroke();
            
            // v4.48: Сохраняем мировые координаты центра с учётом смещения/поворота картинки
            const _btnLocalX = closeBtnX + closeBtnSize / 2;
            const _btnLocalY = closeBtnY + closeBtnSize / 2;
            const _imgOffX = window.sheetImageOffsetX || 0;
            const _imgOffY = window.sheetImageOffsetY || 0;
            const _imgRot = window.sheetImageRotation || 0;
            const _cos = Math.cos(_imgRot), _sin = Math.sin(_imgRot);
            // Поворот + смещение: world = rotate(local) + offset
            window.sheetBgCloseBtn = {
                x: _btnLocalX * _cos - _btnLocalY * _sin + _imgOffX,
                y: _btnLocalX * _sin + _btnLocalY * _cos + _imgOffY,
                radius: closeBtnSize * 0.6
            };
        } else {
            window.sheetBgCloseBtn = null;
        }

        ctx.restore();
    }

    // Рисуем центр координат (0, 0) оранжевой точкой
    ctx.fillStyle = 'rgba(255, 165, 0, 1)';
    ctx.beginPath();
    ctx.arc(0, 0, 6 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();

    // Рисуем все объекты
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / zoom;

    // v4.60: Полупрозрачная заливка деталей (перед линиями)
    if (typeof drawPartsFillOnCanvas === 'function' && !showSheetView) {
        drawPartsFillOnCanvas(ctx, objects);
    }

    objects.forEach(obj => {
        // Защитная проверка: пропускаем объекты без метода draw
        if (!obj || typeof obj.draw !== 'function') {
            return;
        }
        const isSelected = selectedObjects.includes(obj);
        if (obj.type === 'text') {
            obj.draw(ctx, isSelected);
        } else {
            if (isSelected) {
                // v1.0: Более заметная подсветка — оранжевый + glow effect
                // Сначала рисуем "halo" — толстую полупрозрачную линию
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 152, 0, 0.35)';
                ctx.lineWidth = 8 / zoom;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                obj.draw(ctx);
                ctx.restore();
                // Затем основную линию — ярко-оранжевая, толстая
                ctx.strokeStyle = '#ff9800';
                ctx.lineWidth = 3.5 / zoom;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                obj.draw(ctx);
            } else {
                ctx.strokeStyle = obj.color || '#fff';
                ctx.lineWidth = 2 / zoom;
                obj.draw(ctx);
            }
        }
    });

    // v1.0: Mirror overlay — линия отражения + предпросмотр
    if (typeof window.drawMirrorOverlay === 'function') {
        window.drawMirrorOverlay(ctx);
    }

    // Рисуем точки привязки
    if (objects.length > 0) {
        const lineEndpoints = [];
        for (const obj of objects) {
            if (obj.type === 'line') {
                lineEndpoints.push({ x: obj.x1, y: obj.y1, obj: obj, type: 'start' });
                lineEndpoints.push({ x: obj.x2, y: obj.y2, obj: obj, type: 'end' });
            }
        }

        // ═══════════════════════════════════════════════════════════
        // ПРОВЕРКА ЗАМКНУТОСТИ КОНТУРА
        // Точка считается соединённой если:
        // 1. Есть другая конечная точка в пределах CONNECTION_TOLERANCE
        // 2. Точка лежит на границе ЛЮБОГО другого объекта (с допуском)
        // ═══════════════════════════════════════════════════════════
        const CONNECTION_TOLERANCE = 0.5;

        // Расстояние от точки до отрезка
        function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const lenSq = dx * dx + dy * dy;
            if (lenSq === 0) return Math.hypot(px - x1, py - y1);
            let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            const projX = x1 + t * dx;
            const projY = y1 + t * dy;
            return Math.hypot(px - projX, py - projY);
        }

        // Проверка: лежит ли точка на границе объекта
        function isPointOnObjectEdge(px, py, obj, tol) {
            switch (obj.type) {
                case 'line':
                    return pointToSegmentDistance(px, py, obj.x1, obj.y1, obj.x2, obj.y2) < tol;
                case 'rect': {
                    const x1 = obj.x, y1 = obj.y;
                    const x2 = obj.x + obj.width, y2 = obj.y + obj.height;
                    return (
                        pointToSegmentDistance(px, py, x1, y1, x2, y1) < tol ||
                        pointToSegmentDistance(px, py, x2, y1, x2, y2) < tol ||
                        pointToSegmentDistance(px, py, x2, y2, x1, y2) < tol ||
                        pointToSegmentDistance(px, py, x1, y2, x1, y1) < tol
                    );
                }
                case 'circle':
                case 'arc': {
                    const r = Math.abs(obj.radius || 0);
                    if (r <= 0) return false;
                    const cx = obj.cx || 0, cy = obj.cy || 0;
                    return Math.abs(Math.hypot(px - cx, py - cy) - r) < tol;
                }
                case 'polygon': {
                    const pts = (typeof obj.getVertices === 'function') ? obj.getVertices() : [];
                    if (pts.length < 2) return false;
                    for (let i = 0; i < pts.length; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % pts.length];
                        if (pointToSegmentDistance(px, py, p1.x, p1.y, p2.x, p2.y) < tol) return true;
                    }
                    return false;
                }
                case 'polyline':
                case 'lwpolyline': {
                    const pts = obj.points || obj.vertices || [];
                    if (pts.length < 2) return false;
                    for (let i = 0; i < pts.length - 1; i++) {
                        if (pointToSegmentDistance(px, py, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y) < tol) return true;
                    }
                    if (obj.closed && pts.length > 2) {
                        const last = pts[pts.length - 1];
                        const first = pts[0];
                        if (pointToSegmentDistance(px, py, last.x, last.y, first.x, first.y) < tol) return true;
                    }
                    return false;
                }
                default:
                    return false;
            }
        }

        const unconnectedPoints = [];

        for (let i = 0; i < lineEndpoints.length; i++) {
            const point = lineEndpoints[i];
            let isConnected = false;

            // 1. Совпадение с другой конечной точкой линии
            for (let j = 0; j < lineEndpoints.length; j++) {
                if (i === j) continue;
                const other = lineEndpoints[j];
                if (Math.hypot(point.x - other.x, point.y - other.y) < CONNECTION_TOLERANCE) {
                    isConnected = true;
                    break;
                }
            }

            // 2. Точка лежит на границе ЛЮБОГО другого объекта
            if (!isConnected) {
                for (const obj of objects) {
                    if (obj === point.obj) continue;
                    if (isPointOnObjectEdge(point.x, point.y, obj, CONNECTION_TOLERANCE)) {
                        isConnected = true;
                        break;
                    }
                }
            }

            if (!isConnected) {
                unconnectedPoints.push(point);
            }
        }

        // Рисуем все точки привязки
        objects.forEach(obj => {
            if (!obj || typeof obj.getPoints !== 'function') return;
            const points = obj.getPoints();
            points.forEach((pt, idx) => {
                ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2.5 / zoom, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#1e1e1e';
                ctx.lineWidth = 1 / zoom;
                ctx.stroke();
            });
        });

        // Рисуем несоединённые точки красным с пульсацией
        if (unconnectedPoints.length > 0) {
            // Пульсация: радиус меняется от 0 до 1 по синусоиде (60ms период = 16.67Hz)
            const pulse = (Math.sin(Date.now() * 0.006) + 1) / 2; // 0..1
            const pulseFactor = 0.4; // Коэффициент пульсации (40% от базового размера)
            
            for (const point of unconnectedPoints) {
                // Базовый радиус: 5 / zoom (при zoom=0.5 будет 10px)
                const baseRadius = 5 / zoom;
                // Добавляем пульсацию
                const radius = baseRadius * (1 + pulse * pulseFactor);
                
                ctx.fillStyle = 'rgba(255, 50, 50, 1)';
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1 / zoom;
                ctx.stroke();
            }
        }
    }

    // Подсветка точки при наведении (hover) для инструмента Select
    // Подсветка точки при наведении (hover) для инструментов "Выбор", "Размер", "Угол", "Линия", "Круг" и "Прямоугольник"
    if (hoveredPoint && !draggedPoint && (currentTool === 'select' || currentTool === 'dimension' || currentTool === 'angle' || currentTool === 'line' || currentTool === 'circle' || currentTool === 'rect')) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';  // Зелёный цвет
        ctx.beginPath();
        ctx.arc(hoveredPoint.point.x, hoveredPoint.point.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    }

    // ═══════════════════════════════════════════════════════════
    // v1.0: ПУНКТИРНЫЕ ЛИНИИ ВЫРАВНИВАНИЯ (как в Компас-3D)
    // ═══════════════════════════════════════════════════════════
    if (window._alignmentGuides && window._alignmentGuides.length > 0) {
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        const viewW = canvas.width / zoom;
        const viewH = canvas.height / zoom;
        for (const guide of window._alignmentGuides) {
            ctx.beginPath();
            if (guide.type === 'vertical') {
                ctx.moveTo(guide.x, -viewH);
                ctx.lineTo(guide.x, viewH);
            } else {
                ctx.moveTo(-viewW, guide.y);
                ctx.lineTo(viewW, guide.y);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // ═══════════════════════════════════════════════════════════
    // v1.0: ВИЗУАЛЬНАЯ ИНДИКАЦИЯ ГРУПП — пунктирная обводка bbox
    // ═══════════════════════════════════════════════════════════
    if (typeof objects !== 'undefined' && objects && objects.length > 0) {
        const groupIds = new Set();
        for (const obj of objects) {
            if (obj && obj._groupId !== undefined) groupIds.add(obj._groupId);
        }
        if (groupIds.size > 0) {
            ctx.strokeStyle = 'rgba(0, 200, 100, 0.6)';
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.fillStyle = 'rgba(0, 200, 100, 0.05)';

            for (const gid of groupIds) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const obj of objects) {
                    if (!obj || obj._groupId !== gid) continue;
                    if (typeof obj.getPoints === 'function') {
                        try {
                            const pts = obj.getPoints();
                            for (const p of pts) {
                                if (p && typeof p.x === 'number') {
                                    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                                    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                                }
                            }
                        } catch(e) {}
                    } else if (obj.type === 'line') {
                        if (obj.x1 < minX) minX = obj.x1; if (obj.x1 > maxX) maxX = obj.x1;
                        if (obj.x2 < minX) minX = obj.x2; if (obj.x2 > maxX) maxX = obj.x2;
                        if (obj.y1 < minY) minY = obj.y1; if (obj.y1 > maxY) maxY = obj.y1;
                        if (obj.y2 < minY) minY = obj.y2; if (obj.y2 > maxY) maxY = obj.y2;
                    } else if (obj.type === 'circle' || obj.type === 'arc') {
                        const r = obj.radius || 0;
                        if (obj.cx - r < minX) minX = obj.cx - r;
                        if (obj.cx + r > maxX) maxX = obj.cx + r;
                        if (obj.cy - r < minY) minY = obj.cy - r;
                        if (obj.cy + r > maxY) maxY = obj.cy + r;
                    } else if (obj.type === 'rect') {
                        if (obj.x < minX) minX = obj.x;
                        if (obj.x + obj.width > maxX) maxX = obj.x + obj.width;
                        if (obj.y < minY) minY = obj.y;
                        if (obj.y + obj.height > maxY) maxY = obj.y + obj.height;
                    }
                }
                if (minX !== Infinity && maxX !== -Infinity) {
                    const pad = 3 / zoom;
                    ctx.fillRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
                    ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
                }
            }
            ctx.setLineDash([]);
        }
    }

    // Подсветка центра координат (0, 0) при наведении
    if ((currentTool === 'select' || currentTool === 'dimension' || currentTool === 'angle' || currentTool === 'line' || currentTool === 'circle' || currentTool === 'rect' || currentTool === 'polygon') && !hoveredPoint) {
        // v4.89: ИСПРАВЛЕНО — используем appState.lastMouseX (window.lastMouseX не существует).
        // Формула: (mouseX - canvas.width/2 - panX) / zoom (panX вычитается ПОСЛЕ canvas.width/2).
        // Радиус = getEffectiveSnapDistance() (адаптивный, не SNAP_DISTANCE/zoom).
        const lmX = (typeof appState !== 'undefined' && appState.lastMouseX != null) ? appState.lastMouseX : 0;
        const lmY = (typeof appState !== 'undefined' && appState.lastMouseY != null) ? appState.lastMouseY : 0;
        const mouseWorldX = (lmX - canvas.width / 2 - panX) / zoom;
        const mouseWorldY = (lmY - canvas.height / 2 - panY) / zoom;
        const distToOrigin = Math.sqrt(Math.pow(mouseWorldX, 2) + Math.pow(mouseWorldY, 2));
        const originHoverRadius = (typeof window.getEffectiveSnapDistance === 'function')
            ? window.getEffectiveSnapDistance() : SNAP_DISTANCE;

        if (distToOrigin < originHoverRadius) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';  // Зелёный цвет
            ctx.beginPath();
            ctx.arc(0, 0, 6 / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2 / zoom;
            ctx.stroke();
        }
    }

    // Подсветка точки при наведении (hover) для инструмента Угол
    if (angleHoveredPoint && currentTool === 'angle') {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';  // Зелёный цвет
        ctx.beginPath();
        ctx.arc(angleHoveredPoint.point.x, angleHoveredPoint.point.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    }

    // Рисуем текущую фигуру при рисовании
    if (currentShape) {
        // Если линия заморожена (курсор в сайдбаре) — не рисуем ничего (просто обрываем линию)
        if (currentTool === 'line' && lineToolFrozen) {
            // Ничего не рисуем - линия просто обрывается
        } else if (currentTool === 'eraser' && isDrawing) {
            // Линия ластика — красный пунктир
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([5 / zoom, 5 / zoom]);
            currentShape.draw(ctx);
            ctx.setLineDash([]);
            
            // Подсветка объектов, которые будут удалены
            ctx.save();
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3 / zoom;
            ctx.setLineDash([3 / zoom, 3 / zoom]);
            for (const obj of objects) {
                if (typeof isObjectHitByEraser === 'function' && isObjectHitByEraser(obj, currentShape, typeof getEffectiveEraserTolerance === 'function' ? getEffectiveEraserTolerance() : ERASER_TOLERANCE)) {
                    obj.draw(ctx);
                }
            }
            ctx.restore();
        } else {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2 / zoom;
            currentShape.draw(ctx);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ИНДИКАТОР УГЛОВОЙ ПРИВЯЗКИ ЛИНИИ (Fusion 360 style)
    // ═══════════════════════════════════════════════════════════
    if (currentTool === 'line' && isDrawing && lineSnapConstraint && currentShape) {
        const midX = (startPoint.x + currentShape.x2) / 2;
        const midY = (startPoint.y + currentShape.y2) / 2;
        ctx.fillStyle = '#00bfff';
        ctx.font = `bold ${14 / zoom}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(lineSnapConstraint.label, midX, midY - 10 / zoom);

        // Подсветка опорной линии
        const refLine = lineSnapConstraint.obj;
        if (refLine && refLine.type === 'line') {
            ctx.strokeStyle = 'rgba(0, 191, 255, 0.3)';
            ctx.lineWidth = 4 / zoom;
            ctx.beginPath();
            ctx.moveTo(refLine.x1, refLine.y1);
            ctx.lineTo(refLine.x2, refLine.y2);
            ctx.stroke();
        }
    }

    // Рисуем привязку
    if (snapPoint && isDrawing && startPoint) {
        // Цвет зависит от типа привязки
        let snapColor = '#ffa500'; // Оранжевый - точка
        let snapLabel = '';
        
        if (snapPoint.type === 'edge' || snapPoint.type === 'line') {
            snapColor = '#00bfff'; // Голубой - грань/линия
            snapLabel = '⊥';
        } else if (snapPoint.type === 'midpoint') {
            snapColor = '#ffff00'; // Жёлтый - середина
            snapLabel = '•';
        } else if (snapPoint.type === 'center') {
            snapColor = '#ff69b4'; // Розовый - центр круга
            snapLabel = '◎';
        } else if (snapPoint.type === 'origin') {
            snapColor = '#ff4444'; // Красный - центр координат
            snapLabel = '⊕';
        } else if (snapPoint.type === 'intersection') {
            snapColor = '#00ff00'; // Зелёный - пересечение линий
            snapLabel = '✛';
        } else if (snapPoint.type === 'tangent') {
            snapColor = '#9932cc'; // Фиолетовый - касательная к кругу
            snapLabel = '◐';
        }

        // Пунктирная линия от начальной точки до привязки
        ctx.strokeStyle = snapColor;
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(snapPoint.x, snapPoint.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Маркер привязки
        ctx.fillStyle = snapColor;
        ctx.beginPath();
        ctx.arc(snapPoint.x, snapPoint.y, 2 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();

        // Подсказка типа привязки
        if (snapLabel) {
            ctx.fillStyle = snapColor;
            ctx.font = `bold ${14 / zoom}px Segoe UI`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(snapLabel, snapPoint.x, snapPoint.y - 10 / zoom);
        }
    }

    // Отрисовка выбранной грани
    if (selectedEdge) {
        const { edge } = selectedEdge;
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(edge.p1.x, edge.p1.y);
        ctx.lineTo(edge.p2.x, edge.p2.y);
        ctx.stroke();
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 30px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((edge.length || 0).toFixed(2), edge.midX, edge.midY - 10);
    }

    // Отрисовка размерных линий
    // v1.3: Если gabaritOnlyMode — показываем только dim='gabarit-*', игнорируем остальные
    const dimsToShow = (window.gabaritOnlyMode === true)
        ? dimensionLines.filter(d => d.dim && d.dim.indexOf('gabarit') === 0)
        : dimensionLines;
    if (dimsToShow.length > 0) {
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.font = '30px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        dimsToShow.forEach((dim, idx) => {
            const isSelected = (idx === selectedDimension);
            ctx.strokeStyle = isSelected ? '#ffff00' : '#00ff00';
            ctx.fillStyle = isSelected ? '#ffff00' : '#00ff00';

            const tickSize = 8;
            const midX = (dim.x1 + dim.x2) / 2;
            const midY = (dim.y1 + dim.y2) / 2;

            const dx = dim.x2 - dim.x1;
            const dy = dim.y2 - dim.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const offsetX = -dy / length * 15;
            const offsetY = dx / length * 15;

            // Основная линия
            ctx.beginPath();
            ctx.moveTo(dim.x1 + offsetX, dim.y1 + offsetY);
            ctx.lineTo(dim.x2 + offsetX, dim.y2 + offsetY);
            ctx.stroke();

            // Засечки
            ctx.beginPath();
            ctx.moveTo(dim.x1 + offsetX, dim.y1 + offsetY - tickSize);
            ctx.lineTo(dim.x1 + offsetX, dim.y1 + offsetY + tickSize);
            ctx.moveTo(dim.x2 + offsetX, dim.y2 + offsetY - tickSize);
            ctx.lineTo(dim.x2 + offsetX, dim.y2 + offsetY + tickSize);
            ctx.stroke();

            // Текст размера
            ctx.save();
            ctx.translate(midX + offsetX, midY + offsetY);
            let angle = Math.atan2(dy, dx);
            if (Math.abs(angle) > Math.PI / 2) {
                angle = angle > 0 ? angle - Math.PI : angle + Math.PI;
            }
            ctx.rotate(angle);
            ctx.fillText(dim.value, 0, -5);
            ctx.restore();
        });
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА УГЛОВЫХ РАЗМЕРОВ
    // ═══════════════════════════════════════════════════════════
    if (angleDimensions.length > 0) {
        if (angleDimensions.length === 1 && selectedAngleDimension === null) {
            // Первое появление — без логов
        }

        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        angleDimensions.forEach((angleDim, idx) => {
            const isSelected = (idx === selectedAngleDimension);
            ctx.strokeStyle = isSelected ? '#ffff00' : '#00bfff';
            ctx.fillStyle = isSelected ? '#ffff00' : '#00bfff';

            // Линии от вершины до точек
            ctx.beginPath();
            ctx.moveTo(angleDim.x, angleDim.y);
            ctx.lineTo(angleDim.x1, angleDim.y1);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(angleDim.x, angleDim.y);
            ctx.lineTo(angleDim.x2, angleDim.y2);
            ctx.stroke();

            // Дуга угла
            const radius = angleDim.radius;
            let startAngle = angleDim.startAngle;
            let endAngle = angleDim.endAngle;

            // ═══════════════════════════════════════════════════════
            // ВЫЧИСЛЯЕМ МЕНЬШИЙ УГОЛ (< 180°) ДЛЯ ОТРИСОВКИ
            // ═══════════════════════════════════════════════════════
            let angleSpan = endAngle - startAngle;
            if (angleSpan < 0) angleSpan += Math.PI * 2;
            
            // Если размах > 180°, меняем направление для отрисовки меньшего угла
            if (angleSpan > Math.PI) {
                const temp = startAngle;
                startAngle = endAngle;
                endAngle = temp;
                angleSpan = Math.PI * 2 - angleSpan;
            }

            ctx.beginPath();
            ctx.arc(angleDim.x, angleDim.y, radius, startAngle, endAngle);
            ctx.stroke();

            // ═══════════════════════════════════════════════════════════
            // ВИЗУАЛИЗАЦИЯ ВЫБРАННЫХ ТОЧЕК (во время создания угла)
            // ═══════════════════════════════════════════════════════════
            // Рисуем точки только если это текущий создаваемый размер (последний в массиве)
            // и если пользователь ещё не завершил создание (3-й клик не сделан)
            // Но поскольку мы уже здесь, значит размер создан — показываем вершину и точки
            if (idx === angleDimensions.length - 1) {
                // Вершина угла — красный кружок
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(angleDim.x, angleDim.y, 2, 0, Math.PI * 2);
                ctx.fill();

                // Точка 1 — зелёный кружок
                ctx.fillStyle = '#44ff44';
                ctx.beginPath();
                ctx.arc(angleDim.x1, angleDim.y1, 2, 0, Math.PI * 2);
                ctx.fill();

                // Точка 2 — синий кружок
                ctx.fillStyle = '#4444ff';
                ctx.beginPath();
                ctx.arc(angleDim.x2, angleDim.y2, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // Текст размера (в середине дуги)
            // Вычисляем середину отрисованной дуги (меньшего угла)
            let midAngle = startAngle + angleSpan / 2;
            if (midAngle > Math.PI * 2) midAngle -= Math.PI * 2;

            // ═══════════════════════════════════════════════════════════
            // УЛУЧШЕННОЕ РАЗМЕЩЕНИЕ ТЕКСТА
            // ═══════════════════════════════════════════════════════════
            // Для малых углов (< 30°) выносим текст дальше от дуги
            // Для больших углов — ближе к дуге
            // angleSpan уже вычислен выше как размах меньшего угла
            const angleSpanDeg = angleSpan * 180 / Math.PI;
            const textOffset = angleSpanDeg < 30 ? radius + 25 : radius + 15;

            const textX = angleDim.x + Math.cos(midAngle) * textOffset;
            const textY = angleDim.y + Math.sin(midAngle) * textOffset;

            ctx.font = 'bold 30px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(angleDim.value + '°', textX, textY);
        });
    }

    // Обновляем UI
    updateObjectsList();
    updateStatusBar();

    // Рамка выделения
    if (isSelecting) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const screenStartX = (selectStart.x * zoom) + canvas.width / 2 + panX;
        const screenStartY = (selectStart.y * zoom) + canvas.height / 2 + panY;
        const screenEndX = (selectEnd.x * zoom) + canvas.width / 2 + panX;
        const screenEndY = (selectEnd.y * zoom) + canvas.height / 2 + panY;
        const width = screenEndX - screenStartX;
        const height = screenEndY - screenStartY;

        // v5.02: Shift+рамка — зелёная (deselect), обычная — синяя (select)
        const isShiftSel = typeof isShiftPressed !== 'undefined' && isShiftPressed;
        const fillColor = isShiftSel ? 'rgba(204, 50, 50, 0.15)' : 'rgba(0, 122, 204, 0.15)';
        const strokeColor = isShiftSel ? '#cc3232' : '#007acc';

        ctx.fillStyle = fillColor;
        ctx.fillRect(screenStartX, screenStartY, width, height);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(screenStartX, screenStartY, width, height);
        ctx.restore();
    }

    // Рисуем лист с раскладкой
    if (showSheetView) {
        drawSheet();
        // v4.56: Оверлей линейки — после drawSheet чтобы быть поверх
        if (window.RulerTool) {
            window.RulerTool.drawOverlay(ctx);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ТОЧЕК КАЛИБРОВКИ (ПОСЛЕ drawSheet чтобы были видны)
    // ═══════════════════════════════════════════════════════════
    if (isCalibrating) {
        ctx.save();
        // Не сбрасываем трансформации - рисуем в мировых координатах
        
        const pointRadius = 4 / zoom;

        // Точка 1 - синий крест
        if (calibratePoint1) {
            ctx.strokeStyle = '#00bfff';
            ctx.lineWidth = 3 / zoom;
            ctx.beginPath();
            ctx.arc(calibratePoint1.x, calibratePoint1.y, pointRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(calibratePoint1.x - pointRadius * 1.5, calibratePoint1.y);
            ctx.lineTo(calibratePoint1.x + pointRadius * 1.5, calibratePoint1.y);
            ctx.moveTo(calibratePoint1.x, calibratePoint1.y - pointRadius * 1.5);
            ctx.lineTo(calibratePoint1.x, calibratePoint1.y + pointRadius * 1.5);
            ctx.stroke();

            ctx.fillStyle = '#00bfff';
            ctx.font = `bold ${14 / zoom}px Segoe UI`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('1', calibratePoint1.x, calibratePoint1.y);
        }

        // Точка 2 - зелёный крест
        if (calibratePoint2) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3 / zoom;
            ctx.beginPath();
            ctx.arc(calibratePoint2.x, calibratePoint2.y, pointRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(calibratePoint2.x - pointRadius * 1.5, calibratePoint2.y);
            ctx.lineTo(calibratePoint2.x + pointRadius * 1.5, calibratePoint2.y);
            ctx.moveTo(calibratePoint2.x, calibratePoint2.y - pointRadius * 1.5);
            ctx.lineTo(calibratePoint2.x, calibratePoint2.y + pointRadius * 1.5);
            ctx.stroke();

            ctx.fillStyle = '#00ff00';
            ctx.font = `bold ${14 / zoom}px Segoe UI`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('2', calibratePoint2.x, calibratePoint2.y);
        }

        // Линия между точками
        if (calibratePoint1 && calibratePoint2) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([8 / zoom, 4 / zoom]);
            ctx.beginPath();
            ctx.moveTo(calibratePoint1.x, calibratePoint1.y);
            ctx.lineTo(calibratePoint2.x, calibratePoint2.y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Текст с расстоянием
            const dx = calibratePoint2.x - calibratePoint1.x;
            const dy = calibratePoint2.y - calibratePoint1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const midX = (calibratePoint1.x + calibratePoint2.x) / 2;
            const midY = (calibratePoint1.y + calibratePoint2.y) / 2;

            ctx.fillStyle = '#ffff00';
            ctx.font = `bold ${16 / zoom}px Segoe UI`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`${(dist || 0).toFixed(2)} px`, midX, midY - 10 / zoom);
        }

        ctx.restore();
    }

    // v4.47: ОТРИСОВКА ТОЧЕК ВЫРАВНИВАНИЯ (3-точечная калибровка)
    // Рисуем в мировых координатах (как точки калибровки) — БЕЗ дополнительной translate/scale,
    // т.к. основной рендер уже установил трансформацию.
    if (isCalibrating && window.isAlignMode) {
        ctx.save();
        const ar = 8 / zoom;  // radius

        // Точка 1 — красная (вершина = 0,0)
        if (window.alignPoint1) {
            ctx.fillStyle = '#ff6b6b';
            ctx.beginPath();
            ctx.arc(window.alignPoint1.x, window.alignPoint1.y, ar, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + (14 / zoom) + 'px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('1', window.alignPoint1.x, window.alignPoint1.y - ar * 1.5);
        }
        // Точка 2 — зелёная (ось Y)
        if (window.alignPoint2) {
            ctx.fillStyle = '#4ad97a';
            ctx.beginPath();
            ctx.arc(window.alignPoint2.x, window.alignPoint2.y, ar, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + (14 / zoom) + 'px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('2', window.alignPoint2.x, window.alignPoint2.y - ar * 1.5);
        }
        // Точка 3 — синяя (ось X)
        if (window.alignPoint3) {
            ctx.fillStyle = '#4a9ad9';
            ctx.beginPath();
            ctx.arc(window.alignPoint3.x, window.alignPoint3.y, ar, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold ' + (14 / zoom) + 'px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('3', window.alignPoint3.x, window.alignPoint3.y - ar * 1.5);
        }
        // Линии P1→P2 (зелёная) и P1→P3 (синяя)
        if (window.alignPoint1 && window.alignPoint2) {
            ctx.strokeStyle = '#4ad97a'; ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([6 / zoom, 3 / zoom]);
            ctx.beginPath();
            ctx.moveTo(window.alignPoint1.x, window.alignPoint1.y);
            ctx.lineTo(window.alignPoint2.x, window.alignPoint2.y);
            ctx.stroke();
        }
        if (window.alignPoint1 && window.alignPoint3) {
            ctx.strokeStyle = '#4a9ad9'; ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([6 / zoom, 3 / zoom]);
            ctx.beginPath();
            ctx.moveTo(window.alignPoint1.x, window.alignPoint1.y);
            ctx.lineTo(window.alignPoint3.x, window.alignPoint3.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════
    // ИНСТРУМЕНТ "УГОЛ" - ПОДСВЕТКА ТОЧЕК ПРИ НАВЕДЕНИИ
    // Рисуем ПОСЛЕ всего чтобы маркер был поверх всех объектов
    // ═══════════════════════════════════════════════════════════
    if (currentTool === 'angle' && snapEnabled && objects.length > 0 && window.mouseX !== undefined && window.mouseY !== undefined) {
        // Ищем ТОЛЬКО точки (без проекций на линии)
        const snap = window.findSnapPointOnly ? window.findSnapPointOnly(window.mouseX, window.mouseY) : null;
        
        // Проверка привязок
        if (snap && !window.lastHoveredSnap) {
            // Точка стала синей
        } else if (!snap && window.lastHoveredSnap) {
            // Точка вернулась к исходному цвету
        }
        window.lastHoveredSnap = snap;
        
        // Если нашли точку — рисуем синий маркер
        if (snap) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            // Синий маркер привязки
            ctx.fillStyle = '#00bfff';
            ctx.beginPath();
            const screenSnapX = snap.x * zoom + canvas.width / 2 + panX;
            const screenSnapY = snap.y * zoom + canvas.height / 2 + panY;
            ctx.arc(screenSnapX, screenSnapY, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Контур
            ctx.strokeStyle = '#1e1e1e';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.restore();
        }
    }

    // Подсказка режима калибровки (на основном холсте)
    if (isCalibrating) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        ctx.fillStyle = 'rgba(0, 122, 204, 0.9)';
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let hint = '📏 РЕЖИМ КАЛИБРОВКИ: ';
        if (!calibratePoint1) {
            hint += 'Кликните первую точку на фото';
        } else if (!calibratePoint2) {
            hint += 'Кликните вторую точку на фото';
        } else {
            hint += 'Введите размер в диалоге и нажмите "Применить"';
        }

        ctx.fillText(hint, 10, canvas.height - 40);
        ctx.restore();
    }

    // Рамка выделения на листе
    if (showSheetView && isSheetSelecting && sheetSelectStart && sheetSelectEnd) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const sheetMargin = 50;
        const baseSheetW = Math.min(sheetSize.width / 3, 400);
        const baseSheetH = baseSheetW * sheetSize.height / sheetSize.width;
        const sheetW = baseSheetW * sheetZoom;
        const sheetH = baseSheetH * sheetZoom;
        const sheetX = canvas.width - sheetW - sheetMargin + sheetPanX;
        const sheetY = sheetMargin + sheetPanY;

        const scaleX = sheetW / sheetSize.width;
        const scaleY = sheetH / sheetSize.height;

        const x1 = (Math.min(sheetSelectStart.x, sheetSelectEnd.x) * scaleX) + sheetX;
        const y1 = (Math.min(sheetSelectStart.y, sheetSelectEnd.y) * scaleY) + sheetY;
        const w = Math.abs((sheetSelectEnd.x - sheetSelectStart.x) * scaleX);
        const h = Math.abs((sheetSelectEnd.y - sheetSelectStart.y) * scaleY);

        ctx.fillStyle = 'rgba(0, 122, 204, 0.2)';
        ctx.fillRect(x1, y1, w, h);

        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x1, y1, w, h);
        ctx.setLineDash([]);

        ctx.restore();
    }

    // ═══════════════════════════════════════════════════════════════
    // v4.80: ПРЕВЬЮ ПАТТЕРНОВ НА ХОЛСТЕ (canvas mode)
    // ═══════════════════════════════════════════════════════════════
    if (window.rectPatternDragging && window.rectPatternIsSheetMode === false && window.rectPatternStartPoint && window.rectPatternEndPoint) {
        const sp = window.rectPatternStartPoint;
        const ep = window.rectPatternEndPoint;
        const count = window.rectPatternCount || 4;
        let cols = Math.ceil(Math.sqrt(count));
        let rows = Math.ceil(count / cols);
        while (cols * (rows - 1) >= count && rows > 1) rows--;
        const stepX = window.rectPatternStepX || 50;
        const stepY = window.rectPatternStepY || 50;
        const sources = window.rectPatternSources || [];

        // Пунктирная рамка области (start → end)
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([10 / zoom, 6 / zoom]);
        const minX = Math.min(sp.x, ep.x), minY = Math.min(sp.y, ep.y);
        const w = Math.abs(ep.x - sp.x), h = Math.abs(ep.y - sp.y);
        ctx.strokeRect(minX, minY, w, h);
        ctx.setLineDash([]);

        // Маркер центра
        ctx.fillStyle = '#00ddff';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 5 / zoom, 0, 2 * Math.PI);
        ctx.fill();

        // Метка с количеством
        const midX = (sp.x + ep.x) / 2;
        const midY = (sp.y + ep.y) / 2;
        const label = `📐 ${count} шт (${cols}×${rows}) ↑↓`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `bold ${14 / zoom}px Segoe UI`;
        const lw = ctx.measureText(label).width + 20 / zoom;
        ctx.fillRect(midX - lw / 2, midY - 35 / zoom, lw, 28 / zoom);
        ctx.fillStyle = '#00ddff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY - 21 / zoom);
        ctx.fillStyle = '#888';
        ctx.font = `${10 / zoom}px Segoe UI`;
        ctx.fillText('↑↓ кол-во, клик — применить', midX, midY + 14 / zoom);
        ctx.fillText(`шаг: ${stepX}×${stepY}мм`, midX, midY + 26 / zoom);

        // Превью призрачных копий (bbox каждого объекта по сетке)
        // v2.5: используем clonePatternObject + movePatternObject для всех типов
        // v2.9: используем groupCenter для позиционирования (как circ pattern)
        const groupCenter = window.rectPatternGroupCenter || sp;
        if (sources.length > 0) {
            ctx.strokeStyle = 'rgba(0, 221, 255, 0.5)';
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([5 / zoom, 3 / zoom]);
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    if (col === 0 && row === 0) continue;
                    if (row * cols + col >= count) break;
                    const dx = col * stepX;
                    const dy = row * stepY;
                    for (const src of sources) {
                        // v2.5: клонируем через clonePatternObject (поддерживает spline/ellipse)
                        const copy = (typeof window.clonePatternObject === 'function')
                            ? window.clonePatternObject(src)
                            : ((typeof src.clone === 'function') ? src.clone() : null);
                        if (copy && typeof copy.draw === 'function') {
                            // v2.9: сдвиг = (sp - groupCenter) + (dx, dy)
                            // movePatternObject от src.center к целевой позиции
                            const srcC = src.center || { x: src.cx || src.x || 0, y: src.cy || src.y || 0 };
                            const relX = srcC.x - groupCenter.x;
                            const relY = srcC.y - groupCenter.y;
                            const targetX = sp.x + relX + dx;
                            const targetY = sp.y + relY + dy;
                            if (typeof window.movePatternObject === 'function') {
                                window.movePatternObject(copy, targetX - srcC.x, targetY - srcC.y);
                            } else if (typeof copy.move === 'function') {
                                copy.move(targetX - srcC.x, targetY - srcC.y);
                            }
                            ctx.save();
                            ctx.strokeStyle = 'rgba(0, 221, 255, 0.5)';
                            ctx.lineWidth = 1.5 / zoom;
                            copy.draw(ctx);
                            ctx.restore();
                        } else {
                            // Fallback: bbox рамка
                            const c = src.center || { x: src.cx || src.x || 0, y: src.cy || src.y || 0 };
                            const relX = c.x - groupCenter.x;
                            const relY = c.y - groupCenter.y;
                            const targetX = sp.x + relX + dx;
                            const targetY = sp.y + relY + dy;
                            ctx.strokeRect(targetX - 10, targetY - 10, 20, 20);
                        }
                    }
                }
            }
            ctx.setLineDash([]);
        }
    }

    // v2.9: ПРЕВЬЮ rectPattern WaitCenter на холсте
    if (window.rectPatternWaitCenter && window.rectPatternIsSheetMode === false) {
        const count = window.rectPatternCount || 4;
        const label = `📐 Кликните для первого угла прямоугольника\n${count} шт — Esc отмена`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `bold ${13 / zoom}px Segoe UI`;
        const lines = label.split('\n');
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const padX = 12 / zoom, padY = 8 / zoom;
        const labelX = -canvas.width / 2 / zoom + 10 / zoom;
        const labelY = -canvas.height / 2 / zoom + 10 / zoom;
        ctx.fillRect(labelX, labelY, maxW + padX * 2, lines.length * 18 / zoom + padY * 2);
        ctx.fillStyle = '#00ddff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, labelX + padX, labelY + padY + i * 18 / zoom));
    }

    // v2.6: ПРЕВЬЮ WaitCenter на холсте
    if (window.circPatternWaitCenter && window.circPatternIsSheetMode === false) {
        const count = window.circPatternCount || 6;
        const arcAngleDeg = window.circPatternArcAngle || 360;
        const label = `⭕ Кликните для центра окружности\n${count} шт, ${arcAngleDeg}° — Esc отмена`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `bold ${13 / zoom}px Segoe UI`;
        const lines = label.split('\n');
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
        const padX = 12 / zoom, padY = 8 / zoom;
        const labelX = -canvas.width / 2 / zoom + 10 / zoom;
        const labelY = -canvas.height / 2 / zoom + 10 / zoom;
        ctx.fillRect(labelX, labelY, maxW + padX * 2, lines.length * 18 / zoom + padY * 2);
        ctx.fillStyle = '#00ddff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((l, i) => ctx.fillText(l, labelX + padX, labelY + padY + i * 18 / zoom));
    }

    if (window.circPatternDragging && window.circPatternIsSheetMode === false && window.circPatternCenter && window.circPatternEndPoint) {
        const center = window.circPatternCenter;
        const ep = window.circPatternEndPoint;
        const radius = window.circPatternRadius || 50;
        const count = window.circPatternCount || 6;
        const arcAngleDeg = window.circPatternArcAngle || 360;  // v2.3: из prompt
        const startAngle = window.circPatternStartAngle || 0;   // v2.3: из мыши
        const sources = window.circPatternSources || [];

        // Окружность паттерна
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([10 / zoom, 6 / zoom]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);

        // Маркер центра
        ctx.fillStyle = '#00ddff';
        ctx.beginPath();
        ctx.arc(center.x, center.y, 5 / zoom, 0, 2 * Math.PI);
        ctx.fill();

        // Линия от центра к курсору (показывает startAngle)
        ctx.strokeStyle = '#00ddff';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(ep.x, ep.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Метка
        const midX = (center.x + ep.x) / 2;
        const midY = (center.y + ep.y) / 2;
        const label = `⭕ ${count} шт, R=${radius.toFixed(0)}мм, ${arcAngleDeg}°`;
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.font = `bold ${13 / zoom}px Segoe UI`;
        const lw = ctx.measureText(label).width + 20 / zoom;
        ctx.fillRect(midX - lw / 2, midY - 35 / zoom, lw, 28 / zoom);
        ctx.fillStyle = '#00ddff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY - 21 / zoom);
        ctx.fillStyle = '#888';
        ctx.font = `${10 / zoom}px Segoe UI`;
        ctx.fillText('↑↓ кол-во, ←→ дуга, клик — применить', midX, midY + 14 / zoom);

        // Превью призрачных копий по дуге (с учётом startAngle)
        // v2.4: показываем ВСЕ позиции включая i=0 (на курсоре)
        // v2.5: clonePatternObject + movePatternObject для всех типов
        // v2.7: relX/relY от groupCenter (центр выделения), НЕ от center (клик)
        const groupCenter = window.circPatternGroupCenter || center;
        if (sources.length > 0) {
            const angleStep = (arcAngleDeg * Math.PI / 180) / (arcAngleDeg === 360 ? count : (count - 1 || 1));
            for (let i = 0; i < count; i++) {
                const angleRad = startAngle + i * angleStep;
                const cos = Math.cos(angleRad);
                const sin = Math.sin(angleRad);
                for (const src of sources) {
                    // v2.5: клонируем через clonePatternObject (поддерживает spline/ellipse)
                    const copy = (typeof window.clonePatternObject === 'function')
                        ? window.clonePatternObject(src)
                        : ((typeof src.clone === 'function') ? src.clone() : null);
                    if (copy && typeof copy.draw === 'function') {
                        const srcC = src.center || { x: src.cx || src.x || 0, y: src.cy || src.y || 0 };
                        // v2.7: смещение от groupCenter + radius → объект на окружности
                        const relX = srcC.x - groupCenter.x + radius;
                        const relY = srcC.y - groupCenter.y;
                        const rotX = relX * cos - relY * sin;
                        const rotY = relX * sin + relY * cos;
                        const targetX = center.x + rotX;
                        const targetY = center.y + rotY;
                        // v2.5: movePatternObject (поддерживает все типы)
                        if (typeof window.movePatternObject === 'function') {
                            window.movePatternObject(copy, targetX - srcC.x, targetY - srcC.y);
                        } else if (typeof copy.move === 'function') {
                            copy.move(targetX - srcC.x, targetY - srcC.y);
                        }
                        ctx.save();
                        ctx.strokeStyle = 'rgba(0, 221, 255, 0.5)';
                        ctx.lineWidth = 1.5 / zoom;
                        copy.draw(ctx);
                        ctx.restore();
                    } else {
                        const srcC = src.center || { x: src.cx || src.x || 0, y: src.cy || src.y || 0 };
                        // v2.7: смещение от groupCenter + radius
                        const relX = srcC.x - groupCenter.x + radius;
                        const relY = srcC.y - groupCenter.y;
                        const rotX = relX * cos - relY * sin;
                        const rotY = relX * sin + relY * cos;
                        const targetX = center.x + rotX;
                        const targetY = center.y + rotY;
                        ctx.strokeStyle = 'rgba(0, 221, 255, 0.5)';
                        ctx.lineWidth = 1.5 / zoom;
                        ctx.setLineDash([5 / zoom, 3 / zoom]);
                        ctx.strokeRect(targetX - 10, targetY - 10, 20, 20);
                        ctx.setLineDash([]);
                    }
                }
            }
        }
    }

    ctx.restore();
    ctx.restore();

    // v4.60: Отрисовка расстояний от центра окружности до объектов
    if (typeof _circleDistOverlay !== 'undefined' && _circleDistOverlay) {
        const o = _circleDistOverlay;
        ctx.save();
        ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
        ctx.scale(zoom, zoom);
        ctx.strokeStyle = '#ffd700';
        ctx.fillStyle = '#ffd700';
        ctx.lineWidth = 1 / zoom;
        ctx.font = `${12 / zoom}px Segoe UI`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Верх — от центра до точки на объекте сверху
        if (o.topDist < Infinity && o.topY !== null) {
            ctx.beginPath();
            ctx.setLineDash([3 / zoom, 2 / zoom]);
            ctx.moveTo(o.cx, o.topY);
            ctx.lineTo(o.cx, o.cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillText(`${o.topDist.toFixed(1)}`, o.cx, (o.topY + o.cy) / 2);
        }
        // Низ — от центра до точки на объекте снизу
        if (o.bottomDist < Infinity && o.bottomY !== null) {
            ctx.beginPath();
            ctx.setLineDash([3 / zoom, 2 / zoom]);
            ctx.moveTo(o.cx, o.cy);
            ctx.lineTo(o.cx, o.bottomY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillText(`${o.bottomDist.toFixed(1)}`, o.cx, (o.cy + o.bottomY) / 2);
        }
        // Лево — от центра до точки на объекте слева
        if (o.leftDist < Infinity && o.leftX !== null) {
            ctx.beginPath();
            ctx.setLineDash([3 / zoom, 2 / zoom]);
            ctx.moveTo(o.leftX, o.cy);
            ctx.lineTo(o.cx, o.cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.save();
            ctx.translate((o.leftX + o.cx) / 2, o.cy);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${o.leftDist.toFixed(1)}`, 0, 0);
            ctx.restore();
        }
        // Право — от центра до точки на объекте справа
        if (o.rightDist < Infinity && o.rightX !== null) {
            ctx.beginPath();
            ctx.setLineDash([3 / zoom, 2 / zoom]);
            ctx.moveTo(o.cx, o.cy);
            ctx.lineTo(o.rightX, o.cy);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.save();
            ctx.translate((o.cx + o.rightX) / 2, o.cy);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(`${o.rightDist.toFixed(1)}`, 0, 0);
            ctx.restore();
        }

        ctx.restore();
    }
}
// ═══════════════════════════════════════════════════════════════
// При перетаскивании окружности показывает расстояния от её центра
// до ближайших объектов (линий, прямоугольников, других окружностей)
// в 4 направлениях: верх, низ, лево, право.
// ═══════════════════════════════════════════════════════════════

window.showCircleDistances = function(circle) {
    if (!circle || circle.type !== 'circle') return;

    const cx = circle.cx;
    const cy = circle.cy;

    // v4.60 FIX: Ищем ближайшие объекты по ОСЯМ.
    // topY = наибольший Y среди точек где Y < cy (ближайший сверху)
    // bottomY = наименьший Y среди точек где Y > cy (ближайший снизу)
    // leftX = наибольший X среди точек где X < cx (ближайший слева)
    // rightX = наименьший X среди точек где X > cx (ближайший справа)
    let topY = -Infinity, bottomY = Infinity, leftX = -Infinity, rightX = Infinity;

    for (const obj of objects) {
        if (!obj || obj === circle) continue;

        let points = [];
        if (obj.type === 'line') {
            points = [{x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2}];
        } else if (obj.type === 'rect') {
            points = [
                {x: obj.x, y: obj.y},
                {x: obj.x + obj.width, y: obj.y},
                {x: obj.x + obj.width, y: obj.y + obj.height},
                {x: obj.x, y: obj.y + obj.height}
            ];
        } else if (obj.type === 'circle') {
            if (obj.cy + obj.radius < cy) points.push({x: obj.cx, y: obj.cy + obj.radius});
            if (obj.cy - obj.radius > cy) points.push({x: obj.cx, y: obj.cy - obj.radius});
            if (obj.cx + obj.radius < cx) points.push({x: obj.cx + obj.radius, y: obj.cy});
            if (obj.cx - obj.radius > cx) points.push({x: obj.cx - obj.radius, y: obj.cy});
        } else if (typeof obj.getPoints === 'function') {
            points = obj.getPoints();
        }

        for (const pt of points) {
            if (pt.y < cy && pt.y > topY) topY = pt.y;       // ближайший сверху
            if (pt.y > cy && pt.y < bottomY) bottomY = pt.y;  // ближайший снизу
            if (pt.x < cx && pt.x > leftX) leftX = pt.x;       // ближайший слева
            if (pt.x > cx && pt.x < rightX) rightX = pt.x;     // ближайший справа
        }
    }

    _circleDistOverlay = {
        cx, cy,
        topDist: topY > -Infinity ? cy - topY : null,
        topY: topY > -Infinity ? topY : null,
        bottomDist: bottomY < Infinity ? bottomY - cy : null,
        bottomY: bottomY < Infinity ? bottomY : null,
        leftDist: leftX > -Infinity ? cx - leftX : null,
        leftX: leftX > -Infinity ? leftX : null,
        rightDist: rightX < Infinity ? rightX - cx : null,
        rightX: rightX < Infinity ? rightX : null
    };
};

window.hideCircleDistances = function() {
    _circleDistOverlay = null;
};

// Функция: расстояние от точки до отрезка
function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
}
