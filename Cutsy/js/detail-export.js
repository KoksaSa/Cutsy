// ═══════════════════════════════════════════════════════════════
// ОБЩИЕ УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════

// Проверка направления полигона (для ЧПУ)
function isClockwise(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        sum += (p2.x - p1.x) * (p2.y + p1.y);
    }
    return sum > 0;
}

// ═══════════════════════════════════════════════════════════════
// SVG ЭКСПОРТ (ИДЕАЛЬНЫЙ 1:1 В ММ)
// ═══════════════════════════════════════════════════════════════

function exportSelectedObjectsToSVG() {
    if (selectedObjects.length === 0) {
        alert('⚠️ Нет выделенных объектов');
        return;
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    const PX_PER_MM = 96 / 25.4;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    selectedObjects.forEach(obj => {
        obj.getPoints().forEach(pt => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        });
    });

    const widthMm = maxX - minX;
    const heightMm = maxY - minY;

    const widthPx = widthMm * PX_PER_MM;
    const heightPx = heightMm * PX_PER_MM;

    svg.setAttribute("width", `${widthMm}mm`);
    svg.setAttribute("height", `${heightMm}mm`);
    svg.setAttribute("viewBox", `0 0 ${widthPx} ${heightPx}`);
    svg.setAttribute("xmlns", svgNS);

    const toPx = (v) => v * PX_PER_MM;

    const style = document.createElementNS(svgNS, "style");
    style.textContent = `
        .obj { 
            fill: none; 
            stroke: #000; 
            stroke-width: 0.01;
        }
    `;
    svg.appendChild(style);

    selectedObjects.forEach(obj => {

        if (obj.type === 'line') {
            const el = document.createElementNS(svgNS, "line");
            el.setAttribute("x1", toPx(obj.x1 - minX));
            el.setAttribute("y1", toPx(obj.y1 - minY));
            el.setAttribute("x2", toPx(obj.x2 - minX));
            el.setAttribute("y2", toPx(obj.y2 - minY));
            el.setAttribute("class", "obj");
            svg.appendChild(el);
        }

        else if (obj.type === 'circle') {
            const el = document.createElementNS(svgNS, "circle");
            el.setAttribute("cx", toPx(obj.cx - minX));
            el.setAttribute("cy", toPx(obj.cy - minY));
            el.setAttribute("r", toPx(obj.radius));
            el.setAttribute("class", "obj");
            svg.appendChild(el);
        }

        else if (obj.type === 'rect') {
            const el = document.createElementNS(svgNS, "rect");
            // Нормализация: SVG запрещает отрицательные width/height у <rect>
            const rawW = obj.width || 0;
            const rawH = obj.height || 0;
            const absW = Math.abs(rawW);
            const absH = Math.abs(rawH);
            let rx = obj.x - minX;
            let ry = obj.y - minY;
            if (rawW < 0) rx -= absW;
            if (rawH < 0) ry -= absH;
            el.setAttribute("x", toPx(rx));
            el.setAttribute("y", toPx(ry));
            el.setAttribute("width", toPx(absW));
            el.setAttribute("height", toPx(absH));
            el.setAttribute("class", "obj");
            svg.appendChild(el);
        }

        else if (obj.type === 'arc') {
            const pts = obj.getPoints ? obj.getPoints() : [];
            if (pts.length > 0) {
                const el = document.createElementNS(svgNS, "polyline");
                el.setAttribute("points",
                    pts.map(p => `${toPx(p.x - minX)},${toPx(p.y - minY)}`).join(" ")
                );
                el.setAttribute("class", "obj");
                el.setAttribute("fill", "none");
                svg.appendChild(el);
            }
        }

        else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            if (pts.length > 0) {
                const el = document.createElementNS(svgNS, "polyline");
                el.setAttribute("points",
                    pts.map(p => `${toPx(p.x - minX)},${toPx(p.y - minY)}`).join(" ")
                );
                el.setAttribute("class", "obj");
                el.setAttribute("fill", "none");
                svg.appendChild(el);
            }
        }

        else if (obj.type === 'polygon') {
            let verts;
            if (typeof obj.getVertices === 'function') {
                verts = obj.getVertices().map(v => ({
                    x: v.x - minX,
                    y: v.y - minY
                }));
            } else if (obj.points && Array.isArray(obj.points)) {
                verts = obj.points.map(p => ({
                    x: p.x - minX,
                    y: p.y - minY
                }));
            } else {
                return;
            }
            
            if (isClockwise(verts)) verts.reverse();

            const el = document.createElementNS(svgNS, "polygon");
            el.setAttribute("points",
                verts.map(v => `${toPx(v.x)},${toPx(v.y)}`).join(" ")
            );
            el.setAttribute("class", "obj");
            svg.appendChild(el);
        }

        else if (obj.type === 'text') {
            const el = document.createElementNS(svgNS, "text");
            el.setAttribute("x", toPx(obj.x - minX));
            el.setAttribute("y", toPx(obj.y - minY));
            el.setAttribute("font-size", toPx(obj.fontSize || 4));
            el.textContent = obj.text;
            svg.appendChild(el);
        }
    });

    const blob = new Blob(
        [new XMLSerializer().serializeToString(svg)],
        { type: "image/svg+xml" }
    );

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "export.svg";
    link.click();
}

// ═══════════════════════════════════════════════════════════════
// DXF ЭКСПОРТ - экспортируеем нарисованные детали, фигуры с холста в DXF
// v5.00: TABLES (LTYPE/LAYER/STYLE), $ACADVER R12, форматирование чисел,
//        поддержка plain objects из DXF-импорта, spline/ellipse
// ═══════════════════════════════════════════════════════════════

function exportSelectedObjectsToDXF() {
    if (selectedObjects.length === 0) {
        alert('⚠️ Нет выделенных объектов');
        return;
    }

    // ── Форматирование чисел: фикс 6 знаков, убираем trailing zeros ──
    // Предотвращает float-артефакты типа 0.30000000000000004 в DXF
    function n(v) {
        v = Number(v);
        if (!isFinite(v)) v = 0;
        return parseFloat(v.toFixed(6)).toString();
    }

    let dxf = [];

    // ══ HEADER ══
    dxf.push("0","SECTION","2","HEADER");
    dxf.push("9","$ACADVER","1","AC1009");       // R12 — максимальная совместимость
    dxf.push("9","$INSUNITS","70","4");           // мм
    dxf.push("9","$HANDSEED","5","FFFF");
    dxf.push("0","ENDSEC");

    // ══ TABLES (LTYPE, LAYER, STYLE) — нужны для AutoCAD, SolidWorks, etc. ══
    dxf.push("0","SECTION","2","TABLES");

    // LTYPE
    dxf.push("0","TABLE","2","LTYPE","70","1");
    dxf.push("0","LTYPE","2","CONTINUOUS","70","0","3","Solid line","72","65","73","0","40","0");
    dxf.push("0","ENDTAB");

    // LAYER
    dxf.push("0","TABLE","2","LAYER","70","1");
    dxf.push("0","LAYER","2","0","70","0","62","7","6","CONTINUOUS");
    dxf.push("0","ENDTAB");

    // STYLE (нужен для TEXT)
    dxf.push("0","TABLE","2","STYLE","70","1");
    dxf.push("0","STYLE","2","STANDARD","70","0","40","0","41","1","50","0","71","0","42","5","3","txt","4","");
    dxf.push("0","ENDTAB");

    dxf.push("0","ENDSEC");

    // ══ ENTITIES ══
    dxf.push("0","SECTION","2","ENTITIES");

    // ── Универсальная функция получения точек объекта ──
    // Работает и с классами (Line, Circle, Polygon, ...), и с plain objects из DXF-импорта
    function getObjPoints(obj) {
        if (typeof obj.getPoints === 'function') return obj.getPoints();
        const pts = [];
        if (obj.type === 'line') {
            pts.push({x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2});
        } else if (obj.type === 'circle' || obj.type === 'arc') {
            pts.push({x: obj.cx, y: obj.cy});
        } else if (obj.type === 'rect') {
            pts.push({x: obj.x, y: obj.y}, {x: obj.x + obj.width, y: obj.y + obj.height});
        } else if (obj.type === 'ellipse') {
            const rx = obj.rx || 0, ry = obj.ry || 0;
            pts.push({x: obj.cx - rx, y: obj.cy - ry}, {x: obj.cx + rx, y: obj.cy + ry});
        } else if (obj.points || obj.vertices) {
            pts.push(...(obj.points || obj.vertices));
        } else if (obj.fitPoints || obj.controlPoints) {
            pts.push(...(obj.fitPoints || obj.controlPoints));
        }
        return pts;
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    selectedObjects.forEach(obj => {
        getObjPoints(obj).forEach(p => {
            if (!p || typeof p.x !== 'number') return;
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    });

    if (!isFinite(minX)) { minX = 0; maxX = 0; }
    if (!isFinite(minY)) { minY = 0; maxY = 0; }

    const widthMm = maxX - minX;
    const heightMm = maxY - minY;

    const fixX = x => n(x - minX);
    const fixY = y => n(maxY - y);

    selectedObjects.forEach(obj => {

        if (obj.type === 'line') {
            dxf.push(
                "0","LINE","8","0",
                "10",fixX(obj.x1),"20",fixY(obj.y1),"30","0",
                "11",fixX(obj.x2),"21",fixY(obj.y2),"31","0"
            );
        }

        else if (obj.type === 'circle') {
            dxf.push(
                "0","CIRCLE","8","0",
                "10",fixX(obj.cx),"20",fixY(obj.cy),"30","0",
                "40",n(obj.radius)
            );
        }

        else if (obj.type === 'rect') {
            let verts = [
                {x: obj.x, y: obj.y},
                {x: obj.x + obj.width, y: obj.y},
                {x: obj.x + obj.width, y: obj.y + obj.height},
                {x: obj.x, y: obj.y + obj.height}
            ].map(v => ({x: fixX(v.x), y: fixY(v.y)}));

            if (isClockwise(verts)) verts.reverse();

            dxf.push("0","LWPOLYLINE","8","0","90",verts.length,"70",1);

            verts.forEach(v => {
                dxf.push("10",v.x,"20",v.y);
            });
        }

        else if (obj.type === 'arc') {
            // Canvas Y-down → DXF Y-up: инвертируем углы по знаку.
            // При инверсии Y направление дуги меняется (CW↔CCW),
            // поэтому DXF ARC (всегда CCW) нужно задать swap start/end при CCW-дугах.
            let startDeg = (-obj.startAngle * 180 / Math.PI);
            let endDeg = (-obj.endAngle * 180 / Math.PI);

            // dir=1/undefined/'CCW' → CCW → swap. dir=-1/'CW' → CW → без swap
            const isCCW = (obj.direction === 'CCW' ||
                           obj.direction === 1 ||
                           (typeof obj.direction === 'number' && obj.direction >= 0));
            if (isCCW) {
                const tmp = startDeg;
                startDeg = endDeg;
                endDeg = tmp;
            }

            startDeg = ((startDeg % 360) + 360) % 360;
            endDeg = ((endDeg % 360) + 360) % 360;
            dxf.push(
                "0","ARC","8","0",
                "10",fixX(obj.cx),"20",fixY(obj.cy),"30","0",
                "40",n(obj.radius),
                "50",n(startDeg),"51",n(endDeg)
            );
        }

        else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            const pts = obj.points || obj.vertices || [];
            if (pts.length < 2) return;
            const isClosed = obj.closed ? 1 : 0;
            dxf.push("0","LWPOLYLINE","8","0","90",pts.length,"70",isClosed);
            pts.forEach(p => {
                dxf.push("10",fixX(p.x),"20",fixY(p.y));
            });
        }

        else if (obj.type === 'polygon') {
            let verts;
            if (typeof obj.getVertices === 'function') {
                verts = obj.getVertices().map(v => ({
                    x: fixX(v.x),
                    y: fixY(v.y)
                }));
            } else if (obj.points && Array.isArray(obj.points)) {
                verts = obj.points.map(p => ({
                    x: fixX(p.x),
                    y: fixY(p.y)
                }));
            } else {
                return;
            }

            if (isClockwise(verts)) verts.reverse();

            dxf.push("0","LWPOLYLINE","8","0","90",verts.length,"70",1);

            verts.forEach(v => {
                dxf.push("10",v.x,"20",v.y);
            });
        }

        else if (obj.type === 'text') {
            dxf.push(
                "0","TEXT","8","0",
                "10",fixX(obj.x),"20",fixY(obj.y),"30","0",
                "40",n(obj.fontSize || 5),
                "1",obj.text || "",
                "7","STANDARD"
            );
        }

        // Spline → LWPOLYLINE (аппроксимация по fit/control точкам)
        else if (obj.type === 'spline') {
            const pts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
            if (pts.length < 2) return;
            const isClosed = obj.closed ? 1 : 0;
            dxf.push("0","LWPOLYLINE","8","0","90",pts.length,"70",isClosed);
            pts.forEach(p => {
                dxf.push("10",fixX(p.x),"20",fixY(p.y));
            });
        }

        // Ellipse → LWPOLYLINE (аппроксимация, 36 сегментов)
        else if (obj.type === 'ellipse') {
            const cx = obj.cx || 0, cy = obj.cy || 0;
            const rx = Math.abs(obj.rx || 0), ry = Math.abs(obj.ry || 0);
            if (rx < 0.001 || ry < 0.001) return;
            const seg = 36;
            const pts = [];
            for (let i = 0; i <= seg; i++) {
                const a = (Math.PI * 2 / seg) * i;
                pts.push({x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry});
            }
            dxf.push("0","LWPOLYLINE","8","0","90",pts.length,"70",1);
            pts.forEach(p => {
                dxf.push("10",fixX(p.x),"20",fixY(p.y));
            });
        }
    });

    dxf.push("0","ENDSEC","0","EOF");

    const blob = new Blob([dxf.join("\n")], { type: "application/dxf" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    // Формируем имя файла с датой и временем
    // Берём толщину из деталей, которым принадлежат выделенные объекты
    let thickness = 0.8;
    if (typeof parts !== 'undefined' && Array.isArray(parts)) {
        for (const part of parts) {
            if (part.objects && selectedObjects.some(o => part.objects.includes(o))) {
                thickness = part.thickness || 0.8;
                break;
            }
        }
    }
    const now = new Date();
    const dateTime = now.toLocaleDateString('ru-RU').replace(/\//g, '.') + ' ' + now.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'});
    const fileName = `detail_${widthMm.toFixed(0)}x${heightMm.toFixed(0)}_thickness_${thickness}mm_${dateTime.replace(/:/g, '-')}.dxf`;
    link.download = fileName;
    
    link.click();
    
    console.log('✅ DXF экспортирован');
}


// ═══════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ КНОПКИ
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
    const exportDxfBtn = document.getElementById('contextMenuExportDxf');
    
    if (exportDxfBtn && !exportDxfBtn.dataset.exportInitialized) {
        exportDxfBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // 🔒 Проверка пробного тарифа — экспорт DXF недоступен
            if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
                if (typeof LicenseManager.showUpgradeModal === 'function') {
                    LicenseManager.showUpgradeModal('exportDxf');
                } else {
                    alert('🔧 Экспорт DXF недоступен в пробном периоде. Купите тариф для доступа к экспорту.');
                }
                return;
            }
            
            if (selectedObjects.length === 0) {
                alert('⚠️ Нет выделенных объектов');
                return;
            }
            
            exportSelectedObjectsToDXF();
            document.getElementById('contextMenu').style.display = 'none';
        });
        
        exportDxfBtn.dataset.exportInitialized = 'true';
        console.log('✅ Экспорт DXF готов');
    }
});