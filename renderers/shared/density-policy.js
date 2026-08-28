const NORMAL_ACCELERATED_MAX_COLUMNS = 640;
const NORMAL_ACCELERATED_MAX_CELLS = 160_000;
const NORMAL_SOFTWARE_MAX_COLUMNS = 120;
const NORMAL_SOFTWARE_MAX_CELLS = 6_000;
const ADVANCED_MAX_COLUMNS = 900;
const ADVANCED_MAX_CELLS = 500_000;

function isSoftwareBackend(backend) {
    return backend === 'canvas2d' || backend === 'pixel-canvas' || backend === 'cpu';
}

function densityBudget(params = {}, actualBackend = params.backend) {
    if (params.advancedDensity) {
        return Object.freeze({
            mode: 'advanced',
            maxColumns: ADVANCED_MAX_COLUMNS,
            maxCells: ADVANCED_MAX_CELLS,
            guaranteed: false
        });
    }
    if (isSoftwareBackend(actualBackend)) {
        return Object.freeze({
            mode: 'normal-software',
            maxColumns: NORMAL_SOFTWARE_MAX_COLUMNS,
            maxCells: NORMAL_SOFTWARE_MAX_CELLS,
            guaranteed: true
        });
    }
    return Object.freeze({
        mode: 'normal-accelerated',
        maxColumns: NORMAL_ACCELERATED_MAX_COLUMNS,
        maxCells: NORMAL_ACCELERATED_MAX_CELLS,
        guaranteed: true
    });
}

function requestedRows(params = {}, sourceWidth = 16, sourceHeight = 9, pixelMode = false, columns = params.cols) {
    if (!params.autoRows && Number(params.rows) > 0) return Math.max(1, Math.round(Number(params.rows)));
    const ratio = Math.max(1, Number(sourceWidth) || 16) / Math.max(1, Number(sourceHeight) || 9);
    const aspect = Math.max(0.01, Number(params.aspectCorrection) || 1);
    if (pixelMode || params.solidMode) return Math.max(1, Math.round(columns / ratio * aspect));
    const cellWidth = Math.max(1, Number(params.cellWidth) || 1);
    const cellHeight = Math.max(1, Number(params.cellHeight) || 1);
    return Math.max(1, Math.round(columns / ratio * (cellWidth / cellHeight) * aspect));
}

function resolveGridDimensions(params = {}, sourceWidth = 16, sourceHeight = 9, options = {}) {
    const actualBackend = options.actualBackend || params.backend || 'auto';
    const pixelMode = options.pixelMode ?? Boolean(params.pixel || actualBackend === 'pixel-canvas');
    const budget = densityBudget(params, actualBackend);
    const rawColumns = Math.max(1, Math.round(Number(params.cols) || 1));
    const requestedColumns = Math.min(rawColumns, ADVANCED_MAX_COLUMNS);
    const requestedRowCount = requestedRows(params, sourceWidth, sourceHeight, pixelMode, requestedColumns);
    let columns = Math.min(requestedColumns, budget.maxColumns);
    let rows = params.autoRows
        ? requestedRows(params, sourceWidth, sourceHeight, pixelMode, columns)
        : requestedRowCount;

    if (columns * rows > budget.maxCells) {
        const scale = Math.sqrt(budget.maxCells / (columns * rows));
        columns = Math.max(1, Math.floor(columns * scale));
        rows = params.autoRows
            ? requestedRows(params, sourceWidth, sourceHeight, pixelMode, columns)
            : Math.max(1, Math.floor(rows * scale));
        while (columns * rows > budget.maxCells) {
            if (columns >= rows) columns--;
            else rows--;
        }
    }

    return Object.freeze({
        requestedColumns,
        requestedRows: requestedRowCount,
        columns,
        rows,
        cells: columns * rows,
        clamped: columns !== requestedColumns || rows !== requestedRowCount,
        budget
    });
}

export {
    ADVANCED_MAX_CELLS,
    ADVANCED_MAX_COLUMNS,
    NORMAL_ACCELERATED_MAX_CELLS,
    NORMAL_ACCELERATED_MAX_COLUMNS,
    NORMAL_SOFTWARE_MAX_CELLS,
    NORMAL_SOFTWARE_MAX_COLUMNS,
    densityBudget,
    isSoftwareBackend,
    requestedRows,
    resolveGridDimensions
};
