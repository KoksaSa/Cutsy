// ═══════════════════════════════════════════════════════════════
// PDF REPORT EXPORT
// Экспорт отчёта по раскладке деталей в PDF
//
// ИСПРАВЛЕНО:
// - Дуги (arc): учитывается direction для SVG sweep-flag
// - Дуги (arc): ?? вместо || для startAngle/endAngle (0 — валидный угол)
// - Дуги (arc): корректный расчёт sweepAngle для CCW-дуг (direction < 0)
// ═══════════════════════════════════════════════════════════════

/**
 * Генерация SVG-миниатюры детали
 * @param {Object} part - Объект детали
 * @param {number} width - Ширина миниатюры
 * @param {number} height - Высота миниатюры
 * @param {Array} parts - Массив деталей (для совместимости)
 * @returns {string} SVG строка
 */
function generatePartThumbnail(part, width, height, parts) {
    if (!part || !part.objects || part.objects.length === 0) return '';

    const bounds = part.bounds;
    const pad = Math.max(bounds.width, bounds.height) * 0.1;
    const vw = bounds.width + pad * 2;
    const vh = bounds.height + pad * 2;
    const scale = Math.min(width / vw, height / vh);
    const ox = (width - vw * scale) / 2;
    const oy = (height - vh * scale) / 2;

    const colors = ['#4a90d9','#d94a4a','#4ad97a','#d9c44a','#9a4ad9','#4ad9c4','#d97a4a','#4a7ad9','#d94a9a','#7ad94a'];
    const colorIndex = Math.abs(parseInt(part.id) % colors.length);
    const stroke = colors[colorIndex];

    // ═══════════════════════════════════════════════════════════════
    // ПРОПОРЦИОНАЛЬНОЕ МАСШТАБИРОВАНИЕ ТОЛЩИНЫ ЛИНИЙ И ШРИФТОВ
    // Толщина линий привязана к viewport (width/height), а не фиксирована
    // ═══════════════════════════════════════════════════════════════
    const sw = Math.max(0.6, Math.min(1.5, Math.max(width, height) * 0.012));
    const dimSw = Math.max(0.4, sw * 0.6);
    // Размерный текст — привязан к viewport, всегда читаемый
    const dimFontSize = Math.max(4, Math.min(9, Math.max(width, height) * 0.09));

    // Вспомогательная функция: получить вершины polygon любого вида
    const getPolyVertices = (obj) => {
        if (obj.sides && typeof obj.radius === 'number' && typeof obj.cx === 'number') {
            // Правильный многоугольник из shapes.js
            const pts = [];
            for (let i = 0; i < obj.sides; i++) {
                const angle = (2 * Math.PI * i / obj.sides) - Math.PI / 2;
                pts.push({ x: obj.cx + obj.radius * Math.cos(angle), y: obj.cy + obj.radius * Math.sin(angle) });
            }
            return pts;
        }
        return (typeof obj.getPoints === 'function') ? obj.getPoints() :
               (typeof obj.getVertices === 'function') ? obj.getVertices() :
               (obj.points || obj.vertices || []);
    };

    // ═══════════════════════════════════════════════════════════════
    // v3.49: Улучшенное отображение очень вытянутых деталей
    // При соотношении сторон > 5:1 деталь в миниатюре становится
    // почти невидимой (например 749×21.4 → 5px высоты).
    // Решение: для тонких деталей увеличиваем padding по узкой стороне,
    // чтобы масштаб был ограничен шириной, а не высотой.
    // ═══════════════════════════════════════════════════════════════
    const aspectRatio = Math.max(bounds.width, bounds.height) / Math.max(Math.min(bounds.width, bounds.height), 0.1);
    let padX, padY;
    if (aspectRatio > 5) {
        // Вытянутая деталь: padding по короткой стороне увеличиваем
        // чтобы масштабирование шло по длинной стороне
        const longPad = Math.max(bounds.width, bounds.height) * 0.08;
        const shortPad = Math.max(bounds.width, bounds.height) * 0.4; // 40% от длинной стороны
        padX = bounds.width >= bounds.height ? longPad : shortPad;
        padY = bounds.width >= bounds.height ? shortPad : longPad;
    } else {
        padX = pad; // оригинальный pad
        padY = pad;
    }
    const vwElongated = bounds.width + padX * 2;
    const vhElongated = bounds.height + padY * 2;
    const scaleElongated = Math.min(width / vwElongated, height / vhElongated);
    const oxE = (width - vwElongated * scaleElongated) / 2;
    const oyE = (height - vhElongated * scaleElongated) / 2;
    // Используем улучшенные координаты для вытянутых деталей
    const finalScale = aspectRatio > 5 ? scaleElongated : scale;
    const finalOx = aspectRatio > 5 ? oxE : ox;
    const finalOy = aspectRatio > 5 ? oyE : oy;
    const finalPadX = aspectRatio > 5 ? padX : pad;
    const finalPadY = aspectRatio > 5 ? padY : pad;

    let svgContent = '';

    part.objects.forEach(obj => {
        if (obj.type === 'line') {
            const x1 = finalOx + (obj.x1 - bounds.minX + finalPadX) * finalScale;
            const y1 = finalOy + (obj.y1 - bounds.minY + finalPadY) * finalScale;
            const x2 = finalOx + (obj.x2 - bounds.minX + finalPadX) * finalScale;
            const y2 = finalOy + (obj.y2 - bounds.minY + finalPadY) * finalScale;
            svgContent += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"/>`;

        } else if (obj.type === 'circle') {
            const cx = finalOx + (obj.cx - bounds.minX + finalPadX) * finalScale;
            const cy = finalOy + (obj.cy - bounds.minY + finalPadY) * finalScale;
            const r = Math.abs(obj.radius || 0) * finalScale;
            svgContent += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;

        // ═══════════════════════════════════════════════════════════
        // ДУГА (arc) — ИСПРАВЛЕНО:
        // 1. ?? вместо || для startAngle/endAngle (0 — валидный угол)
        // 2. direction учитывается для SVG sweep-flag и large-arc-flag
        // 3. Корректный расчёт sweepAngle для CCW-дуг (direction < 0)
        // ═══════════════════════════════════════════════════════════
        } else if (obj.type === 'arc') {
            const acx = finalOx + ((obj.cx || 0) - bounds.minX + finalPadX) * finalScale;
            const acy = finalOy + ((obj.cy || 0) - bounds.minY + finalPadY) * finalScale;
            const r = Math.abs(obj.radius || 0) * finalScale;
            // ИСПРАВЛЕНО: ?? вместо || — endAngle=0 это валидный угол, не falsy
            const startAngle = obj.startAngle ?? 0;
            const endAngle = obj.endAngle ?? (2 * Math.PI);
            // ИСПРАВЛЕНО v3.50: direction может быть строкой 'CW'/'CCW' (из Arc-класса)
            // или числом (1/-1 из старого кода). Корректно обрабатываем оба варианта.
            // 'CCW' или direction >= 0 — против часовой стрелки → SVG sweep=1
            // 'CW'   или direction < 0 — по часовой стрелке     → SVG sweep=0
            const dirVal = obj.direction;
            const isCCW = (dirVal === 'CCW' || dirVal === 1 || (typeof dirVal === 'number' && dirVal >= 0));
            const ax1 = acx + r * Math.cos(startAngle);
            const ay1 = acy + r * Math.sin(startAngle);
            const ax2 = acx + r * Math.cos(endAngle);
            const ay2 = acy + r * Math.sin(endAngle);
            // Рассчитываем угловую развёртку с учётом направления дуги
            let sweepAngle;
            if (isCCW) {
                sweepAngle = endAngle - startAngle;
                if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;
            } else {
                sweepAngle = startAngle - endAngle;
                if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;
            }
            const largeArc = sweepAngle > Math.PI ? 1 : 0;
            const sweepFlag = isCCW ? 1 : 0;
            svgContent += `<path d="M ${ax1.toFixed(1)} ${ay1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} ${sweepFlag} ${ax2.toFixed(1)} ${ay2.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;

        } else if (obj.type === 'rect') {
            const x = finalOx + (obj.x - bounds.minX + finalPadX) * finalScale;
            const y = finalOy + (obj.y - bounds.minY + finalPadY) * finalScale;
            const rawW = obj.width * finalScale;
            const rawH = obj.height * finalScale;
            const w = Math.abs(rawW);
            const h = Math.abs(rawH);
            let rx = x, ry = y;
            if (rawW < 0) rx -= w;
            if (rawH < 0) ry -= h;
            svgContent += `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;

        } else if (obj.type === 'polygon') {
            const vertices = getPolyVertices(obj);
            if (vertices.length > 0) {
                const pts = vertices.map(p => {
                    const px = finalOx + (p.x - bounds.minX + finalPadX) * finalScale;
                    const py = finalOy + (p.y - bounds.minY + finalPadY) * finalScale;
                    return `${px.toFixed(1)},${py.toFixed(1)}`;
                }).join(' ');
                svgContent += `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
            }

        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const vertices = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
            if (vertices.length > 1) {
                const pts = vertices.map(p => {
                    const px = finalOx + (p.x - bounds.minX + finalPadX) * finalScale;
                    const py = finalOy + (p.y - bounds.minY + finalPadY) * finalScale;
                    return `${px.toFixed(1)},${py.toFixed(1)}`;
                });
                // Замыкание polyline если obj.closed === true
                if (obj.closed && pts.length > 0) {
                    pts.push(pts[0]);
                }
                svgContent += `<polyline points="${pts.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
            }

        } else if (obj.type === 'path' && obj.d) {
            const tx = finalOx - bounds.minX * finalScale + finalPadX * finalScale;
            const ty = finalOy - bounds.minY * finalScale + finalPadY * finalScale;
            svgContent += `<path d="${obj.d}" fill="none" stroke="${stroke}" stroke-width="${sw}" transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${finalScale.toFixed(8)})"/>`;

        // ═══════════════════════════════════════════════════════════
        // ТЕКСТ — отображается с viewport-относительным размером шрифта
        // ═══════════════════════════════════════════════════════════
        // ═══════════════════════════════════════════════════════════════
        // SPLINE — v3.49: отображаем сплайн как polyline
        // Если есть fitPoints — используем их (точнее), иначе controlPoints
        // ═══════════════════════════════════════════════════════════════
        } else if (obj.type === 'spline') {
            const vertices = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            if (vertices.length > 1) {
                const pts = vertices.map(p => {
                    const px = finalOx + (p.x - bounds.minX + finalPadX) * finalScale;
                    const py = finalOy + (p.y - bounds.minY + finalPadY) * finalScale;
                    return `${px.toFixed(1)},${py.toFixed(1)}`;
                }).join(' ');
                svgContent += `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
            }

        } else if (obj.type === 'text') {
            const tx = finalOx + ((obj.x || obj.x1 || 0) - bounds.minX + finalPadX) * finalScale;
            const ty = finalOy + ((obj.y || obj.y1 || 0) - bounds.minY + finalPadY) * finalScale;
            const text = obj.text || obj.content || obj.value || '';
            if (text) {
                const fs = dimFontSize;
                svgContent += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs.toFixed(1)}" fill="${stroke}" text-anchor="middle" dominant-baseline="central" style="font-family:Arial,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:${(fs * 0.25).toFixed(1)}px;stroke-linecap:round;stroke-linejoin:round;">${text}</text>`;
            }

        // ═══════════════════════════════════════════════════════════
        // РАЗМЕРЫ / АВТОРАЗМЕРЫ — линия + текст + выноски
        // Поддерживает несколько вариантов структуры:
        //   dimension: {x1,y1,x2,y2, text/value, extX1,extY1,extX2,extY2}
        //   dim:       {startX,startY,endX,endY, text/value, offset}
        //   dimLine:   {x1,y1,x2,y2, label/text}
        // ═══════════════════════════════════════════════════════════
        } else if (obj.type === 'dimension' || obj.type === 'dim' || obj.type === 'dimLine' || obj.type === 'autoDimension' || obj.type === 'autoSize') {
            const dx1 = obj.x1 ?? obj.startX ?? 0;
            const dy1 = obj.y1 ?? obj.startY ?? 0;
            const dx2 = obj.x2 ?? obj.endX ?? 0;
            const dy2 = obj.y2 ?? obj.endY ?? 0;
            const sx1 = finalOx + (dx1 - bounds.minX + finalPadX) * finalScale;
            const sy1 = finalOy + (dy1 - bounds.minY + finalPadY) * finalScale;
            const sx2 = finalOx + (dx2 - bounds.minX + finalPadX) * finalScale;
            const sy2 = finalOy + (dy2 - bounds.minY + finalPadY) * finalScale;

            // Размерная линия (пунктир)
            svgContent += `<line x1="${sx1.toFixed(1)}" y1="${sy1.toFixed(1)}" x2="${sx2.toFixed(1)}" y2="${sy2.toFixed(1)}" stroke="${stroke}" stroke-width="${dimSw}" stroke-dasharray="${(dimSw * 2).toFixed(1)},${(dimSw).toFixed(1)}"/>`;

            // Засечки на концах
            const dLen = Math.sqrt((sx2 - sx1) ** 2 + (sy2 - sy1) ** 2);
            if (dLen > 4) {
                const tickLen = Math.min(4, dLen * 0.15);
                const nx = (sy2 - sy1) / dLen;
                const ny = -(sx2 - sx1) / dLen;
                svgContent += `<line x1="${(sx1 + nx * tickLen).toFixed(1)}" y1="${(sy1 + ny * tickLen).toFixed(1)}" x2="${(sx1 - nx * tickLen).toFixed(1)}" y2="${(sy1 - ny * tickLen).toFixed(1)}" stroke="${stroke}" stroke-width="${dimSw}"/>`;
                svgContent += `<line x1="${(sx2 + nx * tickLen).toFixed(1)}" y1="${(sy2 + ny * tickLen).toFixed(1)}" x2="${(sx2 - nx * tickLen).toFixed(1)}" y2="${(sy2 - ny * tickLen).toFixed(1)}" stroke="${stroke}" stroke-width="${dimSw}"/>`;
            }

            // Текст размера — по центру линии, повёрнут вдоль
            const mx = (sx1 + sx2) / 2;
            const my = (sy1 + sy2) / 2;
            const dimText = obj.text || obj.value || obj.label || '';
            if (dimText && dLen > dimFontSize) {
                let angle = Math.atan2(sy2 - sy1, sx2 - sx1) * 180 / Math.PI;
                if (angle > 90) angle -= 180;
                if (angle < -90) angle += 180;
                svgContent += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="${dimFontSize.toFixed(1)}" fill="#000" text-anchor="middle" dominant-baseline="central" transform="rotate(${angle.toFixed(1)},${mx.toFixed(1)},${my.toFixed(1)})" style="paint-order:stroke;stroke:#fff;stroke-width:${(dimFontSize * 0.35).toFixed(1)}px;stroke-linecap:round;stroke-linejoin:round;font-family:Arial,sans-serif;font-weight:600;">${dimText}</text>`;
            }

            // Выносные линии (extension lines)
            if (obj.extX1 !== undefined && obj.extY1 !== undefined) {
                const ex1 = finalOx + (obj.extX1 - bounds.minX + finalPadX) * finalScale;
                const ey1 = finalOy + (obj.extY1 - bounds.minY + finalPadY) * finalScale;
                svgContent += `<line x1="${ex1.toFixed(1)}" y1="${ey1.toFixed(1)}" x2="${sx1.toFixed(1)}" y2="${sy1.toFixed(1)}" stroke="${stroke}" stroke-width="${dimSw * 0.7}" stroke-dasharray="${(dimSw * 1.5).toFixed(1)},${(dimSw).toFixed(1)}"/>`;
            }
            if (obj.extX2 !== undefined && obj.extY2 !== undefined) {
                const ex2 = finalOx + (obj.extX2 - bounds.minX + finalPadX) * finalScale;
                const ey2 = finalOy + (obj.extY2 - bounds.minY + finalPadY) * finalScale;
                svgContent += `<line x1="${ex2.toFixed(1)}" y1="${ey2.toFixed(1)}" x2="${sx2.toFixed(1)}" y2="${sy2.toFixed(1)}" stroke="${stroke}" stroke-width="${dimSw * 0.7}" stroke-dasharray="${(dimSw * 1.5).toFixed(1)},${(dimSw).toFixed(1)}"/>`;
            }
        }
    });

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#fff;border:1px solid #ccc;border-radius:3px;">${svgContent}</svg>`;
}

/**
 * Генерация миниатюры раскладки листа
 * ИСПРАВЛЕНО: дуги (arc) корректно отображаются с учётом direction
 */
function generateSheetThumbnail(sheet, sheetIndex, parts, sheetSize) {
    const viewBoxW = 1600;
    const viewBoxH = 900;

    const sw = sheet.sheetSize?.width || sheetSize.width;
    const sh = sheet.sheetSize?.height || sheetSize.height;

    // Поворачиваем лист на 90° для ландшафтного отображения
    const scale = Math.min(
        (viewBoxW - 80) / sh,
        (viewBoxH - 80) / sw
    );

    const ox = viewBoxW / 2 - (sh * scale) / 2;
    const oy = viewBoxH / 2 - (sw * scale) / 2;

    const uiScale = viewBoxW / 1600;

    // ═══════════════════════════════════════════════════════════════
    // ПРОПОРЦИОНАЛЬНОЕ МАСШТАБИРОВАНИЕ
    // Толщина линий деталей зависит от их относительного размера на листе
    // ═══════════════════════════════════════════════════════════════
    const baseStrokeWidth = 2.5 * uiScale;
    const dimStrokeWidth = Math.max(1.0, baseStrokeWidth * 0.5);
    // Размерный текст — viewport-относительный, всегда читаемый
    const dimFontSize = Math.max(8, 12 * uiScale);

    let svgContent = `<rect x="${ox}" y="${oy}" width="${(sh * scale).toFixed(1)}" height="${(sw * scale).toFixed(1)}" fill="#f8f8f8" stroke="#ccc" stroke-width="${2 * uiScale}"/>`;

    const colors = ['#4a90d9','#d94a4a','#4ad97a','#d9c44a','#9a4ad9','#4ad9c4','#d97a4a','#4a7ad9','#d94a9a','#7ad94a'];
    const partColors = {};

    const rotatePoint = (px, py, angle, cx, cy) => {
        if (angle === 0) return { x: px, y: py };
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: cx + (px - cx) * cos - (py - cy) * sin,
            y: cy + (px - cx) * sin + (py - cy) * cos
        };
    };

    // Вспомогательная функция: получить вершины polygon любого вида
    const getPolyVertices = (obj) => {
        if (obj.sides && typeof obj.radius === 'number' && typeof obj.cx === 'number') {
            const pts = [];
            for (let i = 0; i < obj.sides; i++) {
                const angle = (2 * Math.PI * i / obj.sides) - Math.PI / 2;
                pts.push({ x: obj.cx + obj.radius * Math.cos(angle), y: obj.cy + obj.radius * Math.sin(angle) });
            }
            return pts;
        }
        return (typeof obj.getPoints === 'function') ? obj.getPoints() :
               (typeof obj.getVertices === 'function') ? obj.getVertices() :
               (obj.points || obj.vertices || []);
    };

    sheet.nestedParts.forEach((nested, idx) => {
        const part = parts.find(p => p.id === nested.partId);
        if (!part) return;

        if (!partColors[part.id]) {
            const colorIndex = Math.abs(parseInt(part.id) % colors.length);
            partColors[part.id] = colors[colorIndex];
        }

        const strokeColor = partColors[part.id];
        const strokeWidth = baseStrokeWidth;

        const rotationAngle = nested.angle || 0;
        const bboxWidth = nested.baseWidth || nested.width;
        const bboxHeight = nested.baseHeight || nested.height;
        const centerX = bboxWidth / 2;
        const centerY = bboxHeight / 2;

        let refPoint = nested.refPoint;
        if (!refPoint) {
            const bboxHull = [
                { x: 0, y: 0 }, { x: bboxWidth, y: 0 },
                { x: bboxWidth, y: bboxHeight }, { x: 0, y: bboxHeight }
            ];
            const rotatedBboxHull = bboxHull.map(p => rotatePoint(p.x, p.y, rotationAngle, centerX, centerY));
            refPoint = rotatedBboxHull[0];
            for (const p of rotatedBboxHull) {
                if (p.y < refPoint.y || (p.y === refPoint.y && p.x < refPoint.x)) refPoint = p;
            }
        }

        const normOffsetX = part.bounds.minX || 0;
        const normOffsetY = part.bounds.minY || 0;

        // Координаты отрисовки (с поворотом листа)
        const drawX = ox + nested.y * scale;
        const drawY = oy + (sw - nested.x) * scale;

        const objectsToDraw = nested.objects && nested.objects.length > 0 ? nested.objects : part.objects;

        if (objectsToDraw && objectsToDraw.length > 0) {
            objectsToDraw.forEach(obj => {
                if (obj.type === 'line') {
                    const p1 = rotatePoint(obj.x1 - normOffsetX, obj.y1 - normOffsetY, rotationAngle, centerX, centerY);
                    const p2 = rotatePoint(obj.x2 - normOffsetX, obj.y2 - normOffsetY, rotationAngle, centerX, centerY);
                    const x1 = drawX + (p1.y - refPoint.y) * scale;
                    const y1 = drawY - (p1.x - refPoint.x) * scale;
                    const x2 = drawX + (p2.y - refPoint.y) * scale;
                    const y2 = drawY - (p2.x - refPoint.x) * scale;
                    svgContent += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                }
                else if (obj.type === 'circle') {
                    const rc = rotatePoint(obj.cx - normOffsetX, obj.cy - normOffsetY, rotationAngle, centerX, centerY);
                    const cx = drawX + (rc.y - refPoint.y) * scale;
                    const cy = drawY - (rc.x - refPoint.x) * scale;
                    svgContent += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(Math.abs(obj.radius || 0) * scale).toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                }
                // ═══════════════════════════════════════════════════════════
                // ДУГА (arc) на листе — ИСПРАВЛЕНО v3.51:
                // Рисуем как polyline через getPoints() или ручную аппроксимацию.
                // Это устраняет проблемы со sweep-flag / large-arc при поворотах.
                // ═══════════════════════════════════════════════════════════
                else if (obj.type === 'arc') {
                    let pts = [];
                    if (typeof obj.getPoints === 'function') {
                        pts = obj.getPoints(48);
                    } else if (typeof obj.startAngle === 'number' && typeof obj.endAngle === 'number') {
                        const r = Math.abs(obj.radius || 0);
                        const sa = obj.startAngle;
                        const ea = obj.endAngle;
                        const dirVal = obj.direction;
                        const isCCW = (dirVal === 'CCW' || dirVal === 1 || (typeof dirVal === 'number' && dirVal >= 0));
                        let sweep = isCCW ? (ea - sa) : (sa - ea);
                        if (sweep <= 0) sweep += 2 * Math.PI;
                        const segs = 48;
                        for (let i = 0; i <= segs; i++) {
                            const t = i / segs;
                            const angle = isCCW ? (sa + sweep * t) : (sa - sweep * t);
                            pts.push({ x: (obj.cx || 0) + r * Math.cos(angle), y: (obj.cy || 0) + r * Math.sin(angle) });
                        }
                    }
                    if (pts.length >= 2) {
                        const rv = pts.map(p => rotatePoint(p.x - normOffsetX, p.y - normOffsetY, rotationAngle, centerX, centerY));
                        const pointsStr = rv.map(v => {
                            const px = drawX + (v.y - refPoint.y) * scale;
                            const py = drawY - (v.x - refPoint.x) * scale;
                            return `${px.toFixed(1)},${py.toFixed(1)}`;
                        }).join(' ');
                        svgContent += `<polyline points="${pointsStr}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                    }
                }
                else if (obj.type === 'rect') {
                    const corners = [
                        { x: obj.x - normOffsetX, y: obj.y - normOffsetY },
                        { x: obj.x + obj.width - normOffsetX, y: obj.y - normOffsetY },
                        { x: obj.x + obj.width - normOffsetX, y: obj.y + obj.height - normOffsetY },
                        { x: obj.x - normOffsetX, y: obj.y + obj.height - normOffsetY }
                    ];
                    const rc = corners.map(c => rotatePoint(c.x, c.y, rotationAngle, centerX, centerY));
                    const pts = rc.map(c => {
                        const px = drawX + (c.y - refPoint.y) * scale;
                        const py = drawY - (c.x - refPoint.x) * scale;
                        return `${px.toFixed(1)},${py.toFixed(1)}`;
                    }).join(' ');
                    svgContent += `<polygon points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                }
                else if (obj.type === 'polygon') {
                    const vertices = getPolyVertices(obj);
                    if (vertices.length > 0) {
                        const rv = vertices.map(v => rotatePoint(v.x - normOffsetX, v.y - normOffsetY, rotationAngle, centerX, centerY));
                        const pts = rv.map(v => {
                            const px = drawX + (v.y - refPoint.y) * scale;
                            const py = drawY - (v.x - refPoint.x) * scale;
                            return `${px.toFixed(1)},${py.toFixed(1)}`;
                        }).join(' ');
                        svgContent += `<polygon points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                    }
                }
                else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
                    const vertices = (obj.points || obj.vertices || []).filter(v => v && typeof v.x === 'number' && typeof v.y === 'number');
                    if (vertices.length > 1) {
                        const rv = vertices.map(v => rotatePoint(v.x - normOffsetX, v.y - normOffsetY, rotationAngle, centerX, centerY));
                        const pts = rv.map(v => {
                            const px = drawX + (v.y - refPoint.y) * scale;
                            const py = drawY - (v.x - refPoint.x) * scale;
                            return `${px.toFixed(1)},${py.toFixed(1)}`;
                        });
                        // Замыкание polyline если obj.closed === true
                        if (obj.closed && pts.length > 0) {
                            pts.push(pts[0]);
                        }
                        svgContent += `<polyline points="${pts.join(' ')}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                    }
                }
                // ═══════════════════════════════════════════════════════════
                // SPLINE на листе — v3.49: отображаем как polyline
                // ═══════════════════════════════════════════════════════════
                else if (obj.type === 'spline') {
                    const vertices = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
                    if (vertices.length > 1) {
                        const rv = vertices.map(v => rotatePoint(v.x - normOffsetX, v.y - normOffsetY, rotationAngle, centerX, centerY));
                        const pts = rv.map(v => {
                            const px = drawX + (v.y - refPoint.y) * scale;
                            const py = drawY - (v.x - refPoint.x) * scale;
                            return `${px.toFixed(1)},${py.toFixed(1)}`;
                        }).join(' ');
                        svgContent += `<polyline points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                    }
                }
                // ═══════════════════════════════════════════════════════════
                // ТЕКСТ на листе — viewport-относительный размер
                // ═══════════════════════════════════════════════════════════
                else if (obj.type === 'text') {
                    const rp = rotatePoint((obj.x || obj.x1 || 0) - normOffsetX, (obj.y || obj.y1 || 0) - normOffsetY, rotationAngle, centerX, centerY);
                    const tx = drawX + (rp.y - refPoint.y) * scale;
                    const ty = drawY - (rp.x - refPoint.x) * scale;
                    const text = obj.text || obj.content || obj.value || '';
                    if (text) {
                        svgContent += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${dimFontSize.toFixed(1)}" fill="${strokeColor}" text-anchor="middle" dominant-baseline="central" style="font-family:Arial,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:${(dimFontSize * 0.25).toFixed(1)}px;stroke-linecap:round;stroke-linejoin:round;">${text}</text>`;
                    }
                }
                // ═══════════════════════════════════════════════════════════
                // РАЗМЕРЫ / АВТОРАЗМЕРЫ на листе
                // ═══════════════════════════════════════════════════════════
                else if (obj.type === 'dimension' || obj.type === 'dim' || obj.type === 'dimLine' || obj.type === 'autoDimension' || obj.type === 'autoSize') {
                    const dx1 = (obj.x1 ?? obj.startX ?? 0) - normOffsetX;
                    const dy1 = (obj.y1 ?? obj.startY ?? 0) - normOffsetY;
                    const dx2 = (obj.x2 ?? obj.endX ?? 0) - normOffsetX;
                    const dy2 = (obj.y2 ?? obj.endY ?? 0) - normOffsetY;
                    const rp1 = rotatePoint(dx1, dy1, rotationAngle, centerX, centerY);
                    const rp2 = rotatePoint(dx2, dy2, rotationAngle, centerX, centerY);
                    const sx1 = drawX + (rp1.y - refPoint.y) * scale;
                    const sy1 = drawY - (rp1.x - refPoint.x) * scale;
                    const sx2 = drawX + (rp2.y - refPoint.y) * scale;
                    const sy2 = drawY - (rp2.x - refPoint.x) * scale;
                    // Размерная линия (пунктир)
                    svgContent += `<line x1="${sx1.toFixed(1)}" y1="${sy1.toFixed(1)}" x2="${sx2.toFixed(1)}" y2="${sy2.toFixed(1)}" stroke="${strokeColor}" stroke-width="${dimStrokeWidth}" stroke-dasharray="${(dimStrokeWidth * 3).toFixed(1)},${(dimStrokeWidth * 1.5).toFixed(1)}"/>`;
                    // Засечки на концах
                    const dLen = Math.sqrt((sx2 - sx1) ** 2 + (sy2 - sy1) ** 2);
                    if (dLen > 6) {
                        const tickLen = Math.min(6, dLen * 0.12);
                        const nx = (sy2 - sy1) / dLen;
                        const ny = -(sx2 - sx1) / dLen;
                        svgContent += `<line x1="${(sx1 + nx * tickLen).toFixed(1)}" y1="${(sy1 + ny * tickLen).toFixed(1)}" x2="${(sx1 - nx * tickLen).toFixed(1)}" y2="${(sy1 - ny * tickLen).toFixed(1)}" stroke="${strokeColor}" stroke-width="${dimStrokeWidth}"/>`;
                        svgContent += `<line x1="${(sx2 + nx * tickLen).toFixed(1)}" y1="${(sy2 + ny * tickLen).toFixed(1)}" x2="${(sx2 - nx * tickLen).toFixed(1)}" y2="${(sy2 - ny * tickLen).toFixed(1)}" stroke="${strokeColor}" stroke-width="${dimStrokeWidth}"/>`;
                    }
                    // Текст размера
                    const mx = (sx1 + sx2) / 2;
                    const my = (sy1 + sy2) / 2;
                    const dimText = obj.text || obj.value || obj.label || '';
                    if (dimText && dLen > dimFontSize) {
                        let angle = Math.atan2(sy2 - sy1, sx2 - sx1) * 180 / Math.PI;
                        if (angle > 90) angle -= 180;
                        if (angle < -90) angle += 180;
                        svgContent += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="${dimFontSize.toFixed(1)}" fill="#000" text-anchor="middle" dominant-baseline="central" transform="rotate(${angle.toFixed(1)},${mx.toFixed(1)},${my.toFixed(1)})" style="paint-order:stroke;stroke:#fff;stroke-width:${(dimFontSize * 0.35).toFixed(1)}px;stroke-linecap:round;stroke-linejoin:round;font-family:Arial,sans-serif;font-weight:600;">${dimText}</text>`;
                    }
                    // Выносные линии
                    if (obj.extX1 !== undefined && obj.extY1 !== undefined) {
                        const eLocal = rotatePoint(obj.extX1 - normOffsetX, obj.extY1 - normOffsetY, rotationAngle, centerX, centerY);
                        const esx = drawX + (eLocal.y - refPoint.y) * scale;
                        const esy = drawY - (eLocal.x - refPoint.x) * scale;
                        svgContent += `<line x1="${esx.toFixed(1)}" y1="${esy.toFixed(1)}" x2="${sx1.toFixed(1)}" y2="${sy1.toFixed(1)}" stroke="${strokeColor}" stroke-width="${dimStrokeWidth * 0.7}" stroke-dasharray="${(dimStrokeWidth * 2).toFixed(1)},${(dimStrokeWidth).toFixed(1)}"/>`;
                    }
                    if (obj.extX2 !== undefined && obj.extY2 !== undefined) {
                        const eLocal = rotatePoint(obj.extX2 - normOffsetX, obj.extY2 - normOffsetY, rotationAngle, centerX, centerY);
                        const esx = drawX + (eLocal.y - refPoint.y) * scale;
                        const esy = drawY - (eLocal.x - refPoint.x) * scale;
                        svgContent += `<line x1="${esx.toFixed(1)}" y1="${esy.toFixed(1)}" x2="${sx2.toFixed(1)}" y2="${sy2.toFixed(1)}" stroke="${strokeColor}" stroke-width="${dimStrokeWidth * 0.7}" stroke-dasharray="${(dimStrokeWidth * 2).toFixed(1)},${(dimStrokeWidth).toFixed(1)}"/>`;
                    }
                }
            });
        } else {
             // Fallback: прямоугольник если нет объектов
             // drawX/drawY уже содержат смещение до refPoint через nested.x/y
             const pw = nested.height * scale;  // AABB height → SVG width (после поворота листа)
             const ph = nested.width * scale;   // AABB width → SVG height
             svgContent += `<rect x="${drawX.toFixed(1)}" y="${drawY.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${strokeColor}" fill-opacity="0.25" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
        }

        // ═══════════════════════════════════════════════════════════
        // НАЗВАНИЕ ВДОЛЬ ДЛИННОЙ СТОРОНЫ BOUNDING BOX
        // ═══════════════════════════════════════════════════════════
        const partName = part.name || `Деталь #${part.id}`;

        // Определяем длинную сторону bounding box
        // Используем nested.width/height (AABB после поворота), а не bboxWidth/Height (оригинал)
        // т.к. на SVG лист повёрнут на 90°, и отображаемые размеры соответствуют nested.width/height
        const labelX = drawX + (nested.height / 2) * scale;
        const labelY = drawY - (nested.width / 2) * scale;

        // Если отображаемая высота больше ширины - поворачиваем текст на 90° (вертикально)
        const shouldRotate = nested.height > nested.width;
        const transformAttr = shouldRotate ? `transform="rotate(-90, ${labelX}, ${labelY})"` : '';

        // Размер шрифта и выравнивание
        const fontSize = 16 * uiScale;
        const textAnchor = 'middle';

        svgContent += `
            <text x="${labelX}" y="${labelY}"
                  ${transformAttr}
                  font-size="${fontSize}"
                  font-weight="600"
                  fill="#000"
                  text-anchor="${textAnchor}"
                  dominant-baseline="central"
                  style="paint-order: stroke; stroke: white; stroke-width: ${4 * uiScale}px; stroke-linecap: round; stroke-linejoin: round; font-family: Arial, sans-serif;">
                ${partName}
            </text>
        `;
    });
        
    return `<svg width="100%" height="100%" viewBox="0 0 ${viewBoxW} ${viewBoxH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="border:1px solid #ccc;border-radius:6px;background:#fff;">
        <text x="${viewBoxW / 2}" y="40" text-anchor="middle" font-size="${24 * uiScale}" font-weight="bold" fill="#007acc">Лист ${sheetIndex + 1}: ${sw}×${sh} мм (${sheet.nestedParts.length} дет.)</text>
        ${svgContent}
    </svg>`;
}

/**
 * Вычисление периметра (длины реза) детали
 * Суммирует длину всех объектов: линии, окружности, прямоугольники, многоугольники,
 * полигоны из DXF (polyline/lwpolyline), дуги (arc), пути (path)
 *
 * ИСПРАВЛЕНО:
 * 1. polygon с cx/cy/sides/radius — правильный многоугольник из shapes.js (getPoints не существует)
 * 2. polygon с points/vertices — из DXF-импорта
 * 3. polyline/lwpolyline — из DXF-импорта (незамкнутые)
 * 4. arc — дуга из DXF с учётом direction
 * 5. text — не режется, пропускается
 * 6. Кольца (donut): внешний круг — режем, внутренний (отверстие) — тоже режем
 *
 * @param {Object} part - Объект детали
 * @returns {number} Периметр (длина реза) в мм
 */
function calculatePartPerimeter(part) {
    if (!part || !part.objects || part.objects.length === 0) return 0;

    let totalLength = 0;

    part.objects.forEach(obj => {
        if (obj.type === 'line') {
            const dx = obj.x2 - obj.x1;
            const dy = obj.y2 - obj.y1;
            totalLength += Math.sqrt(dx * dx + dy * dy);

        } else if (obj.type === 'circle') {
            totalLength += 2 * Math.PI * Math.abs(obj.radius || 0);

        } else if (obj.type === 'arc') {
            // Длина дуги = radius * |угол_развёртки|
            const r = Math.abs(obj.radius || 0);
            if (r > 0 && typeof obj.startAngle === 'number' && typeof obj.endAngle === 'number') {
                // ИСПРАВЛЕНО v3.50: direction может быть строкой 'CW'/'CCW'
                const dirVal = obj.direction;
                const isCCW = (dirVal === 'CCW' || dirVal === 1 || (typeof dirVal === 'number' && dirVal >= 0));
                let sweepAngle;
                if (isCCW) {
                    sweepAngle = obj.endAngle - obj.startAngle;
                    if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;
                } else {
                    sweepAngle = obj.startAngle - obj.endAngle;
                    if (sweepAngle <= 0) sweepAngle += 2 * Math.PI;
                }
                if (sweepAngle > 2 * Math.PI) sweepAngle = 2 * Math.PI;
                totalLength += r * sweepAngle;
            } else if (r > 0) {
                totalLength += 2 * Math.PI * r;
            }

        } else if (obj.type === 'rect') {
            totalLength += 2 * (Math.abs(obj.width || 0) + Math.abs(obj.height || 0));

        } else if (obj.type === 'polygon') {
            if (obj.sides && typeof obj.radius === 'number' && typeof obj.cx === 'number') {
                const sides = Math.max(3, obj.sides || 3);
                const r = Math.abs(obj.radius || 0);
                totalLength += sides * 2 * r * Math.sin(Math.PI / sides);
            } else {
                const vertices = typeof obj.getPoints === 'function' ? obj.getPoints() :
                                 typeof obj.getVertices === 'function' ? obj.getVertices() :
                                 (obj.points || obj.vertices || []);
                if (vertices.length > 1) {
                    for (let i = 0; i < vertices.length; i++) {
                        const next = (i + 1) % vertices.length;
                        const dx = vertices[next].x - vertices[i].x;
                        const dy = vertices[next].y - vertices[i].y;
                        totalLength += Math.sqrt(dx * dx + dy * dy);
                    }
                }
            }

        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const vertices = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
            for (let i = 0; i < vertices.length - 1; i++) {
                const dx = vertices[i + 1].x - vertices[i].x;
                const dy = vertices[i + 1].y - vertices[i].y;
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }
            // Замыкающий сегмент для закрытых polyline
            if (obj.closed && vertices.length > 2) {
                const dx = vertices[0].x - vertices[vertices.length - 1].x;
                const dy = vertices[0].y - vertices[vertices.length - 1].y;
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }

        } else if (obj.type === 'path') {
            if (obj.d) {
                const bw = obj.width || (obj.bounds?.width) || 0;
                const bh = obj.height || (obj.bounds?.height) || 0;
                if (bw > 0 && bh > 0) {
                    totalLength += 2 * (bw + bh) * 0.6;
                }
            }
        }
        // v3.49: SPLINE — считаем периметр как сумму длин отрезков
        else if (obj.type === 'spline') {
            const vertices = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            for (let i = 0; i < vertices.length - 1; i++) {
                const dx = vertices[i + 1].x - vertices[i].x;
                const dy = vertices[i + 1].y - vertices[i].y;
                totalLength += Math.sqrt(dx * dx + dy * dy);
            }
        }
        // v3.50: ELLIPSE — аппроксимация периметра (формула Рамануджана)
        else if (obj.type === 'ellipse') {
            const rx = Math.abs(obj.radiusX || obj.majorAxisLength || 0);
            const ry = Math.abs(obj.radiusY || obj.minorAxisLength || 0);
            if (rx > 0 && ry > 0) {
                const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
                totalLength += Math.PI * (rx + ry) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
            }
        }
    });

    return totalLength;
}

/**
 * Показать модальное окно для ввода параметров отчёта
 * Название компании кэшируется в localStorage
 */
function showReportSettingsModal() {
    const savedCompany = localStorage.getItem('cutsy_companyName') || '';

    const overlay = document.createElement('div');
    overlay.id = 'reportSettingsOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:28px 32px;width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:'Segoe UI',Arial,sans-serif;">
            <h2 style="margin:0 0 20px;font-size:18px;color:#007acc;">Параметры отчёта</h2>
            <div style="margin-bottom:14px;">
                <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Название компании</label>
                <input id="reportCompanyName" type="text" value="${savedCompany}" placeholder="ООО «Компания»" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:5px;font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:14px;">
                <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Номер заказа</label>
                <input id="reportOrderNumber" type="text" placeholder="№ 0001" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:5px;font-size:14px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:13px;color:#555;margin-bottom:4px;">Телефон клиента</label>
                <input id="reportClientPhone" type="text" placeholder="+7 (___) ___-__-__" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:5px;font-size:14px;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="reportCancelBtn" style="padding:8px 20px;border:1px solid #ccc;border-radius:5px;background:#f5f5f5;cursor:pointer;font-size:14px;">Отмена</button>
                <button id="reportGenerateBtn" style="padding:8px 20px;border:none;border-radius:5px;background:#007acc;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">Сформировать</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('reportCancelBtn').onclick = () => overlay.remove();
    document.getElementById('reportGenerateBtn').onclick = () => {
        const companyName = document.getElementById('reportCompanyName').value.trim();
        const orderNumber = document.getElementById('reportOrderNumber').value.trim();
        const clientPhone = document.getElementById('reportClientPhone').value.trim();

        if (companyName) localStorage.setItem('cutsy_companyName', companyName);

        overlay.remove();
        generatePdfReportWithSettings(companyName, orderNumber, clientPhone);
    };

    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('reportGenerateBtn').click();
        if (e.key === 'Escape') overlay.remove();
    });

    document.getElementById('reportCompanyName').focus();
}

function exportPdfReport() {
    showReportSettingsModal();
}

function generatePdfReportWithSettings(companyName, orderNumber, clientPhone) {
    const parts = Store.get('parts') || [];
    const nestedParts = Store.get('nestedParts') || [];
    const allSheets = Store.get('allSheets') || [];
    const sheetSize = Store.get('sheetSize') || { width: 1250, height: 2500 };

    if (parts.length === 0) {
        alert('Сначала создайте детали');
        return;
    }

    const sheetsToReport = (allSheets && allSheets.length > 0) ? allSheets : [{ nestedParts: nestedParts, sheetSize: sheetSize, thickness: 0.8 }];
    const totalNestedAll = sheetsToReport.reduce((s, sh) => s + sh.nestedParts.length, 0);
    if (totalNestedAll === 0) {
        alert('Сначала выполните раскладку');
        return;
    }

    const pricingSettings = loadPricingSettings();

    // v4.60: Локальные функции цен с учётом материала
    // Используют текущий выбранный материал (getCurrentMaterial)
    const _matKey = (typeof getCurrentMaterial === 'function') ? getCurrentMaterial() : 'steel_hot';

    const getPricePerKg = (thickness) => {
        const thKey = thickness?.toFixed?.(1) || thickness;
        const matPrices = pricingSettings?.pricePerKg?.[_matKey] || pricingSettings?.pricePerKg?.['steel_hot'] || {};
        return matPrices[thKey] ?? matPrices[thickness] ?? 0;
    };
    const getPricePerM2 = (thickness) => {
        const thKey = thickness?.toFixed?.(1) || thickness;
        const matPrices = pricingSettings?.pricePerM2?.[_matKey] || pricingSettings?.pricePerM2?.['steel_hot'] || {};
        return matPrices[thKey] ?? matPrices[thickness] ?? 0;
    };
    const getPricePerMeterCut = (thickness) => {
        const thKey = thickness?.toFixed?.(1) || thickness;
        const matPrices = pricingSettings?.pricePerMeterCut?.[_matKey] || pricingSettings?.pricePerMeterCut?.['steel_hot'] || {};
        return matPrices[thKey] ?? matPrices[thickness] ?? 0;
    };
    const getPricePerPierce = (thickness) => {
        const thKey = thickness?.toFixed?.(1) || thickness;
        const matPrices = pricingSettings?.pricePerPierce?.[_matKey] || pricingSettings?.pricePerPierce?.['steel_hot'] || {};
        return matPrices[thKey] ?? matPrices[thickness] ?? 0;
    };

    // v4.60: Плотность берётся из выбранного материала (pricing.js)
    // Если функция недоступна — fallback на 7.85 (сталь)
    const density = (typeof getMaterialDensity === 'function')
        ? getMaterialDensity(getCurrentMaterial())
        : 7.85;
    const currentMaterial = (typeof getCurrentMaterial === 'function') ? getCurrentMaterial() : 'steel_hot';
    const materialInfo = (typeof MATERIALS !== 'undefined' && MATERIALS[currentMaterial]) ? MATERIALS[currentMaterial] : { name: 'Сталь', density: 7.85, icon: '🔩' };
    const reportByThickness = {};

    // СБОР ДАННЫХ ПО ТОЛЩИНЕ
    sheetsToReport.forEach(sheet => {
        const thickness = sheet.thickness || 0.8;
        const key = thickness.toFixed(1);
        if (!reportByThickness[key]) {
            reportByThickness[key] = { thickness, sheets: [], groupedNested: {}, totalWeight: 0, totalLength: 0, totalPlaced: 0 };
        }
        reportByThickness[key].sheets.push({ sheetSize: sheet.sheetSize || sheetSize, nestedCount: sheet.nestedParts.length, nestedParts: sheet.nestedParts });
        sheet.nestedParts.forEach(nested => {
            if (!reportByThickness[key].groupedNested[nested.partId]) reportByThickness[key].groupedNested[nested.partId] = 0;
            reportByThickness[key].groupedNested[nested.partId]++;
            reportByThickness[key].totalPlaced++;
        });
    });

    const unplacedParts = [];
    parts.forEach(part => {
        const totalPlaced = sheetsToReport.reduce((s, sh) => s + sh.nestedParts.filter(n => n.partId === part.id).length, 0);
        const notPlaced = part.quantity - totalPlaced;
        if (notPlaced > 0) unplacedParts.push({ part, notPlaced });
    });

    const totalSheetArea = sheetsToReport.reduce((s, sh) => s + (sh.sheetSize?.width || sheetSize.width) * (sh.sheetSize?.height || sheetSize.height), 0);
    const usedAreaByThickness = {};
    const usedArea = sheetsToReport.reduce((s, sh) => s + sh.nestedParts.reduce((ss, n) => {
        const p = parts.find(pp => pp.id === n.partId);
        const partArea = p ? p.bounds.width * p.bounds.height : 0;
        const thKey = (sh.thickness || 0.8).toFixed(1);
        usedAreaByThickness[thKey] = (usedAreaByThickness[thKey] || 0) + partArea;
        return ss + partArea;
    }, 0), 0);
    const remnantArea = Math.max(0, totalSheetArea - usedArea);
    let remnantWeight = 0;
    Object.keys(reportByThickness).forEach(key => {
        const g = reportByThickness[key];
        const gSheetArea = g.sheets.reduce((s, sh) => s + (sh.sheetSize?.width || sheetSize.width) * (sh.sheetSize?.height || sheetSize.height), 0);
        const gUsedArea = usedAreaByThickness[key] || 0;
        const gRemnantArea = Math.max(0, gSheetArea - gUsedArea);
        remnantWeight += gRemnantArea * g.thickness * density / 1000000;
    });

    const stopwatchTime = (typeof window.getStopwatchTime === 'function') ? window.getStopwatchTime() : 0;
    const useStopwatch = stopwatchTime > 0;
    let grandTotalNestingTimeReserve = 0;
    Object.values(reportByThickness).forEach(g => { grandTotalNestingTimeReserve += g.sheets.reduce((s, sh) => s + (sh.nestingTime || 0), 0); });
    const workTimeSeconds = useStopwatch ? stopwatchTime : grandTotalNestingTimeReserve;

    let timeDistribution = {};
    if (useStopwatch) {
        const totalPlacedAll = Object.values(reportByThickness).reduce((s, g) => s + g.totalPlaced, 0);
        Object.keys(reportByThickness).forEach(key => {
            const g = reportByThickness[key];
            const ratio = totalPlacedAll > 0 ? g.totalPlaced / totalPlacedAll : 0;
            timeDistribution[key] = Math.round(workTimeSeconds * ratio);
        });
    }

    let grandTotalWeight = 0, grandTotalLength = 0, grandTotalSheets = 0, grandTotalPlaced = 0;
    let tableRows = '', thSectionHTML = '', sheetSummaryHTML = '';

    Object.keys(reportByThickness).forEach(key => {
        const group = reportByThickness[key];
        const th = group.thickness;
        grandTotalSheets += group.sheets.length;
        grandTotalPlaced += group.totalPlaced;

        let groupTableRows = '';
        Object.keys(group.groupedNested).forEach(partId => {
            const part = parts.find(p => p.id == partId);
            if (!part) return;
            const partThickness = (typeof part.thickness === 'number' && part.thickness > 0) ? part.thickness : th;
            // ИСПРАВЛЕНО v3.50: используем реальную площадь контура (part.area), а не bbox
            // part.area вычисляется при импорте через calculatePartMetrics → calculatePartArea (Shoelace)
            // Если part.area не задан — считаем на лету через calculatePartArea (если доступна)
            // или fallback на bbox * 0.6 (коэффициент заполнения)
            const realArea = (typeof part.area === 'number' && part.area > 0) ? part.area :
                            (typeof calculatePartArea === 'function' ? calculatePartArea(part) :
                            part.bounds.width * part.bounds.height * 0.6);
            // Вес = площадь (мм²) × толщина (мм) × плотность (г/см³=7.85) / 1000 (→ кг)
            // Формула: area_mm2 * thickness_mm * 7.85 / 1000000 = кг
            const weight = realArea * partThickness * density / 1000000;
            const perimeter = calculatePartPerimeter(part);
            const count = group.groupedNested[partId];
            const totalW = weight * count;
            const totalL = perimeter * count;
            group.totalWeight += totalW;
            group.totalLength += totalL;

            const thumbSVG = generatePartThumbnail(part, 80, 60, parts);
            const pricePerMeterCut = getPricePerMeterCut(th);
            const partCutCost = (totalL / 1000) * pricePerMeterCut;
            const partPricePerM2 = getPricePerM2(partThickness);
            const partPricePerKg = getPricePerKg(partThickness);
            // ИСПРАВЛЕНО v3.50: для расчёта стоимости металла тоже используем реальную площадь
            const partAreaM2 = (realArea * count) / 1000000;
            const partMetalCost = partPricePerM2 > 0 ? partAreaM2 * partPricePerM2 : totalW * partPricePerKg;
            
            // v3.55: Расчёт стоимости проколов
            // ИСПРАВЛЕНО: берём pierceCount из первого найденного nested-объекта данной детали
            const firstNested = group.sheets.flatMap(s => s.nestedParts).find(n => n.partId == partId);
            const singlePierceCount = firstNested?.pierceCount || 0;
            const partPierceCount = singlePierceCount * count;
            const pricePerPierce = getPricePerPierce(partThickness);
            const partPierceCost = partPierceCount * pricePerPierce;
            
            const partTotalCost = partMetalCost + partCutCost + partPierceCost;

            groupTableRows += `
                <tr>
                    <td class="thumb">${thumbSVG}</td>
                    <td>${part.name || 'Деталь'}</td>
                    <td>${parseFloat(part.bounds.width.toFixed(2))} × ${parseFloat(part.bounds.height.toFixed(2))}</td>
                    <td>${th}</td>
                    <td>${count}</td>
                    <td>${weight.toFixed(3)}</td>
                    <td>${totalW.toFixed(3)}</td>
                    <td>${(totalL / 1000).toFixed(3)}</td>
                    <td>${partPierceCount}</td>
                    <td>${partPierceCost.toFixed(2)}</td>
                    <td>${partCutCost.toFixed(2)}</td>
                    <td>${partMetalCost.toFixed(2)}</td>
                    <td><b>${partTotalCost.toFixed(2)}</b></td>
                </tr>
            `;

        });

        const groupSheetArea = group.sheets.reduce((s, sh) => s + (sh.sheetSize?.width || sheetSize.width) * (sh.sheetSize?.height || sheetSize.height), 0);
        const groupUsedArea = group.sheets.reduce((s, sh) => s + sh.nestedParts.reduce((ss, n) => {
            const p = parts.find(pp => pp.id === n.partId);
            return ss + (p ? p.bounds.width * p.bounds.height : 0);
        }, 0), 0);
        const groupRemnantArea = Math.max(0, groupSheetArea - groupUsedArea);
        const groupRemnantWeight = groupRemnantArea * th * density / 1000000;

        const pricePerM2 = getPricePerM2(th);
        const pricePerKg = getPricePerKg(th);
        const groupAreaM2 = groupUsedArea / 1000000;
        const groupCost = pricePerM2 > 0 ? groupAreaM2 * pricePerM2 : group.totalWeight * pricePerKg;

        const pricePerMeterCut = getPricePerMeterCut(th);
        const groupCutCost = (group.totalLength / 1000) * pricePerMeterCut;
        
        // v3.55: Расчёт стоимости проколов для группы
        // ИСПРАВЛЕНО: group.nestedParts не существует, используем group.sheets.flatMap
        const groupTotalPierceCount = group.sheets.flatMap(s => s.nestedParts).reduce((sum, n) => sum + (n.pierceCount || 0), 0);
        const pricePerPierce = getPricePerPierce(th);
        const groupPierceCost = groupTotalPierceCount * pricePerPierce;
        
        const groupNestingTime = useStopwatch ? (timeDistribution[key] || 0) : group.sheets.reduce((s, sh) => s + (sh.nestingTime || 0), 0);
        const groupTimeCost = (groupNestingTime / 60) * pricingSettings.pricePerMinute;
        const groupTotalCost = groupCost + groupCutCost + groupPierceCost + groupTimeCost;
        const groupEfficiency = group.totalWeight + groupRemnantWeight > 0 ? (group.totalWeight / (group.totalWeight + groupRemnantWeight) * 100).toFixed(1) : '0.0';

        thSectionHTML += `
            <h2 class="section-title">Толщина: ${th} мм</h2>
            <div class="summary th-summary">
                <div class="summary-grid">
                    <div class="summary-item"><div class="label">Листов</div><div class="value">${group.sheets.length}</div></div>
                    <div class="summary-item"><div class="label">Размещено</div><div class="value">${group.totalPlaced} шт</div></div>
                    <div class="summary-item"><div class="label">Вес деталей</div><div class="value">${group.totalWeight.toFixed(3)} кг</div></div>
                    <div class="summary-item"><div class="label">Цена сырья</div><div class="value">${pricePerM2 > 0 ? pricePerM2.toFixed(2) + ' ₽/м²' : pricePerKg.toFixed(2) + ' ₽/кг'}</div></div>
                    <div class="summary-item"><div class="label">Длина реза</div><div class="value">${(group.totalLength / 1000).toFixed(2)} м</div></div>
                    <div class="summary-item"><div class="label">Цена реза</div><div class="value">${pricePerMeterCut.toFixed(2)} ₽/м</div></div>
                    <div class="summary-item"><div class="label">Проколов</div><div class="value">${groupTotalPierceCount} шт</div></div>
                    <div class="summary-item"><div class="label">Цена прокола</div><div class="value">${pricePerPierce.toFixed(2)} ₽/шт</div></div>
                    <div class="summary-item"><div class="label">Стоимость металла</div><div class="value">${groupCost.toFixed(2)} ₽</div></div>
                    <div class="summary-item"><div class="label">Стоимость реза</div><div class="value">${groupCutCost.toFixed(2)} ₽</div></div>
                    <div class="summary-item"><div class="label">Стоимость проколов</div><div class="value">${groupPierceCost.toFixed(2)} ₽</div></div>
                    <div class="summary-item"><div class="label">Время раскладки</div><div class="value">${groupNestingTime > 0 ? groupNestingTime.toFixed(0) + ' сек' : '—'}</div></div>
                    <div class="summary-item"><div class="label">Стоимость времени</div><div class="value">${groupTimeCost > 0 ? groupTimeCost.toFixed(2) + ' ₽' : '—'}</div></div>
                    <div class="summary-item" style="background:#e8f5e9;"><div class="label">ИТОГО</div><div class="value">${groupTotalCost.toFixed(2)} ₽</div></div>
                    <div class="summary-item"><div class="label">Площадь остатка</div><div class="value">${(groupRemnantArea / 1000000).toFixed(3)} м²</div></div>
                    <div class="summary-item"><div class="label">Вес остатка</div><div class="value">${groupRemnantWeight.toFixed(3)} кг</div></div>
                    <div class="summary-item"><div class="label">КПД</div><div class="value">${groupEfficiency}%</div></div>
                </div>
            </div>
        `;
        tableRows += groupTableRows;
        grandTotalWeight += group.totalWeight;
        grandTotalLength += group.totalLength;
    });

    let globalSheetIndex = 0;
    sheetsToReport.forEach((sheet) => {
        const sw = sheet.sheetSize?.width || sheetSize.width;
        const sh = sheet.sheetSize?.height || sheetSize.height;
        const sheetTh = sheet.thickness || 0.8;
        const sheetPartCount = sheet.nestedParts.length;

        const sheetPartCounts = {};
        sheet.nestedParts.forEach(nested => {
            if (!sheetPartCounts[nested.partId]) sheetPartCounts[nested.partId] = 0;
            sheetPartCounts[nested.partId]++;
        });

        let partsBreakdownHTML = '';
        Object.keys(sheetPartCounts).forEach(partId => {
            const part = parts.find(p => p.id == partId);
            if (part) {
                const totalQty = part.quantity || 0;
                const placedQty = sheetPartCounts[partId];
                const name = part.name || `Деталь #${part.id}`;
                partsBreakdownHTML += `<span class="sheet-part-item">${name}: ${totalQty} / ${placedQty}</span>`;
            }
        });

        const sheetThumb = generateSheetThumbnail(sheet, globalSheetIndex, parts, sheetSize);

        sheetSummaryHTML += `
            <div class="sheet-report-card">
                <div class="sheet-report-thumb">${sheetThumb}</div>
                <div class="sheet-report-info">
                    <h3>Лист ${globalSheetIndex + 1}: ${sw} × ${sh} мм (толщ. ${sheetTh.toFixed(1)} мм)</h3>
                    <div class="sheet-report-stats-row">
                        <div class="stat"><span class="stat-label">Деталей</span><span class="stat-value">${sheetPartCount} шт</span></div>
                        <div class="sheet-parts-breakdown">${partsBreakdownHTML}</div>
                    </div>
                </div>
            </div>
        `;
        globalSheetIndex++;
    });

    let grandTotalMetalCost = 0, grandTotalCutCost = 0, grandTotalPierceCost = 0, grandTotalPierceCount = 0;
    Object.keys(reportByThickness).forEach(key => {
        const g = reportByThickness[key];
        const pricePerM2 = getPricePerM2(g.thickness);
        const pricePerKg = getPricePerKg(g.thickness);
        const areaM2 = g.totalWeight / (g.thickness * density);
        grandTotalMetalCost += pricePerM2 > 0 ? areaM2 * pricePerM2 : g.totalWeight * pricePerKg;
        const pricePerMeterCut = getPricePerMeterCut(g.thickness);
        grandTotalCutCost += (g.totalLength / 1000) * pricePerMeterCut;
        
        // v3.55: Расчёт общей стоимости проколов
        // ИСПРАВЛЕНО: g.nestedParts не существует, используем g.sheets.flatMap
        const pricePerPierce = getPricePerPierce(g.thickness);
        const groupPierceCount = g.sheets.flatMap(s => s.nestedParts).reduce((sum, n) => sum + (n.pierceCount || 0), 0);
        grandTotalPierceCount += groupPierceCount;
        grandTotalPierceCost += groupPierceCount * pricePerPierce;
    });

    const pricePerMinute = (typeof pricingSettings?.pricePerMinute === 'number') ? pricingSettings.pricePerMinute : 0;
    const grandTotalTimeCost = (workTimeSeconds / 60) * pricePerMinute;
    const grandTotalCost = grandTotalMetalCost + grandTotalCutCost + grandTotalPierceCost + grandTotalTimeCost;

    const formatTime = (totalSec) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    let unplacedRows = '';
    unplacedParts.forEach(({ part, notPlaced }) => {
        const thumbSVG = generatePartThumbnail(part, 80, 60, parts);
        unplacedRows += `
            <tr>
                <td class="thumb">${thumbSVG}</td>
                <td>${part.name || 'Деталь'}</td>
                <td>${parseFloat(part.bounds.width.toFixed(2))} × ${parseFloat(part.bounds.height.toFixed(2))}</td>
                <td>${(part.thickness || 0.8).toFixed(1)}</td>
                <td>${notPlaced} / ${part.quantity}</td>
                <td colspan="4" style="color:#c00;">Не размещена</td>
            </tr>
        `;
    });

    const now = new Date().toLocaleString('ru-RU');

    const watermarkText = 'Cutsy CAD PRO';

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Отчёт по деталям</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; color: #1a1a1a; }
        .report-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:14px; border-bottom:2px solid #007acc; }
        .header-left { flex:1; }
        .company-name { font-size:20px; font-weight:700; color:#1a1a1a; margin-bottom:2px; }
        .report-title { font-size:16px; color:#007acc; font-weight:600; }
        .header-right { text-align:right; flex-shrink:0; }
        .header-info { font-size:13px; color:#333; margin-bottom:4px; }
        .hi-label { color:#888; }
        .hi-value { font-weight:600; color:#1a1a1a; }
        .section-title { font-size: 16px; color: #333; background: #e8e8e8; padding: 8px 12px; margin: 24px 0 12px 0; border-left: 4px solid #007acc; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0 20px 0; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 12px; }
        th { background: #007acc; color: #fff; padding: 8px 6px; text-align: left; font-weight: 600; position: sticky; top: 0; }
        td { padding: 6px; border-bottom: 1px solid #e0e0e0; vertical-align: middle; }
        tr:hover { background: #f0f7ff; }
        td.thumb { width: 90px; text-align: center; padding: 4px; }
        td.thumb svg { display: block; margin: 0 auto; }
        .summary { background: #fff; border-radius: 6px; padding: 16px 20px; margin: 16px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
        .th-summary { padding: 10px 14px; margin: 8px 0 12px 0; }
        .summary h3 { color: #007acc; margin-bottom: 8px; font-size: 15px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
        .summary-item { background: #f0f7ff; padding: 10px 14px; border-radius: 4px; }
        .summary-item .label { font-size: 11px; color: #888; }
        .summary-item .value { font-size: 18px; font-weight: 700; color: #1a1a1a; margin-top: 2px; }
        .unplaced-table th { background: #c00; }
        .sheet-report-card { background: #fff; border-radius: 6px; margin: 12px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
        .sheet-report-thumb { width: 100%; max-width: 100%; overflow: hidden; margin-bottom: 12px; }
        .sheet-report-thumb svg { width: 100%; height: auto; display: block; }
        .sheet-report-info { padding: 10px 14px; }
        .sheet-report-info h3 { font-size: 14px; color: #333; margin-bottom: 8px; }
        .sheet-report-stats-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
        .sheet-report-stats-row .stat { display: flex; flex-direction: column; min-width: 80px; }
        .sheet-report-stats-row .stat-label { font-size: 10px; color: #888; }
        .sheet-report-stats-row .stat-value { font-size: 13px; font-weight: 700; color: #1a1a1a; }
        .sheet-parts-breakdown { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 4px; flex: 1; }
        .sheet-part-item {
            font-size: 12px;
            font-weight: 700;
            color: #111;
            background: #f0f4f8;
            padding: 5px 9px;
            border-radius: 5px;
            border: 1px solid #b0c4de;
            white-space: nowrap;
            line-height: 1.3;
        }
        @media print {
            @page { size: A4 landscape; margin: 5mm; }
            body { padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            table { box-shadow: none; border: 1px solid #ccc; border-collapse: collapse; }
            th {
                background: #444 !important;
                color: #fff !important;
                position: static !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                padding: 8px 6px;
            }
            .section-title { background: #eee !important; border-bottom: 2px solid #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .summary-item { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet-report-card {
                box-shadow: none;
                border: 2px solid #666;
                page-break-inside: avoid;
                page-break-after: always;
                margin-bottom: 15px;
                overflow: hidden;
                max-height: 190mm;
                display: flex;
                flex-direction: column;
            }
            .sheet-report-thumb {
                width: 100% !important;
                margin-bottom: 10px !important;
                flex: 1;
                min-height: 0;
                max-height: 75%;
                overflow: hidden;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .sheet-report-thumb svg, .sheet-report-thumb img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain;
            }
            .sheet-report-info { width: 100% !important; padding: 5px 0 !important; flex: 0 0 auto; min-height: 50px; }
            .sheet-report-stats-row { flex-direction: column !important; gap: 6px !important; }
            .sheet-parts-breakdown { margin-top: 6px !important; }
            .sheet-part-item {
                background: #fff !important;
                border: 1px solid #999 !important;
                font-weight: 700 !important;
                font-size: 11pt !important;
                padding: 4px 8px !important;
                color: #000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .no-print { display: none !important; }
            .report-header { border-bottom: 3px solid #333 !important; padding-bottom: 10px !important; margin-bottom: 16px !important; }
            .company-name { font-size: 16pt !important; }
            .report-title { font-size: 12pt !important; color: #333 !important; }
            .header-info { font-size: 10pt !important; }
            /* Watermark для печати */
            .watermark {
                position: fixed !important;
                bottom: 15px !important;
                left: 0 !important;
                right: 0 !important;
                text-align: center !important;
                color: #999 !important;
                font-size: 11pt !important;
                font-weight: 600 !important;
                opacity: 0.5 !important;
                pointer-events: none !important;
                z-index: 9999 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
        }
    </style>
</head>
<body>
    <!-- Watermark фоновый -->
    <div class="watermark">
        ${watermarkText} | <strong>cutsypro.ru</strong>
    </div>

    <div class="report-header">
        <div class="header-left">
            ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
            <div class="report-title">Отчёт по раскладке деталей</div>
            <div class="report-subtitle" style="font-size:11px;color:#666;margin-top:2px;">${materialInfo.icon} ${materialInfo.name} (плотность ${materialInfo.density} г/см³)</div>
        </div>
        <div class="header-right">
            ${orderNumber ? `<div class="header-info"><span class="hi-label">Заказ:</span> <span class="hi-value">${orderNumber}</span></div>` : ''}
            ${clientPhone ? `<div class="header-info"><span class="hi-label">Тел. клиента:</span> <span class="hi-value">${clientPhone}</span></div>` : ''}
            <div class="header-info"><span class="hi-label">Дата:</span> <span class="hi-value">${now}</span></div>
        </div>
    </div>

${thSectionHTML}

    <table>
        <thead>
            <tr>
                <th style="width:90px;">Миниатюра</th>
                <th>Название</th>
                <th>Размер (мм)</th>
                <th>Толщ. (мм)</th>
                <th>Кол-во</th>
                <th>Вес 1 шт (кг)</th>
                <th>Вес всего (кг)</th>
                <th>Длина реза (м)</th>
                <th>Проколов (шт)</th>
                <th>Сумма за проколы (₽)</th>
                <th>Сумма за резку (₽)</th>
                <th>Сумма за металл (₽)</th>
                <th>Итого (₽)</th>
            </tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>

    ${unplacedParts.length > 0 ? `
    <h2 class="section-title" style="border-left-color:#c00;">Не размещённые детали</h2>
    <table class="unplaced-table">
        <thead>
            <tr>
                <th style="width:90px;">Миниатюра</th>
                <th>Название</th>
                <th>Размер (мм)</th>
                <th>Толщ. (мм)</th>
                <th>Не разм. / Всего</th>
                <th colspan="3">Статус</th>
            </tr>
        </thead>
        <tbody>
            ${unplacedRows}
        </tbody>
    </table>
    ` : ''}

    ${sheetSummaryHTML ? `
    <h2 class="section-title">Сводка по листам</h2>
    ${sheetSummaryHTML}
    ` : ''}

    <div class="summary" style="margin-top: 24px;">
        <h3>Общая сводка</h3>
        <div class="summary-grid">
            <div class="summary-item"><div class="label">Листов</div><div class="value">${grandTotalSheets}</div></div>
            <div class="summary-item"><div class="label">Размещено деталей</div><div class="value">${grandTotalPlaced} шт</div></div>
            <div class="summary-item"><div class="label">Не размещено</div><div class="value">${unplacedParts.reduce((s, u) => s + u.notPlaced, 0)} шт</div></div>
            <div class="summary-item"><div class="label">Общий вес</div><div class="value">${grandTotalWeight.toFixed(3)} кг</div></div>
            <div class="summary-item"><div class="label">Длина реза</div><div class="value">${(grandTotalLength / 1000).toFixed(2)} м</div></div>
            <div class="summary-item"><div class="label">Проколов всего</div><div class="value">${grandTotalPierceCount} шт</div></div>
            <div class="summary-item"><div class="label">Стоимость реза итого </div><div class="value">${grandTotalCutCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Стоимость проколов</div><div class="value">${grandTotalPierceCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Стоимость всех деталей кг/м2</div><div class="value">${grandTotalMetalCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Время работы</div><div class="value">${workTimeSeconds > 0 ? formatTime(workTimeSeconds) : '—'}</div></div>
            <div class="summary-item"><div class="label">Стоимость времени</div><div class="value">${grandTotalTimeCost > 0 ? grandTotalTimeCost.toFixed(2) + ' ₽' : '—'}</div></div>
            <div class="summary-item" style="background:#e8f5e9;"><div class="label">ИТОГО</div><div class="value">${grandTotalCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Площадь остатка</div><div class="value">${(remnantArea / 1000000).toFixed(3)} м²</div></div>
            <div class="summary-item"><div class="label">Вес остатка</div><div class="value">${remnantWeight.toFixed(3)} кг</div></div>
            <div class="summary-item"><div class="label">КПД материала</div><div class="value">${(grandTotalWeight + remnantWeight > 0 ? (grandTotalWeight / (grandTotalWeight + remnantWeight) * 100).toFixed(1) : '0.0')}%</div></div>
        </div>
    </div>

    <p class="no-print" style="text-align:center;margin-top:20px;color:#888;font-size:12px;">
        Нажмите Ctrl+P для сохранения в PDF
    </p>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
}

document.addEventListener('DOMContentLoaded', () => {
    const exportPdfBtn = document.getElementById('exportPdf');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportPdfReport);
    }
});