// i: SilikinK Project
// ═══════════════════════════════════════════════════════════════
// ФУНКЦИИ ОТРИСОВКИ (RENDER)
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

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
        } else if (obj.type === 'circle') {
            ctx.arc(obj.cx, obj.cy, obj.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else if (obj.type === 'rect') {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
        } else if (obj.type === 'polygon') {
            const vertices = obj.getVertices ? obj.getVertices() : [];
            if (vertices.length > 0) {
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let i = 1; i < vertices.length; i++) {
                    ctx.lineTo(vertices[i].x, vertices[i].y);
                }
                ctx.closePath();
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
    const isRemnant = sheetRemnant && sheetRemnant.outerContour && sheetRemnant.outerContour.length > 0;

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
            } else if (obj.type === 'circle') {
                ctx.arc(offsetX + obj.cx * scaleX, offsetY + obj.cy * scaleY, obj.radius * scaleX, 0, Math.PI * 2);
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
                    } else if (obj.type === 'circle') {
                        ctx.arc(offsetX + obj.cx * scaleX, offsetY + obj.cy * scaleY, obj.radius * scaleX, 0, Math.PI * 2);
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
        const size = sheetRemnant.size;
        sheetLabel = t('sheet_info_top_remnant', {
            width: Math.round(size.width),
            height: Math.round(size.height),
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

    // Цвета для разных деталей (по ID)
    const partColors = {};
    const baseColors = ['#00ff00', '#00bfff', '#ff69b4', '#ffd700', '#ff6347', '#9370db', '#3cb371', '#ffa500', '#20b2aa', '#da70d6'];

    // Рисуем размещённые детали
    nestedParts.forEach((nested, idx) => {
        const part = parts.find(p => p.id === nested.partId);
        if (!part) return;

        // Присваиваем цвет детали по ID
        if (!partColors[part.id]) {
            partColors[part.id] = baseColors[Object.keys(partColors).length % baseColors.length];
        }
        const partColor = partColors[part.id];

        // Позиция на листе (рамка уже смещена)
        const drawX = sheetX + nested.x * scaleX;
        const drawY = sheetY + nested.y * scaleY;
        // Для bounding box используем размеры повёрнутой детали
        const w = nested.width * scaleX;
        const h = nested.height * scaleY;
        // Для подписи используем исходные размеры
        const labelWidth = nested.baseWidth || nested.width;
        const labelHeight = nested.baseHeight || nested.height;

        // part уже найден выше в цикле

        // Рисуем деталь через объекты с поворотом (реальная геометрия)
        // Используем nested.objects если есть (после отражения), иначе part.objects
        const objectsToDraw = nested.objects && nested.objects.length > 0 ? nested.objects : part.objects;

        if (objectsToDraw && objectsToDraw.length > 0) {
            ctx.strokeStyle = partColor;
            ctx.lineWidth = 1;
            ctx.beginPath();

            // Получаем угол поворота (в радианах)
            const rotationAngle = nested.angle || 0;

            // Вращение вокруг центра ИСХОДНОГО bounding box
            const bboxWidth = nested.baseWidth || nested.width;
            const bboxHeight = nested.baseHeight || nested.height;
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
            const partBbox = part.bounds;
            const normOffsetX = partBbox.minX || 0;
            const normOffsetY = partBbox.minY || 0;
            
            objectsToDraw.forEach(obj => {
                if (obj.type === 'line') {
                    const p1 = rotatePoint(obj.x1 - normOffsetX, obj.y1 - normOffsetY, rotationAngle, centerX, centerY);
                    const p2 = rotatePoint(obj.x2 - normOffsetX, obj.y2 - normOffsetY, rotationAngle, centerX, centerY);
                    ctx.beginPath();
                    ctx.moveTo(drawX + (p1.x - refPoint.x) * scaleX, drawY + (p1.y - refPoint.y) * scaleY);
                    ctx.lineTo(drawX + (p2.x - refPoint.x) * scaleX, drawY + (p2.y - refPoint.y) * scaleY);
                    ctx.stroke();
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
                    ctx.arc(
                        drawX + (rotatedCenter.x - refPoint.x) * scaleX,
                        drawY + (rotatedCenter.y - refPoint.y) * scaleY,
                        obj.radius * scaleX,
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
                    ctx.fillStyle = partColor;
                    ctx.font = `${(obj.fontSize || 14) * scaleX}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(obj.text || '', 0, 0);
    ctx.restore();
}
            });
    
            // Номер детали вдоль длинной стороны bounding box
            const centerXBox = drawX + w / 2;
            const centerYBox = drawY + h / 2;
            const partName = part?.name || `#${nested.partId}`;
            
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = partColor;
            
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
            ctx.strokeStyle = partColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(drawX, drawY, w, h);

            // Номер детали вдоль длинной стороны bounding box
            const centerXBox = drawX + w / 2;
            const centerYBox = drawY + h / 2;
            const partName = part?.name || `#${nested.partId}`;
            
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = partColor;
            
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
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(drawX - 2, drawY - 2, w + 4, h + 4);
        }
    });

    // ═══════════════════════════════════════════════════════════
    // ОТОБРАЖЕНИЕ СВОБОДНОГО МЕСТА (ОСТАТКА) НА ЛИСТЕ
    // ═══════════════════════════════════════════════════════════
    if (nestedParts.length > 0) {
        // Находим максимальные координаты размещённых деталей
        let maxX = 0, maxY = 0;
        nestedParts.forEach(nested => {
            const rightEdge = nested.x + nested.width;
            const bottomEdge = nested.y + nested.height;
            if (rightEdge > maxX) maxX = rightEdge;
            if (bottomEdge > maxY) maxY = bottomEdge;
        });

        // Вычисляем размеры остатка
        const remainingWidth = sheetSize.width - maxX;
        const remainingHeight = sheetSize.height - maxY;

        // Координаты в экранных координатах
        const cornerX = sheetX + maxX * scaleX;
        const cornerY = sheetY + maxY * scaleY;
        const sheetRightX = sheetX + sheetW;
        const sheetBottomY = sheetY + sheetH;

        // Рисуем линии только если есть свободное место
        if (remainingWidth > 50 || remainingHeight > 50) {
            ctx.strokeStyle = '#FFA500';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);

            // Горизонтальная линия (остаток снизу)
            if (remainingHeight > 50) {
                ctx.beginPath();
                ctx.moveTo(sheetX, cornerY);
                ctx.lineTo(sheetRightX, cornerY);
                ctx.stroke();

                // Размер (высота остатка снизу) - вертикально у левого края
                ctx.save();
                ctx.translate(sheetX + 20, cornerY + (sheetBottomY - cornerY) / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillStyle = '#FFA500';
                ctx.font = 'bold 11px Segoe UI';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(
                    Math.round(remainingHeight).toString() + ' мм',
                    0,
                    0
                );
                ctx.restore();
            }

            // Вертикальная линия (остаток справа)
            if (remainingWidth > 50) {
                ctx.beginPath();
                ctx.moveTo(cornerX, cornerY);
                ctx.lineTo(cornerX, cornerY + remainingHeight * scaleY);
                ctx.stroke();

                // Размер (ширина остатка справа) - горизонтально внутри листа
                ctx.fillStyle = '#FFA500';
                ctx.font = 'bold 11px Segoe UI';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(
                    Math.round(remainingWidth).toString() + ' мм',
                    sheetRightX - 10,
                    cornerY - 12
                );
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ПРЯМОУГОЛЬНИКОВ РАЗМЕТКИ
    // ═══════════════════════════════════════════════════════════
    // Используем window.markupRects для доступа к глобальной переменной
    const rectsToDraw = window.markupRects || markupRects || [];
    rectsToDraw.forEach((rect, idx) => {
        const drawX = sheetX + rect.x * scaleX;
        const drawY = sheetY + rect.y * scaleY;
        const drawW = rect.width * scaleX;
        const drawH = rect.height * scaleY;

        // Оранжевый контур
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        // Размеры внутри прямоугольника
        ctx.fillStyle = '#FFA500';
        ctx.font = 'bold 11px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Ширина
        if (drawW > 60) {
            ctx.fillText(
                Math.round(rect.width).toString(),
                drawX + drawW / 2,
                drawY + drawH / 2 - 10
            );
        }

        // Высота
        if (drawH > 40) {
            ctx.fillText(
                Math.round(rect.height).toString(),
                drawX + drawW / 2,
                drawY + drawH / 2 + 10
            );
        }

        // Выделение выделенного прямоугольника
        if (idx === selectedRectIndex) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 3]);
            ctx.strokeRect(drawX - 2, drawY - 2, drawW + 4, drawH + 4);
            ctx.setLineDash([]);
        }
    });

    // Рисуем текущий прямоугольник в процессе рисования
    if (currentRect) {
        const drawX = sheetX + currentRect.x * scaleX;
        const drawY = sheetY + currentRect.y * scaleY;
        const drawW = Math.abs(currentRect.width * scaleX);
        const drawH = Math.abs(currentRect.height * scaleY);

        // Оранжевый контур
        ctx.strokeStyle = '#FFA500';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(drawX, drawY, drawW, drawH);

        // Размеры
        ctx.fillStyle = '#FFA500';
        ctx.font = 'bold 11px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const w = Math.abs(currentRect.width);
        const h = Math.abs(currentRect.height);

        if (drawW > 60) {
            ctx.fillText(
                Math.round(w).toString(),
                drawX + drawW / 2,
                drawY + drawH / 2 - 10
            );
        }

        if (drawH > 40) {
            ctx.fillText(
                Math.round(h).toString(),
                drawX + drawW / 2,
                drawY + drawH / 2 + 10
            );
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
        ctx.fillText(`✂️ Y=${Math.round(cutLine.y)} мм`, centerX, lineY - 12);
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
        ctx.fillText(`${Math.round(distance)} мм`, midX, midY - 10);
    }

    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ ОТРИСОВКИ ХОЛСТА
// ═══════════════════════════════════════════════════════════════
// render() - основная отрисовка всего холста
// Вызывается после каждого изменения (перемещение, рисование, зум)

window.render = function render() {
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Сохраняем контекст и применяем трансформации
    ctx.save();
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);

    drawGrid();
    drawAxes();

    // ═══════════════════════════════════════════════════════════
    // ОТРИСОВКА ФОТО-ФОНА ОСТАТКА
    // ═══════════════════════════════════════════════════════════
    // Рисуем фото на ОСНОВНОМ холсте во время калибровки
    if (sheetBackgroundImage && isCalibrating) {
        const imgWidth = sheetBackgroundImage.width / sheetImageScale;
        const imgHeight = sheetBackgroundImage.height / sheetImageScale;

        ctx.save();
        ctx.globalAlpha = 0.8; // Полупрозрачность чтобы видеть точки
        ctx.drawImage(sheetBackgroundImage, 0, 0, imgWidth, imgHeight);
        ctx.restore();
    }
    // Рисуем фото в миниатюре листа (когда НЕ калибруем)
    else if (sheetBackgroundImage && showSheetView && !isCalibrating) {
        const imgWidth = sheetBackgroundImage.width / sheetImageScale;
        const imgHeight = sheetBackgroundImage.height / sheetImageScale;

        ctx.save();
        ctx.globalAlpha = 0.7; // Полупрозрачность чтобы видеть контуры
        ctx.drawImage(sheetBackgroundImage, 0, 0, imgWidth, imgHeight);
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
    objects.forEach(obj => {
        // Защитная проверка: пропускаем объекты без метода draw
        if (!obj || typeof obj.draw !== 'function') {
            console.warn('⚠️ Пропущен объект без метода draw:', obj);
            return;
        }
        const isSelected = selectedObjects.includes(obj);
        if (obj.type === 'text') {
            obj.draw(ctx, isSelected);
        } else {
            ctx.strokeStyle = isSelected ? '#007acc' : '#fff';
            ctx.lineWidth = isSelected ? 3 / zoom : 2 / zoom;
            obj.draw(ctx);
        }
    });

    // Рисуем точки привязки
    if (objects.length > 0) {
        const lineEndpoints = [];
        for (const obj of objects) {
            if (obj.type === 'line') {
                lineEndpoints.push({ x: obj.x1, y: obj.y1, obj: obj, type: 'start' });
                lineEndpoints.push({ x: obj.x2, y: obj.y2, obj: obj, type: 'end' });
            }
        }

        // Находим несоединённые точки
        const CONNECTION_TOLERANCE = 0.5;
        const unconnectedPoints = [];

        for (let i = 0; i < lineEndpoints.length; i++) {
            const point = lineEndpoints[i];
            let isConnected = false;

            for (let j = 0; j < lineEndpoints.length; j++) {
                if (i === j) continue;
                const other = lineEndpoints[j];
                const dist = Math.sqrt(Math.pow(point.x - other.x, 2) + Math.pow(point.y - other.y, 2));
                if (dist < CONNECTION_TOLERANCE) {
                    isConnected = true;
                    break;
                }
            }

            if (!isConnected) {
                unconnectedPoints.push(point);
            }
        }

        // Рисуем все точки привязки
        objects.forEach(obj => {
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
    // Подсветка точки при наведении (hover) для инструментов "Выбор", "Размер", "Угол" и "Линия"
    if (hoveredPoint && !draggedPoint && (currentTool === 'select' || currentTool === 'dimension' || currentTool === 'angle' || currentTool === 'line')) {
        ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';  // Зелёный цвет
        ctx.beginPath();
        ctx.arc(hoveredPoint.point.x, hoveredPoint.point.y, 4 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
    }

    // Подсветка центра координат (0, 0) при наведении
    if ((currentTool === 'select' || currentTool === 'dimension' || currentTool === 'angle' || currentTool === 'line') && !hoveredPoint) {
        // Проверяем расстояние от курсора до центра координат
        // Получаем координаты мыши из последнего события mousemove
        const mouseWorldX = (window.lastMouseX - panX - canvas.width / 2) / zoom;
        const mouseWorldY = (window.lastMouseY - panY - canvas.height / 2) / zoom;
        const distToOrigin = Math.sqrt(Math.pow(mouseWorldX, 2) + Math.pow(mouseWorldY, 2));
        const originHoverRadius = 8 / zoom; // Радиус наведения на центр
        
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
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2 / zoom;
        currentShape.draw(ctx);
    }

    // Рисуем привязку
    if (snapPoint && isDrawing) {
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
        ctx.arc(snapPoint.x, snapPoint.y, 3 / zoom, 0, Math.PI * 2);
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
        ctx.font = 'bold 14px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(edge.length), edge.midX, edge.midY - 10);
    }

    // Отрисовка размерных линий
    if (dimensionLines.length > 0) {
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.font = '12px Segoe UI';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        dimensionLines.forEach((dim, idx) => {
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
            // Логируем только при первом появлении
            console.log('🎨 [RENDER] Отрисовка угловых размеров:', angleDimensions.length, 'шт.');
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

            // Нормализуем углы для правильной отрисовки дуги
            if (endAngle < startAngle) {
                endAngle += Math.PI * 2;
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
            const midAngle = (startAngle + endAngle) / 2;

            // ═══════════════════════════════════════════════════════════
            // УЛУЧШЕННОЕ РАЗМЕЩЕНИЕ ТЕКСТА
            // ═══════════════════════════════════════════════════════════
            // Для малых углов (< 30°) выносим текст дальше от дуги
            // Для больших углов — ближе к дуге
            // Вычисляем размах угла из startAngle и endAngle
            let angleSpan = Math.abs(endAngle - startAngle);
            if (angleSpan > Math.PI) angleSpan = Math.PI * 2 - angleSpan;
            const angleSpanDeg = angleSpan * 180 / Math.PI;
            const textOffset = angleSpanDeg < 30 ? radius + 25 : radius + 15;

            const textX = angleDim.x + Math.cos(midAngle) * textOffset;
            const textY = angleDim.y + Math.sin(midAngle) * textOffset;

            ctx.font = 'bold 12px Segoe UI';
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

        ctx.fillStyle = 'rgba(0, 122, 204, 0.2)';
        ctx.fillRect(screenStartX, screenStartY, width, height);
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(screenStartX, screenStartY, width, height);
        ctx.restore();
    }

    // Рисуем лист с раскладкой
    if (showSheetView) {
        drawSheet();
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
            ctx.fillText(`${Math.round(dist)} px`, midX, midY - 10 / zoom);
    }

    // ═══════════════════════════════════════════════════════════
    // ИНСТРУМЕНТ "УГОЛ" - ПОДСВЕТКА ТОЧЕК ПРИ НАВЕДЕНИИ
    // Рисуем ПОСЛЕ всего чтобы маркер был поверх всех объектов
    // ═══════════════════════════════════════════════════════════
    if (currentTool === 'angle' && snapEnabled && objects.length > 0 && window.mouseX !== undefined && window.mouseY !== undefined) {
        // Ищем ТОЛЬКО точки (без проекций на линии)
        const snap = window.findSnapPointOnly ? window.findSnapPointOnly(window.mouseX, window.mouseY) : null;
        
        // Логирование
        if (snap && !window.lastHoveredSnap) {
            console.log('🔵 [render.js] Точка стала СИНИЕЙ:', `(${snap.x.toFixed(1)}, ${snap.y.toFixed(1)})`, `тип=${snap.type}`);
        } else if (!snap && window.lastHoveredSnap) {
            console.log('🔴 [render.js] Точка вернулась к ИСХОДНОМУ цвету:', `(${window.lastHoveredSnap.x.toFixed(1)}, ${window.lastHoveredSnap.y.toFixed(1)})`);
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

    ctx.restore();
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

    ctx.restore();
}
