// ═══════════════════════════════════════════════════════════════
// PDF REPORT EXPORT
// Экспорт отчёта по раскладке деталей в PDF
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
    const sw = 1.2;

    let svgContent = '';

    part.objects.forEach(obj => {
        if (obj.type === 'line') {
            const x1 = ox + (obj.x1 - bounds.minX + pad) * scale;
            const y1 = oy + (obj.y1 - bounds.minY + pad) * scale;
            const x2 = ox + (obj.x2 - bounds.minX + pad) * scale;
            const y2 = oy + (obj.y2 - bounds.minY + pad) * scale;
            svgContent += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'circle') {
            const cx = ox + (obj.cx - bounds.minX + pad) * scale;
            const cy = oy + (obj.cy - bounds.minY + pad) * scale;
            const r = obj.radius * scale;
            svgContent += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'rect') {
            const x = ox + (obj.x - bounds.minX + pad) * scale;
            const y = oy + (obj.y - bounds.minY + pad) * scale;
            const w = obj.width * scale;
            const h = obj.height * scale;
            svgContent += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
        } else if (obj.type === 'polygon') {
            const pts = obj.getPoints().map(p => {
                const px = ox + (p.x - bounds.minX + pad) * scale;
                const py = oy + (p.y - bounds.minY + pad) * scale;
                return `${px.toFixed(1)},${py.toFixed(1)}`;
            }).join(' ');
            svgContent += `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
        }
    });

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background:#fff;border:1px solid #ccc;border-radius:3px;">${svgContent}</svg>`;
}

/**
 * Генерация миниатюры раскладки листа
 * @param {Object} sheet - Объект листа с nestedParts
 * @param {number} sheetIndex - Индекс листа
 * @param {Array} parts - Массив деталей
 * @param {Object} sheetSize - Размер листа
 * @returns {string} SVG строка
 */
function generateSheetThumbnail(sheet, sheetIndex, parts, sheetSize) {
    const w = 300, h = 200;
    const sw = sheet.sheetSize?.width || sheetSize.width;
    const sh = sheet.sheetSize?.height || sheetSize.height;
    const scale = Math.min((w - 20) / sw, (h - 20) / sh);
    const ox = (w - sw * scale) / 2;
    const oy = 20 + (h - 20 - sh * scale) / 2;

    let svgContent = `<rect x="${ox}" y="${oy}" width="${(sw * scale).toFixed(1)}" height="${(sh * scale).toFixed(1)}" fill="#f0f0f0" stroke="#999" stroke-width="1"/>`;

    const colors = ['#4a90d9','#d94a4a','#4ad97a','#d9c44a','#9a4ad9','#4ad9c4','#d97a4a','#4a7ad9','#d94a9a','#7ad94a'];
    const partColors = {};

    // Поворот точки вокруг центра
    const rotatePoint = (px, py, angle, cx, cy) => {
        if (angle === 0) return { x: px, y: py };
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: cx + (px - cx) * cos - (py - cy) * sin,
            y: cy + (px - cx) * sin + (py - cy) * cos
        };
    };

    sheet.nestedParts.forEach((nested) => {
        const part = parts.find(p => p.id === nested.partId);
        if (!part) return;

        // Цвет по part.id
        if (!partColors[part.id]) {
            const colorIndex = Math.abs(parseInt(part.id) % colors.length);
            partColors[part.id] = colors[colorIndex];
        }

        const strokeColor = partColors[part.id];
        const strokeWidth = 0.8;

        const rotationAngle = nested.angle || 0;
        const bboxWidth = nested.baseWidth || nested.width;
        const bboxHeight = nested.baseHeight || nested.height;
        const centerX = bboxWidth / 2;
        const centerY = bboxHeight / 2;

        // refPoint
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
        const drawX = ox + nested.x * scale;
        const drawY = oy + nested.y * scale;

        const objectsToDraw = nested.objects && nested.objects.length > 0 ? nested.objects : part.objects;

        if (objectsToDraw && objectsToDraw.length > 0) {
            objectsToDraw.forEach(obj => {
                if (obj.type === 'line') {
                    const p1 = rotatePoint(obj.x1 - normOffsetX, obj.y1 - normOffsetY, rotationAngle, centerX, centerY);
                    const p2 = rotatePoint(obj.x2 - normOffsetX, obj.y2 - normOffsetY, rotationAngle, centerX, centerY);
                    svgContent += `<line x1="${(drawX + (p1.x - refPoint.x) * scale).toFixed(1)}" y1="${(drawY + (p1.y - refPoint.y) * scale).toFixed(1)}" x2="${(drawX + (p2.x - refPoint.x) * scale).toFixed(1)}" y2="${(drawY + (p2.y - refPoint.y) * scale).toFixed(1)}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                } else if (obj.type === 'circle') {
                    const rc = rotatePoint(obj.cx - normOffsetX, obj.cy - normOffsetY, rotationAngle, centerX, centerY);
                    svgContent += `<circle cx="${(drawX + (rc.x - refPoint.x) * scale).toFixed(1)}" cy="${(drawY + (rc.y - refPoint.y) * scale).toFixed(1)}" r="${(obj.radius * scale).toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                } else if (obj.type === 'rect') {
                    const corners = [
                        { x: obj.x - normOffsetX, y: obj.y - normOffsetY },
                        { x: obj.x + obj.width - normOffsetX, y: obj.y - normOffsetY },
                        { x: obj.x + obj.width - normOffsetX, y: obj.y + obj.height - normOffsetY },
                        { x: obj.x - normOffsetX, y: obj.y + obj.height - normOffsetY }
                    ];
                    const rc = corners.map(c => rotatePoint(c.x, c.y, rotationAngle, centerX, centerY));
                    const pts = rc.map(c => `${(drawX + (c.x - refPoint.x) * scale).toFixed(1)},${(drawY + (c.y - refPoint.y) * scale).toFixed(1)}`).join(' ');
                    svgContent += `<polygon points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                } else if (obj.type === 'polygon') {
                    const vertices = obj.getVertices ? obj.getVertices() : [];
                    if (vertices.length > 0) {
                        const rv = vertices.map(v => rotatePoint(v.x - normOffsetX, v.y - normOffsetY, rotationAngle, centerX, centerY));
                        const pts = rv.map(v => `${(drawX + (v.x - refPoint.x) * scale).toFixed(1)},${(drawY + (v.y - refPoint.y) * scale).toFixed(1)}`).join(' ');
                        svgContent += `<polygon points="${pts}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
                    }
                }
            });
        } else {
            const px = drawX + (0 - refPoint.x) * scale;
            const py = drawY + (0 - refPoint.y) * scale;
            const pw = bboxWidth * scale;
            const ph = bboxHeight * scale;
            svgContent += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="${strokeColor}" fill-opacity="0.4" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`;
        }
    });

    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="border:1px solid #ccc;border-radius:3px;background:#fafafa;">
        <text x="${w / 2}" y="14" text-anchor="middle" font-size="11" font-weight="bold" fill="#333">Лист ${sheetIndex + 1}: ${sw}×${sh} мм (${sheet.nestedParts.length} дет.)</text>
        ${svgContent}
    </svg>`;
}

/**
 * Экспорт отчёта в PDF
 */
function exportPdfReport() {
    // Используем Store для получения данных
    const parts = Store.get('parts') || [];
    const nestedParts = Store.get('nestedParts') || [];
    const allSheets = Store.get('allSheets') || [];
    const sheetSize = Store.get('sheetSize') || { width: 1250, height: 2500 };
    
    console.log('📊 [PDF Export] allSheets:', allSheets);
    console.log('📊 [PDF Export] allSheets.length:', allSheets.length);
    allSheets.forEach((sheet, idx) => {
        console.log(`   Лист ${idx + 1}: thickness=${sheet.thickness}, nestedParts=${sheet.nestedParts?.length}`);
    });
    
    if (parts.length === 0) {
        alert('Сначала создайте детали (кнопка "📦 Создать деталь")');
        return;
    }

    const sheetsToReport = (allSheets && allSheets.length > 0)
        ? allSheets
        : [{ nestedParts: nestedParts, sheetSize: sheetSize, thickness: 0.8 }];

    const totalNestedAll = sheetsToReport.reduce((s, sh) => s + sh.nestedParts.length, 0);
    if (totalNestedAll === 0) {
        alert('Сначала выполните раскладку (кнопка "📑 Раскладка (все листы)")');
        return;
    }

    // Загружаем настройки цен
    const pricingSettings = loadPricingSettings();

    const getPricePerKg = (thickness) => {
        const thKey = thickness.toFixed(1);
        return pricingSettings.pricePerKg[thKey] || pricingSettings.pricePerKg[thickness] || 0;
    };

    const getPricePerM2 = (thickness) => {
        const thKey = thickness.toFixed(1);
        return pricingSettings.pricePerM2[thKey] || pricingSettings.pricePerM2[thickness] || 0;
    };

    const density = 7.85;
    const reportByThickness = {};

    // СБОР ДАННЫХ ПО ТОЛЩИНЕ
    sheetsToReport.forEach(sheet => {
        const thickness = sheet.thickness || 0.8;
        const key = thickness.toFixed(1);
        if (!reportByThickness[key]) {
            reportByThickness[key] = {
                thickness,
                sheets: [],
                groupedNested: {},
                totalWeight: 0,
                totalLength: 0,
                totalPlaced: 0
            };
        }
        reportByThickness[key].sheets.push({
            sheetSize: sheet.sheetSize || sheetSize,
            nestedCount: sheet.nestedParts.length,
            nestedParts: sheet.nestedParts
        });

        sheet.nestedParts.forEach(nested => {
            if (!reportByThickness[key].groupedNested[nested.partId]) {
                reportByThickness[key].groupedNested[nested.partId] = 0;
            }
            reportByThickness[key].groupedNested[nested.partId]++;
            reportByThickness[key].totalPlaced++;
        });
    });

    // НЕ РАЗМЕЩЁННЫЕ ДЕТАЛИ
    const unplacedParts = [];
    parts.forEach(part => {
        const totalPlaced = sheetsToReport.reduce((s, sh) => s + sh.nestedParts.filter(n => n.partId === part.id).length, 0);
        const notPlaced = part.quantity - totalPlaced;
        if (notPlaced > 0) unplacedParts.push({ part, notPlaced });
    });

    // РАСЧЁТ ОСТАТКА
    const totalSheetArea = sheetsToReport.reduce((s, sh) => s + (sh.sheetSize?.width || sheetSize.width) * (sh.sheetSize?.height || sheetSize.height), 0);
    const usedArea = sheetsToReport.reduce((s, sh) => s + sh.nestedParts.reduce((ss, n) => {
        const p = parts.find(pp => pp.id === n.partId);
        return ss + (p ? p.bounds.width * p.bounds.height : 0);
    }, 0), 0);
    const remnantArea = Math.max(0, totalSheetArea - usedArea);
    const avgTh = Object.values(reportByThickness).reduce((s, g) => s + g.thickness * g.sheets.length, 0) / sheetsToReport.length;
    const remnantWeight = remnantArea * avgTh * density / 1000000;

    // ПОЛУЧАЕМ ВРЕМЯ СЕКУНДОМЕРА И РАСПРЕДЕЛЯЕМ ЕГО
    const stopwatchTime = (typeof window.getStopwatchTime === 'function') ? window.getStopwatchTime() : 0;
    const useStopwatch = stopwatchTime > 0;
    
    // Считаем общее время раскладки из листов (резерв)
    let grandTotalNestingTimeReserve = 0;
    Object.values(reportByThickness).forEach(g => {
        grandTotalNestingTimeReserve += g.sheets.reduce((s, sh) => s + (sh.nestingTime || 0), 0);
    });
    
    const workTimeSeconds = useStopwatch ? stopwatchTime : grandTotalNestingTimeReserve;
    
    // Распределяем время секундомера пропорционально по группам толщин
    let timeDistribution = {};
    if (useStopwatch) {
        const totalPlacedAll = Object.values(reportByThickness).reduce((s, g) => s + g.totalPlaced, 0);
        Object.keys(reportByThickness).forEach(key => {
            const g = reportByThickness[key];
            const ratio = totalPlacedAll > 0 ? g.totalPlaced / totalPlacedAll : 0;
            timeDistribution[key] = Math.round(workTimeSeconds * ratio);
        });
    }

    // ФОРМИРОВАНИЕ HTML
    let grandTotalWeight = 0;
    let grandTotalLength = 0;
    let grandTotalSheets = 0;
    let grandTotalPlaced = 0;

    let tableRows = '';
    let thSectionHTML = '';
    let sheetSummaryHTML = '';
    let partDetailRows = '';

    Object.keys(reportByThickness).forEach(key => {
        const group = reportByThickness[key];
        const th = group.thickness;
        grandTotalSheets += group.sheets.length;
        grandTotalPlaced += group.totalPlaced;

        let groupTableRows = '';
        Object.keys(group.groupedNested).forEach(partId => {
            const part = parts.find(p => p.id == partId);
            if (!part) return;

            const area = part.bounds.width * part.bounds.height;
            const weight = area * th * density / 1000000;
            const perimeter = calculatePartPerimeter(part);
            const count = group.groupedNested[partId];

            const totalW = weight * count;
            const totalL = perimeter * count;
            group.totalWeight += totalW;
            group.totalLength += totalL;

            const thumbSVG = generatePartThumbnail(part, 80, 60, parts);
            const pricePerMeterCut = getPricePerMeterCut(th);
            const partCutCost = (totalL / 1000) * pricePerMeterCut;
            // Расчёт стоимости металла: приоритет цене за м², если задана
            const partPricePerM2 = getPricePerM2(th);
            const partPricePerKg = getPricePerKg(th);
            const partAreaM2 = totalW / (th * density);
            const partMetalCost = partPricePerM2 > 0 ? partAreaM2 * partPricePerM2 : totalW * partPricePerKg;
            const partTotalCost = partMetalCost + partCutCost;

            groupTableRows += `
                <tr>
                    <td class="thumb">${thumbSVG}</td>
                    <td>${part.name || 'Деталь'}</td>
                    <td>${Math.round(part.bounds.width)} × ${Math.round(part.bounds.height)}</td>
                    <td>${th}</td>
                    <td>${count}</td>
                    <td>${totalW.toFixed(3)}</td>
                    <td>${(totalL / 1000).toFixed(3)}</td>
                    <td>${partCutCost.toFixed(2)}</td>
                    <td>${partMetalCost.toFixed(2)}</td>
                    <td><b>${partTotalCost.toFixed(2)}</b></td>
                </tr>
            `;

            // ПОДЕТАЛЬНАЯ ТАБЛИЦА
            const singleWeight = weight.toFixed(3);
            const singlePerimeter = perimeter;
            const singleCutLength = (singlePerimeter / 1000).toFixed(3);
            const singleCutCostPart = (singlePerimeter / 1000 * pricePerMeterCut);
            // Расчёт стоимости металла: приоритет цене за м², если задана
            const singlePricePerM2 = getPricePerM2(th);
            const singlePricePerKg = getPricePerKg(th);
            const singleAreaM2 = weight / (th * density);
            const singleMetalCostPart = singlePricePerM2 > 0 ? singleAreaM2 * singlePricePerM2 : weight * singlePricePerKg;
            const singleTotalCostPart = singleMetalCostPart + singleCutCostPart;
            const smallThumbSVG = generatePartThumbnail(part, 50, 40, parts);

            partDetailRows += `
                <tr>
                    <td class="thumb">${smallThumbSVG}</td>
                    <td>${part.name || 'Деталь'}</td>
                    <td>${Math.round(part.bounds.width)} × ${Math.round(part.bounds.height)}</td>
                    <td>${th}</td>
                    <td>${(singleAreaM2 * 1000000).toFixed(3)}</td>
                    <td>${singleWeight}</td>
                    <td>${singleCutLength}</td>
                    <td>${singleCutCostPart.toFixed(2)}</td>
                    <td>${singleMetalCostPart.toFixed(2)}</td>
                    <td><b>${singleTotalCostPart.toFixed(2)}</b></td>
                </tr>
            `;
        });

        // РАСЧЁТ ОСТАТКА ПО ТОЛЩИНЕ
        const groupSheetArea = group.sheets.reduce((s, sh) => s + sh.sheetSize.width * sh.sheetSize.height, 0);
        const groupUsedArea = group.sheets.reduce((s, sh) => s + sh.nestedParts.reduce((ss, n) => {
            const p = parts.find(pp => pp.id === n.partId);
            return ss + (p ? p.bounds.width * p.bounds.height : 0);
        }, 0), 0);
        const groupRemnantArea = Math.max(0, groupSheetArea - groupUsedArea);
        const groupRemnantWeight = groupRemnantArea * th * density / 1000000;
        
        // Расчёт стоимости металла: приоритет цене за м², если задана
        const pricePerM2 = getPricePerM2(th);
        const pricePerKg = getPricePerKg(th);
        const groupAreaM2 = group.totalWeight / (th * density);  // м²
        const groupCost = pricePerM2 > 0 ? groupAreaM2 * pricePerM2 : group.totalWeight * pricePerKg;
        
        const pricePerMeterCut = getPricePerMeterCut(th);
        const groupCutCost = (group.totalLength / 1000) * pricePerMeterCut;
        // Используем распределённое время секундомера или время раскладки из листов
        const groupNestingTime = useStopwatch 
            ? (timeDistribution[key] || 0)
            : group.sheets.reduce((s, sh) => s + (sh.nestingTime || 0), 0);
        const groupTimeCost = (groupNestingTime / 60) * pricingSettings.pricePerMinute;
        const groupTotalCost = groupCost + groupCutCost + groupTimeCost;
        const groupEfficiency = group.totalWeight + groupRemnantWeight > 0
            ? (group.totalWeight / (group.totalWeight + groupRemnantWeight) * 100).toFixed(1) : '0.0';

        thSectionHTML += `
            <h2 class="section-title">🔩 Толщина: ${th} мм</h2>
            <div class="summary th-summary">
                <div class="summary-grid">
                    <div class="summary-item"><div class="label">Листов</div><div class="value">${group.sheets.length}</div></div>
                    <div class="summary-item"><div class="label">Размещено</div><div class="value">${group.totalPlaced} шт</div></div>
                    <div class="summary-item"><div class="label">Вес деталей</div><div class="value">${group.totalWeight.toFixed(3)} кг</div></div>
                    <div class="summary-item"><div class="label">Цена металла</div><div class="value">${pricePerM2 > 0 ? pricePerM2.toFixed(2) + ' ₽/м²' : pricePerKg.toFixed(2) + ' ₽/кг'}</div></div>
                    <div class="summary-item"><div class="label">Длина реза</div><div class="value">${(group.totalLength / 1000).toFixed(2)} м</div></div>
                    <div class="summary-item"><div class="label">Цена реза</div><div class="value">${pricePerMeterCut.toFixed(2)} ₽/м</div></div>
                    <div class="summary-item"><div class="label">Стоимость металла</div><div class="value">${groupCost.toFixed(2)} ₽</div></div>
                    <div class="summary-item"><div class="label">Стоимость реза</div><div class="value">${groupCutCost.toFixed(2)} ₽</div></div>
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

    // СВОДКА ПО КАЖДОМУ ЛИСТУ
    let globalSheetIndex = 0;
    sheetsToReport.forEach((sheet) => {
        const sw = sheet.sheetSize?.width || sheetSize.width;
        const sh = sheet.sheetSize?.height || sheetSize.height;
        const sheetTh = sheet.thickness || 0.8;
        const sheetPartCount = sheet.nestedParts.length;

        let sheetCuttingLength = 0;
        let sheetWeight = 0;
        sheet.nestedParts.forEach(nested => {
            const part = parts.find(p => p.id === nested.partId);
            if (!part) return;
            const perimeter = calculatePartPerimeter(part);
            const area = part.bounds.width * part.bounds.height;
            const w = area * sheetTh * density / 1000000;
            sheetCuttingLength += perimeter;
            sheetWeight += w;
        });

        const sheetPricePerM2 = getPricePerM2(sheetTh);
        const sheetPricePerKg = getPricePerKg(sheetTh);
        const sheetAreaM2 = sheetWeight / (sheetTh * density);
        const sheetMetalCost = sheetPricePerM2 > 0 ? sheetAreaM2 * sheetPricePerM2 : sheetWeight * sheetPricePerKg;
        const pricePerMeterCut = getPricePerMeterCut(sheetTh);
        const sheetCutCost = (sheetCuttingLength / 1000) * pricePerMeterCut;
        // Используем время секундомера (распределённое) или время раскладки из листа
        const sheetTimeSeconds = useStopwatch 
            ? Math.round(workTimeSeconds / sheetsToReport.length)
            : (sheet.nestingTime || 0);
        const sheetTimeCost = (sheetTimeSeconds / 60) * pricingSettings.pricePerMinute;
        const sheetTotalCost = sheetMetalCost + sheetCutCost + sheetTimeCost;
        const sheetUsedArea = sheet.nestedParts.reduce((s, n) => {
            const p = parts.find(pp => pp.id === n.partId);
            return s + (p ? p.bounds.width * p.bounds.height : 0);
        }, 0);
        const sheetRemnantArea = Math.max(0, sw * sh - sheetUsedArea);

        const sheetThumb = generateSheetThumbnail(sheet, 0, parts, sheetSize);

        sheetSummaryHTML += `
            <div class="sheet-report-card">
                <div class="sheet-report-header">
                    <div class="sheet-report-thumb">${sheetThumb}</div>
                    <div class="sheet-report-info">
                        <h3>Лист ${globalSheetIndex + 1}: ${sw} × ${sh} мм (толщ. ${sheetTh.toFixed(1)} мм)</h3>
                        <div class="sheet-report-stats">
                            <div class="stat"><span class="stat-label">Деталей</span><span class="stat-value">${sheetPartCount} шт</span></div>
                            <div class="stat"><span class="stat-label">Длина реза</span><span class="stat-value">${(sheetCuttingLength / 1000).toFixed(3)} м</span></div>
                            <div class="stat"><span class="stat-label">Рез</span><span class="stat-value">${sheetCutCost.toFixed(2)} ₽</span></div>
                            <div class="stat"><span class="stat-label">Металл</span><span class="stat-value">${sheetMetalCost.toFixed(2)} ₽</span></div>
                            <div class="stat"><span class="stat-label">Время</span><span class="stat-value">${sheetTimeSeconds > 0 ? sheetTimeSeconds.toFixed(0) + ' сек' : '—'}</span></div>
                            <div class="stat"><span class="stat-label">Итого</span><span class="stat-value" style="color:#2d7a5a;">${sheetTotalCost.toFixed(2)} ₽</span></div>
                            <div class="stat"><span class="stat-label">Остаток</span><span class="stat-value">${(sheetRemnantArea / 1000000).toFixed(3)} м²</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        globalSheetIndex++;
    });

    // ИТОГОВАЯ СТОИМОСТЬ
    let grandTotalMetalCost = 0;
    let grandTotalCutCost = 0;
    Object.keys(reportByThickness).forEach(key => {
        const g = reportByThickness[key];
        const pricePerM2 = getPricePerM2(g.thickness);
        const pricePerKg = getPricePerKg(g.thickness);
        const areaM2 = g.totalWeight / (g.thickness * density);
        grandTotalMetalCost += pricePerM2 > 0 ? areaM2 * pricePerM2 : g.totalWeight * pricePerKg;
        const pricePerMeterCut = getPricePerMeterCut(g.thickness);
        grandTotalCutCost += (g.totalLength / 1000) * pricePerMeterCut;
    });

    const grandTotalTimeCost = (workTimeSeconds / 60) * pricingSettings.pricePerMinute;
    const grandTotalCost = grandTotalMetalCost + grandTotalCutCost + grandTotalTimeCost;

    const formatTime = (totalSec) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    };

    // НЕ РАЗМЕЩЁННЫЕ
    let unplacedRows = '';
    unplacedParts.forEach(({ part, notPlaced }) => {
        const thumbSVG = generatePartThumbnail(part, 80, 60, parts);
        unplacedRows += `
            <tr>
                <td class="thumb">${thumbSVG}</td>
                <td>${part.name || 'Деталь'}</td>
                <td>${Math.round(part.bounds.width)} × ${Math.round(part.bounds.height)}</td>
                <td>${(part.thickness || 0.8).toFixed(1)}</td>
                <td>${notPlaced} / ${part.quantity}</td>
                <td colspan="3" style="color:#c00;">Не размещена</td>
            </tr>
        `;
    });

    const now = new Date().toLocaleString('ru-RU');

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Отчёт по деталям</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: #f5f5f5; color: #1a1a1a; }
        h1 { font-size: 22px; color: #007acc; margin-bottom: 4px; }
        .date { color: #888; font-size: 13px; margin-bottom: 24px; }
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
        .sheet-report-header { display: flex; gap: 16px; padding: 14px 18px; align-items: flex-start; }
        .sheet-report-thumb { flex-shrink: 0; }
        .sheet-report-info { flex: 1; }
        .sheet-report-info h3 { font-size: 14px; color: #333; margin-bottom: 10px; }
        .sheet-report-stats { display: flex; gap: 24px; flex-wrap: wrap; }
        .sheet-report-stats .stat { display: flex; flex-direction: column; min-width: 100px; }
        .sheet-report-stats .stat-label { font-size: 11px; color: #888; }
        .sheet-report-stats .stat-value { font-size: 16px; font-weight: 700; color: #1a1a1a; }
        @media print {
            body { padding: 10px; background: #fff; }
            table { box-shadow: none; border: 1px solid #ddd; }
            th { background: #333 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .section-title { background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .summary-item { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet-thumb svg { border: 1px solid #ccc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .sheet-report-card { box-shadow: none; border: 1px solid #ddd; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <h1>📊 Отчёт по раскладке деталей</h1>
    <p class="date">Создано: ${now}</p>

${partDetailRows ? `
    <h2 class="section-title">📋 Расчет стоимости 1 детали</h2>
    <table>
        <thead>
            <tr>
                <th style="width:60px;">Миниатюра</th>
                <th>Название</th>
                <th>Размер (мм)</th>
                <th>Толщ. (мм)</th>
                <th>Площадь (м²)</th>
                <th>Вес (кг)</th>
                <th>Рез (м)</th>
                <th>Рез (₽)</th>
                <th>Металл (₽)</th>
                <th>Итого (₽)</th>
            </tr>
        </thead>
        <tbody>
            ${partDetailRows}
        </tbody>
    </table>
    ` : ''}

${thSectionHTML}

    <table>
        <thead>
            <tr>
                <th style="width:90px;">Миниатюра</th>
                <th>Название</th>
                <th>Размер (мм)</th>
                <th>Толщ. (мм)</th>
                <th>Кол-во</th>
                <th>Вес (кг)</th>
                <th>Рез (м)</th>
                <th>Рез (₽)</th>
                <th>Металл (₽)</th>
                <th>Итого (₽)</th>
            </tr>
        </thead>
        <tbody>
            ${tableRows}
        </tbody>
    </table>

    ${unplacedParts.length > 0 ? `
    <h2 class="section-title" style="border-left-color:#c00;">⚠️ Не размещённые детали</h2>
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
    <h2 class="section-title">📋 Сводка по листам</h2>
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
            <div class="summary-item"><div class="label">Стоимость реза</div><div class="value">${grandTotalCutCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Стоимость металла</div><div class="value">${grandTotalMetalCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Время работы</div><div class="value">${workTimeSeconds > 0 ? formatTime(workTimeSeconds) : '—'}</div></div>
            <div class="summary-item"><div class="label">Стоимость времени</div><div class="value">${grandTotalTimeCost > 0 ? grandTotalTimeCost.toFixed(2) + ' ₽' : '—'}</div></div>
            <div class="summary-item" style="background:#e8f5e9;"><div class="label">ИТОГО</div><div class="value">${grandTotalCost.toFixed(2)} ₽</div></div>
            <div class="summary-item"><div class="label">Площадь остатка</div><div class="value">${(remnantArea / 1000000).toFixed(3)} м²</div></div>
            <div class="summary-item"><div class="label">Вес остатка</div><div class="value">${remnantWeight.toFixed(3)} кг</div></div>
            <div class="summary-item"><div class="label">КПД материала</div><div class="value">${(grandTotalWeight / (grandTotalWeight + remnantWeight) * 100).toFixed(1)}%</div></div>
        </div>
    </div>

    <p class="no-print" style="text-align:center;margin-top:20px;color:#888;font-size:12px;">
        💡 Нажмите Ctrl+P для сохранения в PDF
    </p>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
}

// Инициализация обработчика при загрузке
document.addEventListener('DOMContentLoaded', () => {
    const exportPdfBtn = document.getElementById('exportPdf');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportPdfReport);
    }
});
