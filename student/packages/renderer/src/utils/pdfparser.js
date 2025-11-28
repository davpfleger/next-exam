/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel
 * 
 * This program is free software: you can redistribute it and/or modify it 
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 * 
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */


/**
 * PDF Parser Utility
 * Extracts form fields, cloze text, and drawn rectangles from PDF documents
 */

// Import PDF.js
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * PDF Parser Class
 * Handles parsing of PDF documents and extraction of interactive elements
 */
class PdfParser {
    constructor() {
        // Manual lookup for op codes to be safe
        this.OP_CODE = { moveTo: 13, lineTo: 14, rectangle: 19, transform: 12, save: 0, restore: 1 };
        this.DUPLICATE_TOLERANCE_PX = 12; // px tolerance for duplicate boxes
        this.MIN_SIZE_PDF_UNITS = 5; // roughly ~10px at scale 1.5
        this.CHECKBOX_MAX_SIZE = 25; // px threshold to treat as checkbox
        this.SINGLE_LINE_TEXTAREA_MAX_HEIGHT = 30; // px threshold to downgrade textarea to input
        this.SCAN_MIN_BOXES = 2; // threshold to detect scan PDFs
        this.elementCounter = 0; // running id for generated overlay elements
        this.debugClozeFonts = false;
        this.pendingFontLogs = new Set();
        this.debugBoxExtraction = false;
        this.fontAdjustments = {
            'HelveticaNeueLTPro-Lt': { family: 'hv, Helvetica Neue, Helvetica, Arial, sans-serif', scale: 1 },
            'ArialMT': { family: 'Arial, Helvetica, sans-serif', scale: 1 },
            'TimesNewRomanPSMT': { family: 'Times New Roman, Times, serif', scale: 1 }
        };
    }
    generateElementId(prefix = 'el') {
        this.elementCounter += 1;
        return `${prefix}_${this.elementCounter}`;
    }


    /**
     * Setup PDF.js worker if not already configured
     */
    setupWorker() {
        if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
                'pdfjs-dist/legacy/build/pdf.worker.mjs',
                import.meta.url
            ).toString();
        }
    }

    /**
     * Render a PDF page to canvas and return as data URL
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {string} Data URL of the rendered page
     */
    async renderPageToCanvas(page, viewport) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        return canvas.toDataURL('image/png');
    }

    /**
     * Extract form widgets (checkboxes, inputs, textareas) from page annotations
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @param {number} pageNum - Page number for field naming
     * @returns {Array} Array of form field objects with style and type information
     */
    extractFormFields(page, viewport, pageNum) {
        return page.getAnnotations().then(annotations => {
            return annotations
                .filter(ann => ann.subtype === 'Widget')
                .map(ann => {
                    // Convert PDF coords to Canvas coords [x_min, y_min, x_max, y_max]
                    const rect = viewport.convertToViewportRectangle(ann.rect);
                    const width = Math.abs(rect[2] - rect[0]);
                    const height = Math.abs(rect[3] - rect[1]);
                    const left = Math.min(rect[0], rect[2]);
                    const top = Math.min(rect[1], rect[3]);

                    const isCheckbox = ann.checkBox || ann.fieldType === 'Btn';
                    // Detect textarea: typically larger height than width, or specific field type
                    const isTextarea = height > width * 1.5 || ann.fieldType === 'Tx' && height > 50;
                    
                    return {
                        id: this.generateElementId('form'),
                        type: isCheckbox ? 'checkbox' : (isTextarea ? 'textarea' : 'text'),
                        name: ann.fieldName || `field_${pageNum}_${ann.id}`,
                        value: ann.fieldValue || '',
                        checked: (isCheckbox && ann.buttonValue === 'Yes'),
                        style: {
                            position: 'absolute',
                            left: `${left}px`,
                            top: `${top}px`,
                            width: `${width}px`,
                            height: `${height}px`,
                            zIndex: 10
                        }
                    };
                });
        });
    }

    /**
     * Extract cloze text fields (____) and Unicode checkboxes (☐, ☑, ☒) from text content
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {Array} Array of cloze field objects with style and type information
     */
    async extractClozeFields(page, viewport) {
        const textContent = await page.getTextContent();
        const clozeFields = [];
        

        
        // Create helper canvas for accurate text width measurement
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        
        textContent.items.forEach(item => {
            const text = item.str;
            if (!text) return;
            
            // Extract transform matrix for text positioning
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
            const itemX = tx[4];
            const itemY = tx[5];
            
            // Get font style for accurate width measurement
            const fontName = item.fontName;
            const fontStyle = textContent.styles[fontName];
            const baseFontFamily = fontStyle ? fontStyle.fontFamily : 'sans-serif';
            const fontInfo = this.getFontInfo(page, fontName);
            let effectiveFontFamily = baseFontFamily;
            let fontScale = 1;
            if (fontInfo) {
                // Try baseFont first (most specific), then fontName as fallback
                const customAdjust = this.findFontAdjustmentByName(fontInfo.baseFont) || 
                                     this.findFontAdjustmentByName(fontInfo.fontName);
                if (customAdjust) {
                    if (customAdjust.family) {
                        effectiveFontFamily = customAdjust.family;
                    }
                    if (typeof customAdjust.scale === 'number') {
                        fontScale = customAdjust.scale;
                    }
                }
            }
            measureCtx.font = `${fontSize}px ${effectiveFontFamily}`;
           
            
            // Debug: Check if custom font is actually loaded and used
            if (this.debugClozeFonts) {
                const fontSpec = `${fontSize}px ${effectiveFontFamily}`;
                const fontLoaded = document.fonts && document.fonts.check ? document.fonts.check(fontSpec) : false;
                const computedFont = measureCtx.font;
                
                // Check if HelveticaNeueLTProLt is in the loaded fonts list
                let helveticaFound = false;
                if (document.fonts && document.fonts.forEach) {
                    document.fonts.forEach(font => {
                        if (font.family.includes('HelveticaNeueLTProLt')) {
                            helveticaFound = true;
                        }
                    });
                }
                
                if (fontInfo && this.debugClozeFonts) {
                    console.log(`pdfparser @ extractClozeFields: fontInfo.baseFont="${fontInfo.baseFont}", fontInfo.fontName="${fontInfo.fontName}", customAdjust found=${!!(this.findFontAdjustmentByName(fontInfo.baseFont) || this.findFontAdjustmentByName(fontInfo.fontName))}`);
                }
            }

            // Detect potential kerning/offset corrections by comparing measured vs actual width
            const measuredFullWidth = measureCtx.measureText(text).width || 0;
            const actualFullWidthRaw = typeof item.width === 'number' ? Math.abs(item.width) : measuredFullWidth;
            let widthScale = measuredFullWidth > 0 ? actualFullWidthRaw / measuredFullWidth : 1;
            if (!isFinite(widthScale) || widthScale <= 0.2 || widthScale >= 3) {
                widthScale = 1;
            }
  

            const usesExtremeSpacing = typeof item.charSpacing === 'number' && Math.abs(item.charSpacing) > fontSize * 0.2;
            const useScale = usesExtremeSpacing && Math.abs(widthScale - 1) > 0.15;

            // Find cloze text patterns (____)
            const regex = /(_+)/g;
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                const underscoreStr = match[0];
                const startIndex = match.index;
                
                // Calculate width of text before the underscore
                const prefixText = text.substring(0, startIndex);
                let prefixWidth = measureCtx.measureText(prefixText).width;
                if (useScale) {
                    prefixWidth *= widthScale;
                }
                prefixWidth *= fontScale;
                
                // Calculate width of the underscore string (this is the input width)
                let underscoreWidth = measureCtx.measureText(underscoreStr).width;
                if (useScale) {
                    underscoreWidth *= widthScale;
                }
                underscoreWidth *= fontScale;
                
                // Calculate final X position: startX + width of preceding text
                const finalX = itemX + prefixWidth;
                
                clozeFields.push({
                    id: this.generateElementId('cloze'),
                    type: 'text',
                    style: {
                        position: 'absolute',
                        left: `${finalX}px`,
                        top: `${itemY - fontSize}px`, // Adjust Y for baseline alignment
                        width: `${underscoreWidth}px`,
                        height: `${fontSize + 2}px`,
                        zIndex: 10
                    }
                });
            }
            
            // Find Unicode checkboxes (☐, ☑, ☒)
            if (text.includes('☐') || text.includes('☑') || text.includes('☒')) {
                for (let i = 0; i < text.length; i++) {
                    if (text[i] === '☐' || text[i] === '☑' || text[i] === '☒') {
                        const prefixText = text.substring(0, i);
                        let prefixWidth = measureCtx.measureText(prefixText).width;
                        if (useScale) {
                            prefixWidth *= widthScale;
                        }
                        prefixWidth *= fontScale;
                        
                        clozeFields.push({
                            id: this.generateElementId('cloze'),
                            type: 'checkbox',
                            checked: (text[i] === '☑' || text[i] === '☒'),
                            style: {
                                position: 'absolute',
                                left: `${itemX + prefixWidth}px`,
                                top: `${itemY - fontSize}px`,
                                width: `${fontSize}px`, 
                                height: `${fontSize}px`,
                                zIndex: 10
                            }
                        });
                    }
                }
            }
        });
        
        return clozeFields;
    }

    /**
     * Decide which input type a detected box should become
     * @param {number} widthPx - Width in pixels
     * @param {number} heightPx - Height in pixels
     */
    determineBoxType(widthPx, heightPx) {
        const SQUARE_TOLERANCE = 5; // allow a few pixels tolerance for perfect squares
        const isSquare = Math.abs(widthPx - heightPx) <= SQUARE_TOLERANCE;
        if (isSquare && widthPx <= this.CHECKBOX_MAX_SIZE && heightPx <= this.CHECKBOX_MAX_SIZE) {
            return 'checkbox';
        }
        if (heightPx > 35) {
            return 'textarea';
        }
        return 'text';
    }

    /**
     * Add a valid box field to the boxFields array
     * @param {number} rawX - Raw X coordinate from PDF
     * @param {number} rawY - Raw Y coordinate from PDF
     * @param {number} rawW - Raw width from PDF
     * @param {number} rawH - Raw height from PDF
     * @param {Array} matrix - Current transformation matrix
     * @param {Object} viewport - PDF.js viewport object
     * @param {Array} boxFields - Array to add the box to
     */
    addBox(rawX, rawY, rawW, rawH, matrix, viewport, boxFields) {
        // Calculate PDF coordinates bounds
        const p1 = { x: rawX, y: rawY };
        const p2 = { x: rawX + rawW, y: rawY + rawH };
        
        // Transform both points using CTM
        const tx1 = matrix[0] * p1.x + matrix[2] * p1.y + matrix[4];
        const ty1 = matrix[1] * p1.x + matrix[3] * p1.y + matrix[5];
        const tx2 = matrix[0] * p2.x + matrix[2] * p2.y + matrix[4];
        const ty2 = matrix[1] * p2.x + matrix[3] * p2.y + matrix[5];

        // Create PDF rect [x1, y1, x2, y2]
        const pdfRect = [
            Math.min(tx1, tx2), Math.min(ty1, ty2), 
            Math.max(tx1, tx2), Math.max(ty1, ty2)
        ];

        this.addBoxFromPdfRect(pdfRect, viewport, boxFields);
    }

    /**
     * Process path points and add bounding box as field if valid
     * @param {Array} points - Array of point objects with x and y coordinates
     * @param {Array} matrix - Current transformation matrix
     * @param {Object} viewport - PDF.js viewport object
     * @param {Array} boxFields - Array to add the box to
     */
    processPathPoints(points, matrix, viewport, boxFields) {
        // Transform points to PDF Space
        const pdfPoints = points.map(p => ({
            x: matrix[0] * p.x + matrix[2] * p.y + matrix[4],
            y: matrix[1] * p.x + matrix[3] * p.y + matrix[5]
        }));

        // Get Bounding Box in PDF Space
        const xs = pdfPoints.map(p => p.x);
        const ys = pdfPoints.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const w = maxX - minX;
        const h = maxY - minY;

        this.addBoxFromPdfRect([minX, minY, maxX, maxY], viewport, boxFields, true);
    }

    /**
     * Add box from PDF rectangle coordinates
     */
    addBoxFromPdfRect(pdfRect, viewport, boxFields, skipSmallCheck = false, typeHint = null) {
        const [minX, minY, maxX, maxY] = pdfRect;
        const width = maxX - minX;
        const height = maxY - minY;

        if (!skipSmallCheck && (width < this.MIN_SIZE_PDF_UNITS || height < this.MIN_SIZE_PDF_UNITS)) {
            return;
        }

        const vRect = viewport.convertToViewportRectangle([minX, minY, maxX, maxY]);
        const cssX = Math.min(vRect[0], vRect[2]);
        const cssY = Math.min(vRect[1], vRect[3]);
        const cssW = Math.abs(vRect[2] - vRect[0]);
        const cssH = Math.abs(vRect[3] - vRect[1]);

        if (cssW < 10 || cssH < 10) return;
        if (cssW > viewport.width * 0.95 && cssH > viewport.height * 0.95) return;

        let inputType = typeHint || this.determineBoxType(cssW, cssH);

        if (
            (inputType === 'textarea' || typeHint === 'textarea') &&
            cssH <= this.SINGLE_LINE_TEXTAREA_MAX_HEIGHT
        ) {
            inputType = 'text';
        }

        boxFields.push({
            id: this.generateElementId('box'),
            type: inputType,
            isTextarea: inputType === 'textarea',
            style: {
                position: 'absolute',
                left: `${cssX}px`,
                top: `${cssY}px`,
                width: `${cssW}px`,
                height: `${cssH}px`,
                zIndex: 5
            }
        });
    }

    transformPoint(x, y, matrix) {
        return {
            x: matrix[0] * x + matrix[2] * y + matrix[4],
            y: matrix[1] * x + matrix[3] * y + matrix[5]
        };
    }

    /**
     * Processes PDF path operations to extract line segments and categorize them as horizontal or vertical.
     * This function is the first step in detecting table cells and other rectangular structures.
     * 
     * How it works:
     * 1. Iterates through PDF drawing operations (moveTo, lineTo, rectangle) in a constructPath command
     * 2. Transforms raw PDF coordinates to page coordinates using the current transformation matrix (CTM)
     * 3. Collects all line segments that are long enough to be meaningful
     * 4. Categorizes segments as horizontal (similar Y coordinates) or vertical (similar X coordinates)
     * 5. Normalizes and stores them in lineStore for later rectangle construction
     * 
     * @param {Array} ops - Array of operation codes from the PDF constructPath command
     * @param {Array} data - Array of coordinate data corresponding to the operations
     * @param {Array} ctm - Current transformation matrix for converting PDF coordinates to page coordinates
     * @param {Object} viewport - PDF.js viewport object (not used here, but kept for consistency)
     * @param {Array} boxFields - Array to store directly detected rectangles (from rectangle operations)
     * @param {Object} lineStore - Global storage object with hLines and vLines arrays for accumulating line segments
     */
    processLinePathForRectangles(ops, data, ctm, viewport, boxFields, lineStore) {
        let dIndex = 0;
        let currentX = 0;
        let currentY = 0;
        const segments = [];
        
        // Step 1: Parse PDF path operations and extract line segments
        // PDF paths are sequences of moveTo (set start point) and lineTo (draw line) operations
        for (let j = 0; j < ops.length; j++) {
            const op = ops[j];
            if (op === this.OP_CODE.moveTo) {
                // Move to a new starting point without drawing
                currentX = data[dIndex];
                currentY = data[dIndex + 1];
                dIndex += 2;
            } else if (op === this.OP_CODE.lineTo) {
                // Draw a line from current position to next point
                const nextX = data[dIndex];
                const nextY = data[dIndex + 1];
                // Transform both points from PDF coordinates to page coordinates using CTM
                const start = this.transformPoint(currentX, currentY, ctm);
                const end = this.transformPoint(nextX, nextY, ctm);
                // Calculate line length and only keep segments that are long enough
                const length = Math.hypot(end.x - start.x, end.y - start.y);
                if (length >= this.MIN_SIZE_PDF_UNITS) {
                    segments.push({ p1: start, p2: end });
                }
                currentX = nextX;
                currentY = nextY;
                dIndex += 2;
            } else if (op === this.OP_CODE.rectangle) {
                // Direct rectangle operation - add immediately without line processing
                this.addBox(data[dIndex], data[dIndex + 1], data[dIndex + 2], data[dIndex + 3], ctm, viewport, boxFields);
                dIndex += 4;
            } else if (op === 15) {
                // Unknown operation - skip data
                dIndex += 6;
            }
        }

        // Step 2: Categorize line segments as horizontal or vertical
        // A line is horizontal if the Y coordinates of start and end are very similar (within tolerance)
        // A line is vertical if the X coordinates of start and end are very similar (within tolerance)
        const AXIS_TOLERANCE = 3.0; // Tolerance in PDF units for detecting axis-aligned lines
        const MIN_LINE_LENGTH = this.MIN_SIZE_PDF_UNITS;

        const horizontals = segments.filter(seg => Math.abs(seg.p1.y - seg.p2.y) <= AXIS_TOLERANCE);
        const verticals = segments.filter(seg => Math.abs(seg.p1.x - seg.p2.x) <= AXIS_TOLERANCE);

        // Step 3: Normalize and store horizontal lines
        // Normalize means: ensure x1 < x2, and use average Y for the line position
        horizontals.forEach(seg => {
            const x1 = Math.min(seg.p1.x, seg.p2.x);
            const x2 = Math.max(seg.p1.x, seg.p2.x);
            const y = (seg.p1.y + seg.p2.y) / 2; // Use average Y as the line's Y position
            if (x2 - x1 >= MIN_LINE_LENGTH) {
                lineStore.hLines.push({ x1, x2, y });
            }
        });
        
        // Step 4: Normalize and store vertical lines
        // Normalize means: ensure y1 < y2, and use average X for the line position
        verticals.forEach(seg => {
            const y1 = Math.min(seg.p1.y, seg.p2.y);
            const y2 = Math.max(seg.p1.y, seg.p2.y);
            const x = (seg.p1.x + seg.p2.x) / 2; // Use average X as the line's X position
            if (y2 - y1 >= MIN_LINE_LENGTH) {
                lineStore.vLines.push({ y1, y2, x });
            }
        });
    }

    findCorner(hLine, vLine, tolerance) {
        const pointsH = [hLine.p1, hLine.p2];
        const pointsV = [vLine.p1, vLine.p2];
        for (const hp of pointsH) {
            for (const vp of pointsV) {
                if (Math.abs(hp.x - vp.x) <= tolerance && Math.abs(hp.y - vp.y) <= tolerance) {
                    return hp;
                }
            }
        }
        return null;
    }

    /**
     * Constructs rectangles (table cells) from collected horizontal and vertical line segments.
     * This is the core algorithm for detecting table structures in PDFs.
     * 
     * How it works:
     * 1. Takes all horizontal and vertical lines collected from PDF path operations
     * 2. Sorts them by position (horizontal by Y, vertical by X)
     * 3. For each pair of horizontal lines (top and bottom of a potential row):
     *    a. Finds the intersection range where both lines overlap horizontally
     *    b. Finds all vertical lines that span this row and are within the intersection range
     *    c. Creates rectangles from all pairs of these vertical lines (left and right edges)
     * 4. Each resulting rectangle represents a table cell
     * 
     * Example for a 2x3 table:
     * - 3 horizontal lines → 2 rows (pairs: line 0-1, line 1-2)
     * - 4 vertical lines → 3 columns (pairs: line 0-1, line 1-2, line 2-3)
     * - Result: 2 × 3 = 6 cell rectangles
     * 
     * @param {Object} lineStore - Object containing hLines and vLines arrays with collected line segments
     * @param {Object} viewport - PDF.js viewport object for coordinate conversion
     * @param {Array} boxFields - Array to store the detected rectangle boxes
     */
    buildRectanglesFromLines(lineStore, viewport, boxFields) {
        const horizontals = lineStore.hLines;
        const verticals = lineStore.vLines;
        if (!horizontals.length || !verticals.length) {
            return;
        }

        const tol = 5; // Tolerance in PDF units for finding matching/intersecting lines
        const minSpan = this.MIN_SIZE_PDF_UNITS; // Minimum size for a valid rectangle
        let added = 0;
        let skippedTooSmall = 0;
        let skippedNoIntersection = 0;

        // Step 1: Sort lines by position for systematic processing
        // Horizontal lines sorted by Y (top to bottom), vertical lines sorted by X (left to right)
        const normHoriz = horizontals.sort((a, b) => a.y - b.y);
        const normVert = verticals.sort((a, b) => a.x - b.x);

        // Step 2: Build rectangles from all combinations of horizontal and vertical lines
        // Each rectangle (table cell) is defined by:
        // - Two horizontal lines: top edge (line i) and bottom edge (line j, where j > i)
        // - Two vertical lines: left edge and right edge (from the intersecting verticals)
        for (let i = 0; i < normHoriz.length; i++) {
            for (let j = i + 1; j < normHoriz.length; j++) {
                // Get the top and bottom horizontal lines that define a potential row
                const topLine = normHoriz[i];
                const bottomLine = normHoriz[j];
                const cellTop = topLine.y;
                const cellBottom = bottomLine.y;
                const height = cellBottom - cellTop;
                
                // Skip if the row is too small (not a valid cell)
                if (height < minSpan) {
                    skippedTooSmall++;
                    continue;
                }

                // Step 2a: Find the horizontal intersection range
                // This is where both horizontal lines overlap (the X range where a cell could exist)
                const leftBound = Math.max(topLine.x1, bottomLine.x1);
                const rightBound = Math.min(topLine.x2, bottomLine.x2);
                
                // Skip if the lines don't overlap horizontally (no intersection)
                if (leftBound >= rightBound) {
                    skippedNoIntersection++;
                    continue;
                }

                // Step 2b: Find all vertical lines that intersect with this row
                // A vertical line qualifies if:
                // - It spans the full height of the row (or close to it, within tolerance)
                // - It's positioned within the horizontal intersection range
                const intersectingVerticals = normVert.filter(v => {
                    // Vertical line must span from top to bottom (or close to it)
                    const spansHeight = v.y1 <= cellTop + tol && v.y2 >= cellBottom - tol;
                    // Vertical line must be within or near the horizontal range
                    const inRange = v.x >= leftBound - tol && v.x <= rightBound + tol;
                    return spansHeight && inRange;
                });

                // Need at least 2 vertical lines to form a cell (left and right edges)
                if (intersectingVerticals.length < 2) {
                    skippedNoIntersection++;
                    continue;
                }

                // Step 2c: Create rectangles from all pairs of vertical lines
                // Each pair of vertical lines defines a column (left edge and right edge)
                // Combined with the row (top and bottom), this creates a cell rectangle
                for (let k = 0; k < intersectingVerticals.length; k++) {
                    for (let l = k + 1; l < intersectingVerticals.length; l++) {
                        const leftVert = intersectingVerticals[k];
                        const rightVert = intersectingVerticals[l];
                        // Determine left and right edges (handle case where lines might be in wrong order)
                        const cellLeft = Math.min(leftVert.x, rightVert.x);
                        const cellRight = Math.max(leftVert.x, rightVert.x);
                        const width = cellRight - cellLeft;

                        // Skip if the column is too narrow
                        if (width < minSpan) {
                            skippedTooSmall++;
                            continue;
                        }

                        // Step 2d: Ensure the rectangle is within the horizontal line bounds
                        // Clip the rectangle to the actual intersection of horizontal and vertical lines
                        const rectLeft = Math.max(cellLeft, leftBound);
                        const rectRight = Math.min(cellRight, rightBound);
                        const rectWidth = rectRight - rectLeft;

                        // Final size check
                        if (rectWidth < minSpan) {
                            skippedTooSmall++;
                            continue;
                        }

                        // Found a valid cell rectangle!
                        // Convert to PDF rectangle format [minX, minY, maxX, maxY]
                        const pdfRect = [rectLeft, cellTop, rectRight, cellBottom];
                        this.addBoxFromPdfRect(pdfRect, viewport, boxFields, false, 'textarea');
                        added++;
                    }
                }
            }
        }

        if (this.debugBoxExtraction) {
            console.log(`pdfparser @ buildRectanglesFromLines: constructed ${added} rectangles`);
        }
    }

    getRectFromStyle(style) {
        const left = parseFloat(style.left);
        const top = parseFloat(style.top);
        const width = parseFloat(style.width);
        const height = parseFloat(style.height);
        return {
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
            area: width * height
        };
    }

    filterAndMergeBoxes(boxes) {
        if (!boxes || boxes.length === 0) {
            return [];
        }

        const tolerance = this.DUPLICATE_TOLERANCE_PX;
        const keep = new Array(boxes.length).fill(true);
        const rects = boxes.map(box => this.getRectFromStyle(box.style));
        let removedDuplicates = 0;
        let removedContainers = 0;

        // Helper: Check if rectA contains rectB (no tolerance - allows shared edges for table cells)
        const contains = (rectA, rectB) => {
            return rectB.left >= rectA.left &&
                   rectB.right <= rectA.right &&
                   rectB.top >= rectA.top &&
                   rectB.bottom <= rectA.bottom;
        };

        // Phase 1: Remove exact duplicates (same position and size)
        for (let i = 0; i < boxes.length; i++) {
            if (!keep[i]) continue;
            for (let j = i + 1; j < boxes.length; j++) {
                if (!keep[j]) continue;
                const ri = rects[i];
                const rj = rects[j];
                const samePos = Math.abs(ri.left - rj.left) <= tolerance && Math.abs(ri.top - rj.top) <= tolerance;
                const sameSize = Math.abs(ri.width - rj.width) <= tolerance && Math.abs(ri.height - rj.height) <= tolerance;
                
                if (samePos && sameSize) {
                    keep[j] = false;
                    removedDuplicates++;
                }
            }
        }

        // Phase 2: Remove ANY box that contains another box (kleiner gewinnt immer!)
        // Rule: If box i contains box j (regardless of type), remove box i (the larger one)
        for (let i = 0; i < boxes.length; i++) {
            if (!keep[i]) continue;
            const rectI = rects[i];
            const areaI = rectI.area;
            
            // Check if box i contains ANY other box
            for (let j = 0; j < boxes.length; j++) {
                if (i === j || !keep[j]) continue;
                const rectJ = rects[j];
                const areaJ = rectJ.area;
                
                // If box i contains box j (and is larger), remove box i
                if (areaI > areaJ && contains(rectI, rectJ)) {
                    keep[i] = false;
                    removedContainers++;
                    break; // Box i is removed, no need to check further
                }
            }
        }

        const filtered = boxes.filter((box, idx) => keep[idx]);
        if (this.debugBoxExtraction) {
            console.log(`pdfparser @ filterAndMergeBoxes: filtered ${boxes.length} boxes → ${filtered.length}; removed ${removedDuplicates} duplicates, ${removedContainers} containers`);
        }
        return filtered;
    }

    /**
     * Main function to extract drawn rectangles and table structures from PDF page.
     * This is the entry point for detecting interactive form fields that are drawn as shapes
     * rather than defined as PDF form fields (AcroForms).
     * 
     * How it works:
     * 1. Gets the PDF operator list - a sequence of drawing commands (like a graphics API)
     * 2. Tracks the current transformation matrix (CTM) to handle rotations, scaling, translations
     * 3. Processes each operator:
     *    - Direct rectangle operations: immediately added as boxes
     *    - Path construction operations: analyzed for line segments to detect table structures
     * 4. After processing all operators, constructs rectangles from collected line segments
     * 
     * The algorithm handles two types of rectangle detection:
     * - Direct rectangles: PDF commands that explicitly draw rectangles (OPS.rectangle)
     * - Inferred rectangles: Table cells constructed from horizontal and vertical line segments
     * 
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object for coordinate conversion
     * @returns {Array} Array of box field objects representing detected rectangles
     */
    async extractBoxFields(page, viewport) {
        const boxFields = [];
        const opList = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;
        // Global storage for line segments collected across all path operations
        // This allows us to build table structures even if lines are drawn in separate operations
        const lineStore = { hLines: [], vLines: [] };

        // State Machine for tracking transformations
        // PDF uses transformation matrices to handle rotations, scaling, and translations
        // We need to track the current transformation matrix (CTM) to convert coordinates correctly
        let ctm = [1, 0, 0, 1, 0, 0]; // Identity matrix (no transformation)
        const transformStack = []; // Stack for save/restore operations

        // Step 1: Iterate through all PDF drawing operators
        // PDF operators are like graphics API calls: save, restore, transform, rectangle, constructPath, etc.
        for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            const args = opList.argsArray[i];

            if (fn === OPS.save) {
                // Save current transformation state (like pushing onto a graphics stack)
                transformStack.push([...ctm]);
            } else if (fn === OPS.restore) {
                // Restore previous transformation state (like popping from a graphics stack)
                if (transformStack.length) ctm = transformStack.pop();
            } else if (fn === OPS.transform) {
                // Apply transformation matrix multiplication
                // PDF transformations are cumulative - each transform multiplies with the current CTM
                const [a, b, c, d, e, f] = args;
                const [a1, b1, c1, d1, e1, f1] = ctm;
                ctm = [
                    a1 * a + c1 * b, b1 * a + d1 * b,
                    a1 * c + c1 * d, b1 * c + d1 * d,
                    a1 * e + c1 * f + e1, b1 * e + d1 * f + f1
                ];
            } else if (fn === OPS.rectangle) {
                // Direct rectangle command: [x, y, width, height]
                // This is an explicit rectangle - add it immediately
                this.addBox(args[0], args[1], args[2], args[3], ctm, viewport, boxFields);
            } else if (fn === OPS.constructPath) {
                // Path construction: a sequence of moveTo, lineTo, and other path operations
                // This is how tables are typically drawn - as sequences of lines
                const ops = args[0]; // Array of operation codes
                const data = args[1]; // Array of coordinate data
                let dIndex = 0;
                let pathPoints = [];

                // Step 2a: Process path operations for direct rectangles and closed paths
                // Some paths contain explicit rectangles or form closed shapes
                for (let j = 0; j < ops.length; j++) {
                    const op = ops[j];
                    if (op === this.OP_CODE.rectangle) {
                        // Rectangle within a path - add directly
                        this.addBox(data[dIndex], data[dIndex+1], data[dIndex+2], data[dIndex+3], ctm, viewport, boxFields);
                        dIndex += 4;
                    } else if (op === this.OP_CODE.moveTo) {
                        // Start a new subpath - process previous path if it was closed
                        if (pathPoints.length > 2) this.processPathPoints(pathPoints, ctm, viewport, boxFields);
                        pathPoints = [{x: data[dIndex], y: data[dIndex+1]}];
                        dIndex += 2;
                    } else if (op === this.OP_CODE.lineTo) {
                        // Add point to current path
                        pathPoints.push({x: data[dIndex], y: data[dIndex+1]});
                        dIndex += 2;
                    } else if (op === 15) {
                        // Unknown operation - skip data
                        dIndex += 6;
                    }
                }
                // Process final path if any
                if (pathPoints.length > 2) this.processPathPoints(pathPoints, ctm, viewport, boxFields);

                // Step 2b: Extract line segments for table detection
                // This is the key step: analyze the path for horizontal and vertical line segments
                // These segments will be used later to construct table cells
                this.processLinePathForRectangles(ops, data, ctm, viewport, boxFields, lineStore);
            }
        }

        // Step 3: Construct rectangles from collected line segments
        // After processing all operators, we have collected all horizontal and vertical lines
        // Now we can build table cells by finding intersections of these lines
        this.buildRectanglesFromLines(lineStore, viewport, boxFields);
        
        // Log summary of found boxes by type
        const byType = boxFields.reduce((acc, box) => {
            acc[box.type] = (acc[box.type] || 0) + 1;
            return acc;
        }, {});
        if (this.debugBoxExtraction) {
            console.log(`Page: Found ${boxFields.length} total boxes via robust coord calculation:`, byType);
        }
        
        return boxFields;
    }

    /**
     * Detect if text content is rotated and determine rotation direction
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {Promise<number|null>} Rotation angle to correct (90, -90, or null if not rotated)
     */
    async detectTextRotation(page, viewport) {
        const pageIsPortrait = viewport.width < viewport.height;
        if (!pageIsPortrait) return null; // Only check portrait pages
        
        try {
            const textContent = await page.getTextContent();
            if (!textContent.items || textContent.items.length < 3) return null;
            
            let rotated90Count = 0;  // Text rotated 90° clockwise
            let rotated270Count = 0; // Text rotated 270° (or -90°) counter-clockwise
            let totalTextItems = 0;
            
            textContent.items.forEach(item => {
                if (!item.str || item.str.trim().length === 0) return;
                
                // Get transform matrix
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                
                // Extract rotation angle from transform matrix
                const a = tx[0];
                const b = tx[1];
                
                // Calculate rotation angle (in degrees)
                const angle = Math.atan2(b, a) * (180 / Math.PI);
                
                // Normalize angle to 0-360
                const normalizedAngle = ((angle % 360) + 360) % 360;
                
                // Check if text is rotated 90° (clockwise) or 270° (counter-clockwise)
                // Allow some tolerance (±10°)
                if (normalizedAngle >= 80 && normalizedAngle <= 100) {
                    rotated90Count++;
                } else if (normalizedAngle >= 260 && normalizedAngle <= 280) {
                    rotated270Count++;
                }
                totalTextItems++;
            });
            
            // If more than 30% of text items are rotated, determine direction
            const totalRotated = rotated90Count + rotated270Count;
            if (totalTextItems > 0 && totalRotated / totalTextItems > 0.3) {
                // Determine which direction is more common
                if (rotated90Count > rotated270Count) {
                    // Text is rotated 90° clockwise, so we need to rotate -90° (counter-clockwise) to correct
                    return -90;
                } else {
                    // Text is rotated 270° (or -90°) counter-clockwise, so we need to rotate +90° (clockwise) to correct
                    return 90;
                }
            }
            
            return null;
        } catch (error) {
            console.warn(`pdfparser @ detectTextRotation: Error analyzing text orientation:`, error);
            return null;
        }
    }

    /**
     * Process a single PDF page and extract all interactive elements
     * @param {Object} page - PDF.js page object
     * @param {number} pageNum - Page number (1-indexed)
     * @returns {Promise<Object>} Page data object with image, form fields, cloze fields, and box fields
     */
    async processPage(page, pageNum) {
        // Get initial viewport to check rotation
        const initialViewport = page.getViewport({ scale: 1.5 });
        
        // Analyze text orientation to detect rotated content and determine correction angle
        const rotationCorrection = await this.detectTextRotation(page, initialViewport);
        const isContentRotated = rotationCorrection !== null;
        
        // If content is rotated, create viewport with correction rotation
        const viewport = page.getViewport({ scale: 1.5, rotation: rotationCorrection || 0 });
        
        if (isContentRotated) {
            console.log(`pdfparser @ processPage: Page ${pageNum} - Content detected as rotated, applying ${rotationCorrection}° correction (original: ${initialViewport.width.toFixed(1)}x${initialViewport.height.toFixed(1)}, corrected: ${viewport.width.toFixed(1)}x${viewport.height.toFixed(1)})`);
        }
        
        // Render page to canvas image with corrected rotation
        const imgSrc = await this.renderPageToCanvas(page, viewport);
        
        // Extract all field types in parallel (they will be in corrected coordinates)
        const [formFields, clozeFields, rawBoxFields] = await Promise.all([
            this.extractFormFields(page, viewport, pageNum),
            this.extractClozeFields(page, viewport),
            this.extractBoxFields(page, viewport)
        ]);
        if (this.debugBoxExtraction) {
            console.log(`processPage: rawBoxFields=${rawBoxFields.length}`);
        }
        const warnings = [];
        const hasWarning = rawBoxFields.length < this.SCAN_MIN_BOXES;
        if (hasWarning) {
            const warningMsg = `pdfparser @ processPage: only ${rawBoxFields.length} boxes found (possible scanned PDF without detectable forms)`;
           // console.warn(warningMsg);
            warnings.push(warningMsg);
        }
        
        const boxFields = this.filterAndMergeBoxes(rawBoxFields);
        
        return {
            width: viewport.width,
            height: viewport.height,
            imgSrc: imgSrc,
            formFields: formFields,
            clozeFields: clozeFields,
            boxFields: boxFields,
            warnings,
            hasWarning: hasWarning, // Only trigger warning dialog for "less than 2 boxes" warning
            isContentRotated: isContentRotated
        };
    }

    /**
     * Parse PDF data and extract interactive elements from all pages
     * @param {Uint8Array|ArrayBuffer} pdfData - Raw PDF file data
     * @returns {Promise<Array>} Array of page objects with form fields, cloze fields, and box fields
     */
    async parse(pdfData) {
        this.setupWorker();

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData) });
        const pdfDocument = await loadingTask.promise;
        
        const pagesData = [];

        // Process all pages
        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const pageData = await this.processPage(page, pageNum);
            pagesData.push(pageData);
        }
        
        return pagesData;
    }



    getFontInfo(page, fontName) {
        
        if (!page || !fontName) return null;
        const commonObjs = page.commonObjs;
        if (!commonObjs) return null;
        const stores = [
            commonObjs._objs,
            commonObjs._objMap,
            commonObjs._objCache
        ];
        const keyCandidates = new Set([fontName, `font_${fontName}`]);
        let entry = null;
        if (typeof commonObjs.get === 'function') {
            try {
                const direct = commonObjs.get(fontName);
                if (direct) {
                    return this.formatFontInfo(direct);
                }
            } catch (err) {
                if (this.debugClozeFonts) {
                    console.log(`pdfparser @ getFontInfo: commonObjs.get(${fontName}) failed`, err);
                }
            }
        }
        for (const store of stores) {
            if (!store) continue;
            const fetchFromStore = key => {
                if (typeof store.get === 'function') {
                    return store.get(key);
                }
                return store[key];
            };
            for (const key of [...keyCandidates]) {
                entry = fetchFromStore(key);
                if (entry) break;
            }
            if (!entry && typeof store === 'object') {
                const keys = Object.keys(store);
                for (const key of keys) {
                    if (entry) break;
                    const value = store[key];
                    const actualKey = typeof key === 'string' ? key : `${key}`;
                    if (actualKey === fontName || actualKey === `font_${fontName}` || actualKey.startsWith(fontName) || (value?.data?.loadedName && value.data.loadedName === fontName)) {
                        entry = value;
                        keyCandidates.add(actualKey);
                    }
                }
            }
            if (entry) break;
        }
        if (!entry) {
  
            return null;
        }
        if (!entry.data && entry.promise && typeof entry.promise.then === 'function') {
            if (!this.pendingFontLogs.has(fontName)) {
                this.pendingFontLogs.add(fontName);
                entry.promise.then(() => {
                    this.pendingFontLogs.delete(fontName);
                   
                }).catch(() => this.pendingFontLogs.delete(fontName));
            }
            if (this.debugClozeFonts) {
                console.log(`pdfparser @ getFontInfo: font ${fontName} still loading, will log once ready`);
            }
            return null;
        }
        return this.formatFontInfo(entry);
    }

    formatFontInfo(entry) {
        const data = entry?.data || entry;
        if (!data) return null;

        const baseName = data.name || data.loadedName || data.baseFont;
        const fallback = data.fallbackName || data.systemFontFamily;
        const isEmbedded = baseName && fallback ? baseName !== fallback : Boolean(data.data);
        const isSubset = typeof baseName === 'string' ? /^[A-Z0-9]{6}\+/.test(baseName) : false;
        const fontType = data.type;
        return {
            baseFont: baseName,
            fontName: data.loadedName || baseName,
            family: fallback,
            isEmbedded,
            isSubset,
            fontType
        };
    }

    findFontAdjustmentByName(name) {
        if (!name) return null;
        const cleanName = name.replace(/^[A-Z0-9]{6}\+/, '');
        for (const [key, value] of Object.entries(this.fontAdjustments)) {
            if (key === name || key === cleanName || key.includes(cleanName) || cleanName.includes(key)) {
                return value;
            }
        }
        return null;
    }
}

/**
 * Parse PDF data and extract interactive elements
 * @param {Uint8Array|ArrayBuffer} pdfData - Raw PDF file data
 * @returns {Promise<Array>} Array of page objects with form fields, cloze fields, and box fields
 */
export async function parsePdfToPages(pdfData) {
    const parser = new PdfParser();
    return await parser.parse(pdfData);
}
