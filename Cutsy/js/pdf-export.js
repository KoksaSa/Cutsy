// ═══════════════════════════════════════════════════════════
// pdf-export.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ЭКСПОРТ ЧЕРТЕЖА В PDF (A4, белый фон, чёрные линии)
// ═══════════════════════════════════════════════════════════
document.getElementById('exportDrawingPdf').addEventListener('click', () => {
    if (objects.length === 0) {
        alert('Нет объектов для экспорта');
        return;
    }

    // ─── Масштаб чертежа (сохраняется в localStorage) ───
    let zoomLevel = parseFloat(localStorage.getItem('pdfZoomLevel')) || 1.0;
    zoomLevel = Math.max(0.1, Math.min(10, zoomLevel)); // clamp 0.1x – 10x

    // ─── Диалог выбора масштаба ───
    const existingDialog = document.getElementById('pdfZoomDialog');
    if (existingDialog) existingDialog.remove();

    const dialog = document.createElement('div');
    dialog.id = 'pdfZoomDialog';
    dialog.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6); z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        font-family: Segoe UI, sans-serif;
    `;
    dialog.innerHTML = `
        <div style="
            background: #1e1e2e; border: 1px solid #3c3c3c; border-radius: 12px;
            padding: 28px 32px; min-width: 380px; box-shadow: 0 12px 40px rgba(0,0,0,0.6);
            color: #fff;
        ">
            <h3 style="margin: 0 0 6px 0; font-size: 16px; color: #00bfff;">📐 Масштаб чертежа</h3>
            <p style="margin: 0 0 18px 0; color: #aaa; font-size: 12px;">
                Ближе = крупнее деталь, Дале = мельче
            </p>

            <div style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
                <label style="color:#aaa; font-size:12px; white-space:nowrap;">Масштаб:</label>
                <input type="range" id="pdfZoomSlider" min="0.1" max="5" step="0.05" value="${zoomLevel}"
                    style="flex:1; accent-color: #00bfff; height: 20px; cursor: pointer;">
                <span id="pdfZoomValue" style="
                    background: #2a2a3a; padding: 4px 12px; border-radius: 6px;
                    font-size: 14px; font-weight: bold; min-width: 60px; text-align: center;
                ">${zoomLevel.toFixed(2)}x</span>
            </div>

            <div style="display:flex; gap:8px; justify-content:flex-end; margin-bottom:14px;">
                <button id="pdfZoomReset" style="
                    padding: 6px 14px; background: #3c3c3c; color: #ccc; border: none;
                    border-radius: 6px; cursor: pointer; font-size: 12px;
                ">1:1</button>
                <span style="color:#555; font-size:11px; line-height:28px;">— быстрый сброс</span>
            </div>

            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="pdfZoomCancel" style="
                    padding: 8px 20px; background: #3c3c3c; color: #fff; border: none;
                    border-radius: 6px; cursor: pointer; font-size: 13px;
                ">Отмена</button>
                <button id="pdfZoomExport" style="
                    padding: 8px 20px; background: #007acc; color: #fff; border: none;
                    border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;
                ">📄 Экспорт PDF</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    const slider = dialog.querySelector('#pdfZoomSlider');
    const valueLabel = dialog.querySelector('#pdfZoomValue');

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valueLabel.textContent = v.toFixed(2) + 'x';
    });

    dialog.querySelector('#pdfZoomCancel').addEventListener('click', () => {
        dialog.remove();
    });

    dialog.querySelector('#pdfZoomReset').addEventListener('click', () => {
        slider.value = 1;
        valueLabel.textContent = '1.00x';
    });

    dialog.querySelector('#pdfZoomExport').addEventListener('click', () => {
        zoomLevel = parseFloat(slider.value);
        localStorage.setItem('pdfZoomLevel', zoomLevel.toFixed(3));
        dialog.remove();
        doExport(zoomLevel);
    });

    // Закрытие по ESC
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            dialog.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Закрытие по клику на фон
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            dialog.remove();
        }
    });
});

// ─── Основная функция экспорта с переданным масштабом ───
function doExport(zoomLevel) {
    // Создаём canvas для экспорта
    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');
    exportCanvas.width = 1190; // A4 landscape в пикселях при 96 DPI
    exportCanvas.height = 842;

    // Находим границы всех объектов
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach(obj => {
        const points = obj.getPoints();
        points.forEach(pt => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        });
    });

    // Добавляем размерные линии в границы
    dimensionLines.forEach(dim => {
        minX = Math.min(minX, dim.x1, dim.x2);
        minY = Math.min(minY, dim.y1, dim.y2);
        maxX = Math.max(maxX, dim.x1, dim.x2);
        maxY = Math.max(maxY, dim.y1, dim.y2);
    });

    // ═══════════════════════════════════════════════════════════════
    // ДОБАВЛЯЕМ УГЛОВЫЕ РАЗМЕРЫ В ГРАНИЦЫ
    // ═══════════════════════════════════════════════════════════════
    if (typeof angleDimensions !== 'undefined' && angleDimensions.length > 0) {
        angleDimensions.forEach(angleDim => {
            // Точка вершины угла
            minX = Math.min(minX, angleDim.x);
            minY = Math.min(minY, angleDim.y);
            maxX = Math.max(maxX, angleDim.x);
            maxY = Math.max(maxY, angleDim.y);

            // Концы линий угла
            minX = Math.min(minX, angleDim.x1, angleDim.x2);
            minY = Math.min(minY, angleDim.y1, angleDim.y2);
            maxX = Math.max(maxX, angleDim.x1, angleDim.x2);
            maxY = Math.max(maxY, angleDim.y1, angleDim.y2);

            // Дуга угла (радиус может выходить за пределы линий)
            const arcR = angleDim.radius || 50;
            minX = Math.min(minX, angleDim.x - arcR);
            minY = Math.min(minY, angleDim.y - arcR);
            maxX = Math.max(maxX, angleDim.x + arcR);
            maxY = Math.max(maxY, angleDim.y + arcR);

            // Текст размера (выноска на radius + 15)
            const textOffset = arcR + 20;
            minX = Math.min(minX, angleDim.x - textOffset);
            minY = Math.min(minY, angleDim.y - textOffset);
            maxX = Math.max(maxX, angleDim.x + textOffset);
            maxY = Math.max(maxY, angleDim.y + textOffset);
        });
    }

    // Добавляем отступы (увеличиваем для угловых размеров)
    const padding = 80;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Вычисляем масштаб для центрирования
    const objectWidth = maxX - minX;
    const objectHeight = maxY - minY;
    const scaleX = exportCanvas.width / objectWidth;
    const scaleY = exportCanvas.height / objectHeight;
    // Базовый auto-scale, затем умножаем на zoomLevel
    const autoScale = Math.min(scaleX, scaleY, 2);
    const scale = autoScale * zoomLevel;

    // Вычисляем смещение для центрирования
    const offsetX = (exportCanvas.width - objectWidth * scale) / 2 - minX * scale;
    const offsetY = (exportCanvas.height - objectHeight * scale) / 2 - minY * scale;

    // Белый фон
    exportCtx.fillStyle = '#ffffff';
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Копируем все объекты
    const originalObjects = objects.map(obj => {
        if (obj.type === 'line') {
            return new Line(obj.x1, obj.y1, obj.x2, obj.y2);
        } else if (obj.type === 'circle') {
            return new Circle(obj.cx, obj.cy, obj.radius);
        } else if (obj.type === 'rect') {
            return new Rect(obj.x, obj.y, obj.width, obj.height);
        } else if (obj.type === 'polygon') {
            // v4.68: Если polygon имеет points (CustomPolygon из rotate/mirror) —
            // копируем точки напрямую. Иначе — правильный Polygon (cx/cy/radius/sides).
            if (obj.points && obj.points.length >= 3) {
                return {
                    type: 'polygon',
                    points: obj.points.map(p => ({ x: p.x, y: p.y })),
                    closed: true
                };
            }
            const p = new Polygon(obj.cx, obj.cy, obj.radius, obj.sides);
            return p;
        } else if (obj.type === 'text') {
            return new Text(obj.x, obj.y, obj.text, obj.fontSize);
        } else if (obj.type === 'arc') {
            return {
                type: 'arc',
                cx: obj.cx,
                cy: obj.cy,
                radius: obj.radius,
                startAngle: obj.startAngle,
                endAngle: obj.endAngle,
                direction: obj.direction
            };
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            return {
                type: obj.type,
                points: (obj.points || obj.vertices || []).map(p => ({ x: p.x, y: p.y })),
                closed: obj.closed
            };
        }
    }).filter(obj => obj !== undefined);

    // Копируем размерные линии
    const dimensionLinesCopy = dimensionLines.map(dim => ({
        x1: dim.x1, y1: dim.y1, x2: dim.x2, y2: dim.y2,
        value: dim.value, type: dim.type
    }));

    // Применяем трансформацию
    exportCtx.save();
    exportCtx.translate(offsetX, offsetY);
    exportCtx.scale(scale, scale);

    // Рисуем все объекты чёрным цветом
    exportCtx.strokeStyle = '#000000';
    exportCtx.lineWidth = 2 / scale;
    exportCtx.fillStyle = '#000000';
    exportCtx.textAlign = 'left';
    exportCtx.textBaseline = 'top';

    originalObjects.forEach(obj => {
        if (obj.type === 'line') {
            exportCtx.beginPath();
            exportCtx.moveTo(obj.x1, obj.y1);
            exportCtx.lineTo(obj.x2, obj.y2);
            exportCtx.stroke();
        } else if (obj.type === 'circle') {
            exportCtx.beginPath();
            exportCtx.arc(obj.cx, obj.cy, obj.radius, 0, Math.PI * 2);
            exportCtx.stroke();
        } else if (obj.type === 'rect') {
            exportCtx.strokeRect(obj.x, obj.y, obj.width, obj.height);
        } else if (obj.type === 'polygon') {
            // v4.68: Поддержка CustomPolygon (points) и правильного Polygon (getVertices)
            const v = (obj.points) ? obj.points : (typeof obj.getVertices === 'function' ? obj.getVertices() : []);
            if (v.length < 2) return;
            exportCtx.beginPath();
            exportCtx.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) {
                exportCtx.lineTo(v[i].x, v[i].y);
            }
            exportCtx.closePath();
            exportCtx.stroke();
        } else if (obj.type === 'text') {
            // Масштабируем размер шрифта обратно пропорционально scale
            // чтобы текст оставался читаемого размера независимо от масштаба
            const scaledFontSize = Math.max(10, Math.min(24, obj.fontSize / scale * 1.5));
            exportCtx.save();
            exportCtx.font = `${scaledFontSize}px Segoe UI`;
            exportCtx.textAlign = 'left';
            exportCtx.textBaseline = 'top';
            exportCtx.fillText(obj.text, obj.x, obj.y);
            exportCtx.restore();
        } else if (obj.type === 'arc') {
            const r = Math.abs(obj.radius || 0);
            const sa = obj.startAngle ?? 0;
            const ea = obj.endAngle ?? (2 * Math.PI);
            // direction: 'CCW' или >=0 → математическое CCW → Canvas counterclockwise = false
            // direction: 'CW' или <0 → математическое CW → Canvas counterclockwise = true
            const isCW = (obj.direction === 'CW') || (typeof obj.direction === 'number' && obj.direction < 0);
            exportCtx.beginPath();
            exportCtx.arc(obj.cx, obj.cy, r, sa, ea, isCW);
            exportCtx.stroke();
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const vertices = obj.points || [];
            if (vertices.length > 1) {
                exportCtx.beginPath();
                exportCtx.moveTo(vertices[0].x, vertices[0].y);
                for (let i = 1; i < vertices.length; i++) {
                    exportCtx.lineTo(vertices[i].x, vertices[i].y);
                }
                if (obj.closed) {
                    exportCtx.closePath();
                }
                exportCtx.stroke();
            }
        }
    });

    // Рисуем размерные линии
    exportCtx.strokeStyle = '#000000';
    exportCtx.lineWidth = 1 / scale;
    exportCtx.fillStyle = '#000000';
    // Масштабируем размер шрифта обратно пропорционально scale
    // чтобы текст размеров оставался читаемым независимо от масштаба
    const dimensionFontSize = Math.max(14, Math.min(24, 30 / scale));
    exportCtx.font = `${dimensionFontSize}px Segoe UI`;
    exportCtx.textAlign = 'center';
    exportCtx.textBaseline = 'bottom';

    dimensionLinesCopy.forEach(dim => {
        const midX = (dim.x1 + dim.x2) / 2;
        const midY = (dim.y1 + dim.y2) / 2;
        const tickSize = 8 / scale;

        // Вычисляем угол линии для правильных засечек
        const dx = dim.x2 - dim.x1;
        const dy = dim.y2 - dim.y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const isVertical = Math.abs(angle) > Math.PI / 4 && Math.abs(angle) < 3 * Math.PI / 4;

        // Основная линия
        exportCtx.beginPath();
        exportCtx.moveTo(dim.x1, dim.y1);
        exportCtx.lineTo(dim.x2, dim.y2);
        exportCtx.stroke();

        // Засечки (перпендикулярно линии размера)
        const perpAngle = angle + Math.PI / 2;
        const tick1x1 = dim.x1 + Math.cos(perpAngle) * tickSize;
        const tick1y1 = dim.y1 + Math.sin(perpAngle) * tickSize;
        const tick1x2 = dim.x1 - Math.cos(perpAngle) * tickSize;
        const tick1y2 = dim.y1 - Math.sin(perpAngle) * tickSize;

        const tick2x1 = dim.x2 + Math.cos(perpAngle) * tickSize;
        const tick2y1 = dim.y2 + Math.sin(perpAngle) * tickSize;
        const tick2x2 = dim.x2 - Math.cos(perpAngle) * tickSize;
        const tick2y2 = dim.y2 - Math.sin(perpAngle) * tickSize;

        exportCtx.beginPath();
        exportCtx.moveTo(tick1x1, tick1y1);
        exportCtx.lineTo(tick1x2, tick1y2);
        exportCtx.moveTo(tick2x1, tick2y1);
        exportCtx.lineTo(tick2x2, tick2y2);
        exportCtx.stroke();

        // Текст размера — поворачивается вместе с линией (как на canvas)
        exportCtx.save();
        exportCtx.translate(midX, midY);
        let textAngle = angle;
        if (Math.abs(textAngle) > Math.PI / 2) {
            textAngle = textAngle > 0 ? textAngle - Math.PI : textAngle + Math.PI;
        }
        exportCtx.rotate(textAngle);
        exportCtx.fillText(dim.value.toString(), 0, -tickSize);
        exportCtx.restore();
    });

    // ═══════════════════════════════════════════════════════════════
    // РИСУЕМ УГЛОВЫЕ РАЗМЕРЫ
    // ═══════════════════════════════════════════════════════════════
    if (typeof angleDimensions !== 'undefined' && angleDimensions.length > 0) {
        console.log(`📐 Экспорт угловых размеров в PDF: ${angleDimensions.length} шт.`);

        // Восстанавливаем контекст перед отрисовкой углов
        exportCtx.restore();
        exportCtx.save();
        exportCtx.translate(offsetX, offsetY);
        exportCtx.scale(scale, scale);

        exportCtx.strokeStyle = '#000000';
        exportCtx.lineWidth = 1 / scale;
        exportCtx.fillStyle = '#000000';

        const angleFontSize = Math.max(14, Math.min(24, 30 / scale));
        exportCtx.font = `bold ${angleFontSize}px Segoe UI`;
        exportCtx.textAlign = 'center';
        exportCtx.textBaseline = 'middle';

        angleDimensions.forEach(angleDim => {
            // Линия 1
            exportCtx.beginPath();
            exportCtx.moveTo(angleDim.x, angleDim.y);
            exportCtx.lineTo(angleDim.x1, angleDim.y1);
            exportCtx.stroke();

            // Линия 2
            exportCtx.beginPath();
            exportCtx.moveTo(angleDim.x, angleDim.y);
            exportCtx.lineTo(angleDim.x2, angleDim.y2);
            exportCtx.stroke();

            // Дуга угла
            const radius = angleDim.radius;
            let startAngle = angleDim.startAngle;
            let endAngle = angleDim.endAngle;

            // ═══ ВЫЧИСЛЯЕМ МЕНЬШИЙ УГОЛ (< 180°) ДЛЯ ОТРИСОВКИ ═══
            let angleSpan = endAngle - startAngle;
            if (angleSpan < 0) angleSpan += Math.PI * 2;
            
            if (angleSpan > Math.PI) {
                const temp = startAngle;
                startAngle = endAngle;
                endAngle = temp;
                angleSpan = Math.PI * 2 - angleSpan;
            }

            exportCtx.beginPath();
            exportCtx.arc(angleDim.x, angleDim.y, radius, startAngle, endAngle);
            exportCtx.stroke();

            // Текст размера (в середине дуги)
            let midAngle = startAngle + angleSpan / 2;
            if (midAngle > Math.PI * 2) midAngle -= Math.PI * 2;

            // ═══ УЛУЧШЕННОЕ РАЗМЕЩЕНИЕ ТЕКСТА (как на canvas) ═══
            const angleSpanDeg = angleSpan * 180 / Math.PI;
            const textOffset = angleSpanDeg < 30 ? radius + 25 : radius + 15;

            const textX = angleDim.x + Math.cos(midAngle) * textOffset;
            const textY = angleDim.y + Math.sin(midAngle) * textOffset;

            exportCtx.fillText(angleDim.value + '°', textX, textY);
        });

        exportCtx.restore();
    } else {
        exportCtx.restore();
    }

    // ─── Индикатор масштаба на чертеже ───
    const scaleLabel = `Масштаб: ${zoomLevel.toFixed(2)}x`;
    exportCtx.restore(); // снимем трансформацию
    exportCtx.fillStyle = 'rgba(0,0,0,0.5)';
    exportCtx.font = 'bold 11px Segoe UI';
    exportCtx.textAlign = 'right';
    exportCtx.textBaseline = 'bottom';
    exportCtx.fillText(scaleLabel, exportCanvas.width - 12, exportCanvas.height - 10);

    // Открываем в новом окне для печати
    const printWindow = window.open('', '_blank');
    const today = new Date().toLocaleDateString('ru-RU', { 
        day: 'numeric', month: 'long', year: 'numeric' 
    });
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Чертеж</title>
            <style>
                body { margin: 0; padding: 20px; text-align: center; font-family: Arial, sans-serif; }
                img { max-width: 100%; border: 1px solid #ccc; }
                .footer { color: #999; font-size: 11pt; font-weight: 600; margin-top: 15px; opacity: 0.7; }
                @media print { 
                    body { padding: 0; }
                    .footer {
                        position: fixed;
                        bottom: 15px;
                        left: 0;
                        right: 0;
                        text-align: center;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                }
            </style>
        </head>
        <body>
            <img src="${exportCanvas.toDataURL('image/png')}" alt="Чертеж">
            <p class="footer">Cutsy CAD PRO | <strong>cutsypro.ru</strong></p>
        </body>
        </html>
    `);
    printWindow.document.close();
}

