/**
 * Вычисление периметра детали по её объектам
 * v4.60: Добавлена поддержка arc, polyline, lwpolyline, spline, ellipse
 * @param {Object} part - Объект детали
 * @returns {number} Периметр в мм
 */
function calculatePartPerimeter(part) {
    if (!part || !part.objects || part.objects.length === 0) return 0;

    let perimeter = 0;

    for (const obj of part.objects) {
        if (!obj) continue;

        if (obj.type === 'line') {
            // Длина линии
            const dx = obj.x2 - obj.x1;
            const dy = obj.y2 - obj.y1;
            perimeter += Math.sqrt(dx * dx + dy * dy);

        } else if (obj.type === 'circle') {
            // Длина окружности = 2 * π * r
            perimeter += 2 * Math.PI * Math.abs(obj.radius || 0);

        } else if (obj.type === 'arc') {
            // v4.60: Длина дуги = radius * |угол_развёртки|
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
                if (sweep > 2 * Math.PI) sweep = 2 * Math.PI;
                perimeter += r * sweep;
            } else if (r > 0) {
                perimeter += 2 * Math.PI * r;
            }

        } else if (obj.type === 'rect') {
            // Периметр прямоугольника = 2 * (ширина + высота)
            perimeter += 2 * (Math.abs(obj.width || 0) + Math.abs(obj.height || 0));

        } else if (obj.type === 'polygon') {
            // Сумма длин всех граней многоугольника
            const vertices = obj.getVertices ? obj.getVertices() : (obj.points || obj.vertices || []);
            if (vertices.length > 1) {
                for (let i = 0; i < vertices.length; i++) {
                    const current = vertices[i];
                    const next = vertices[(i + 1) % vertices.length];
                    const dx = next.x - current.x;
                    const dy = next.y - current.y;
                    perimeter += Math.sqrt(dx * dx + dy * dy);
                }
            }

        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
            // v4.60: Сумма длин отрезков полилинии
            const pts = (obj.points || obj.vertices || []).filter(p => p && typeof p.x === 'number');
            if (pts.length >= 2) {
                for (let i = 0; i < pts.length - 1; i++) {
                    const dx = pts[i + 1].x - pts[i].x;
                    const dy = pts[i + 1].y - pts[i].y;
                    perimeter += Math.sqrt(dx * dx + dy * dy);
                }
                // Если замкнута — добавляем замыкающий отрезок
                if (obj.closed === true) {
                    const dx = pts[0].x - pts[pts.length - 1].x;
                    const dy = pts[0].y - pts[pts.length - 1].y;
                    perimeter += Math.sqrt(dx * dx + dy * dy);
                }
            }

        } else if (obj.type === 'spline') {
            // v4.60: Сплайн — сумма длин отрезков через fitPoints
            const pts = (obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [])
                .filter(p => p && typeof p.x === 'number');
            if (pts.length >= 2) {
                for (let i = 0; i < pts.length - 1; i++) {
                    const dx = pts[i + 1].x - pts[i].x;
                    const dy = pts[i + 1].y - pts[i].y;
                    perimeter += Math.sqrt(dx * dx + dy * dy);
                }
                if (obj.closed === true || obj.isClosed === true) {
                    const dx = pts[0].x - pts[pts.length - 1].x;
                    const dy = pts[0].y - pts[pts.length - 1].y;
                    perimeter += Math.sqrt(dx * dx + dy * dy);
                }
            }

        } else if (obj.type === 'ellipse') {
            // v4.60: Эллипс — приближённая формула Рамануджана
            const rx = Math.abs(obj.rx || 0);
            const ry = Math.abs(obj.ry || 0);
            if (rx > 0 && ry > 0) {
                const h = Math.pow((rx - ry) / (rx + ry), 2);
                perimeter += Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
            }
        }
    }

    return perimeter;
}