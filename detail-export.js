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
            el.setAttribute("x", toPx(obj.x - minX));
            el.setAttribute("y", toPx(obj.y - minY));
            el.setAttribute("width", toPx(obj.width));
            el.setAttribute("height", toPx(obj.height));
            el.setAttribute("class", "obj");
            svg.appendChild(el);
        }

        else if (obj.type === 'polygon') {
            let verts = obj.getVertices().map(v => ({
                x: v.x - minX,
                y: v.y - minY
            }));

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
// DXF ЭКСПОРТ (ПРОМЫШЛЕННЫЙ УРОВЕНЬ)
// ═══════════════════════════════════════════════════════════════

function exportSelectedObjectsToDXF() {
    if (selectedObjects.length === 0) {
        alert('⚠️ Нет выделенных объектов');
        return;
    }

    let dxf = [];

    // HEADER
    dxf.push("0","SECTION","2","HEADER");
    dxf.push("9","$INSUNITS","70","4"); // мм
    dxf.push("0","ENDSEC");

    dxf.push("0","SECTION","2","ENTITIES");

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    selectedObjects.forEach(obj => {
        obj.getPoints().forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
    });

    const widthMm = maxX - minX;
    const heightMm = maxY - minY;

    const fixX = x => x - minX;
    const fixY = y => y - minY;

    selectedObjects.forEach(obj => {

        if (obj.type === 'line') {
            dxf.push(
                "0","LINE","8","0",
                "10",fixX(obj.x1),"20",fixY(obj.y1),"30",0,
                "11",fixX(obj.x2),"21",fixY(obj.y2),"31",0
            );
        }

        else if (obj.type === 'circle') {
            dxf.push(
                "0","CIRCLE","8","0",
                "10",fixX(obj.cx),"20",fixY(obj.cy),"30",0,
                "40",obj.radius
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

            dxf.push("0","LWPOLYLINE","8","0","90",4,"70",1,"43",0);

            verts.forEach(v => {
                dxf.push("10",v.x,"20",v.y,"30",0);
            });
        }

        else if (obj.type === 'polygon') {
            let verts = obj.getVertices().map(v => ({
                x: fixX(v.x),
                y: fixY(v.y)
            }));

            if (isClockwise(verts)) verts.reverse();

            dxf.push("0","LWPOLYLINE","8","0","90",verts.length,"70",1,"43",0);

            verts.forEach(v => {
                dxf.push("10",v.x,"20",v.y,"30",0);
            });
        }

        else if (obj.type === 'text') {
            dxf.push(
                "0","TEXT","8","0",
                "10",fixX(obj.x),"20",fixY(obj.y),"30",0,
                "40",obj.fontSize || 5,
                "1",obj.text
            );
        }
    });

    dxf.push("0","ENDSEC","0","EOF");

    const blob = new Blob([dxf.join("\n")], { type: "application/dxf" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    
    // Формируем имя файла с датой и временем
    const thickness = 0.8; // Толщина задаётся в списке деталей
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