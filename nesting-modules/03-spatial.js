// ════════════════════════════════════════════════════════════════




(function(N) {
    'use strict';
    
N.buildSpatialGrid = function buildSpatialGrid(placedParts, cellSize = N.SPATIAL_CELL_SIZE) {
    const grid = new Map();
    for (const part of placedParts) {
        const px = part.x || 0;
        const py = part.y || 0;
        const pw = part.width || part.bboxWidth || 100;
        const ph = part.height || part.bboxHeight || 100;
        const minX = Math.floor(px / cellSize);
        const minY = Math.floor(py / cellSize);
        const maxX = Math.floor((px + pw) / cellSize);
        const maxY = Math.floor((py + ph) / cellSize);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                const key = `${cx},${cy}`;
                if (!grid.has(key)) grid.set(key, new Set());
                grid.get(key).add(part);
            }
        }
    }
    return grid;
}

N.getNearbyParts = function getNearbyParts(spatialGrid, x, y, width, height, cellSize = N.SPATIAL_CELL_SIZE) {
    const nearby = new Set();
    const minX = Math.floor(x / cellSize);
    const minY = Math.floor(y / cellSize);
    const maxX = Math.floor((x + width) / cellSize);
    const maxY = Math.floor((y + height) / cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
            const cell = spatialGrid.get(`${cx},${cy}`);
            if (cell) for (const part of cell) nearby.add(part);
        }
    }
    return [...nearby];
}

N.addToSpatialGrid = function addToSpatialGrid(spatialGrid, part, cellSize = N.SPATIAL_CELL_SIZE) {
    const px = part.x || 0;
    const py = part.y || 0;
    const pw = part.width || part.bboxWidth || 100;
    const ph = part.height || part.bboxHeight || 100;
    const minX = Math.floor(px / cellSize);
    const minY = Math.floor(py / cellSize);
    const maxX = Math.floor((px + pw) / cellSize);
    const maxY = Math.floor((py + ph) / cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
        for (let cy = minY; cy <= maxY; cy++) {
            const key = `${cx},${cy}`;
            if (!spatialGrid.has(key)) spatialGrid.set(key, new Set());
            spatialGrid.get(key).add(part);
        }
    }
}
})(window.Nesting = window.Nesting || {});
