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
        this.CHECKBOX_MAX_SIZE = 60; // px threshold to treat as checkbox
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
            const fontFamily = fontStyle ? fontStyle.fontFamily : 'sans-serif';
            measureCtx.font = `${fontSize}px ${fontFamily}`;
            
            // Find cloze text patterns (____)
            const regex = /(_+)/g;
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                const underscoreStr = match[0];
                const startIndex = match.index;
                
                // Calculate width of text before the underscore
                const prefixText = text.substring(0, startIndex);
                const prefixWidth = measureCtx.measureText(prefixText).width;
                
                // Calculate width of the underscore string (this is the input width)
                const underscoreWidth = measureCtx.measureText(underscoreStr).width;
                
                // Calculate final X position: startX + width of preceding text
                const finalX = itemX + prefixWidth;
                
                clozeFields.push({
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
                        const prefixWidth = measureCtx.measureText(prefixText).width;
                        
                        clozeFields.push({
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
        const SMALL_BOX_THRESHOLD = 50; // boxes smaller than 50px count as checkboxes
        const SQUARE_TOLERANCE = 5; // allow a few pixels tolerance for perfect squares
        const isSquare = Math.abs(widthPx - heightPx) <= SQUARE_TOLERANCE;
        if (isSquare && widthPx <= SMALL_BOX_THRESHOLD && heightPx <= SMALL_BOX_THRESHOLD) {
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

        const inputType = typeHint || this.determineBoxType(cssW, cssH);

        boxFields.push({
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

    processLinePathForRectangles(ops, data, ctm, viewport, boxFields, lineStore) {
        let dIndex = 0;
        let currentX = 0;
        let currentY = 0;
        const segments = [];
        for (let j = 0; j < ops.length; j++) {
            const op = ops[j];
            if (op === this.OP_CODE.moveTo) {
                currentX = data[dIndex];
                currentY = data[dIndex + 1];
                dIndex += 2;
            } else if (op === this.OP_CODE.lineTo) {
                const nextX = data[dIndex];
                const nextY = data[dIndex + 1];
                const start = this.transformPoint(currentX, currentY, ctm);
                const end = this.transformPoint(nextX, nextY, ctm);
                const length = Math.hypot(end.x - start.x, end.y - start.y);
                if (length >= this.MIN_SIZE_PDF_UNITS) {
                    segments.push({ p1: start, p2: end });
                }
                currentX = nextX;
                currentY = nextY;
                dIndex += 2;
            } else if (op === this.OP_CODE.rectangle) {
                this.addBox(data[dIndex], data[dIndex + 1], data[dIndex + 2], data[dIndex + 3], ctm, viewport, boxFields);
                dIndex += 4;
            } else if (op === 15) {
                dIndex += 6;
            }
        }

        const AXIS_TOLERANCE = 2.5;
        const MIN_LINE_LENGTH = this.MIN_SIZE_PDF_UNITS;

        const horizontals = segments.filter(seg => Math.abs(seg.p1.y - seg.p2.y) <= AXIS_TOLERANCE);
        const verticals = segments.filter(seg => Math.abs(seg.p1.x - seg.p2.x) <= AXIS_TOLERANCE);

        horizontals.forEach(seg => {
            const x1 = Math.min(seg.p1.x, seg.p2.x);
            const x2 = Math.max(seg.p1.x, seg.p2.x);
            const y = (seg.p1.y + seg.p2.y) / 2;
            if (x2 - x1 >= MIN_LINE_LENGTH) {
                lineStore.hLines.push({ x1, x2, y });
            }
        });
        verticals.forEach(seg => {
            const y1 = Math.min(seg.p1.y, seg.p2.y);
            const y2 = Math.max(seg.p1.y, seg.p2.y);
            const x = (seg.p1.x + seg.p2.x) / 2;
            if (y2 - y1 >= MIN_LINE_LENGTH) {
                lineStore.vLines.push({ y1, y2, x });
            }
        });
        console.log(`processLinePathForRectangles: horiz=${horizontals.length} vert=${verticals.length}`);

        let constructed = 0;
        horizontals.forEach(hLine => {
            verticals.forEach(vLine => {
                const corner = this.findCorner(hLine, vLine, AXIS_TOLERANCE * 2);
                if (!corner) return;
                const width = Math.abs(hLine.p1.x - hLine.p2.x);
                const height = Math.abs(vLine.p1.y - vLine.p2.y);
                if (width < MIN_LINE_LENGTH || height < MIN_LINE_LENGTH) {
                    return;
                }
                const minX = Math.min(hLine.p1.x, hLine.p2.x, vLine.p1.x, vLine.p2.x);
                const minY = Math.min(hLine.p1.y, hLine.p2.y, vLine.p1.y, vLine.p2.y);
                this.addBoxFromPdfRect([minX, minY, minX + width, minY + height], viewport, boxFields, false, 'textarea');
                constructed++;
            });
        });
        if (constructed > 0) {
            console.log(`processLinePathForRectangles: constructed=${constructed}`);
        }
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

    buildRectanglesFromLines(lineStore, viewport, boxFields) {
        const horizontals = lineStore.hLines;
        const verticals = lineStore.vLines;
        if (!horizontals.length || !verticals.length) {
            return;
        }

        const tol = 3;
        const minSpan = this.MIN_SIZE_PDF_UNITS;
        let added = 0;

        const normHoriz = horizontals.sort((a, b) => a.y - b.y);
        const normVert = verticals.sort((a, b) => a.x - b.x);
        console.log(`buildRectanglesFromLines: horizLines=${normHoriz.length} vertLines=${normVert.length}`);

        const findVerticalNear = (xTarget, yTop, yBottom) => {
            return normVert.find(v =>
                Math.abs(v.x - xTarget) <= tol &&
                v.y1 <= yTop + tol &&
                v.y2 >= yBottom - tol &&
                (v.y2 - v.y1) >= (yBottom - yTop) - tol
            );
        };

        for (let i = 0; i < normHoriz.length; i++) {
            for (let j = i + 1; j < normHoriz.length; j++) {
                const top = normHoriz[i];
                const bottom = normHoriz[j];
                const height = bottom.y - top.y;
                if (height < minSpan) continue;

                const overlapStart = Math.max(top.x1, bottom.x1);
                const overlapEnd = Math.min(top.x2, bottom.x2);
                const width = overlapEnd - overlapStart;
                if (width < minSpan) continue;

                const left = findVerticalNear(overlapStart, top.y, bottom.y);
                const right = findVerticalNear(overlapEnd, top.y, bottom.y);
                if (!left || !right) continue;

                this.addBoxFromPdfRect([overlapStart, top.y, overlapEnd, bottom.y], viewport, boxFields, false, 'textarea');
                added++;
            }
        }

        console.log(`buildRectanglesFromLines: constructed=${added}`);
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

        // Remove duplicates or conflicting boxes at same origin, prefer smaller (likely checkbox)
        const getPriority = box => {
            if (box.type === 'checkbox') return 3;
            if (box.type === 'textarea') return 2;
            return 1;
        };

        for (let i = 0; i < boxes.length; i++) {
            if (!keep[i]) continue;
            for (let j = i + 1; j < boxes.length; j++) {
                if (!keep[j]) continue;
                const ri = rects[i];
                const rj = rects[j];
                const samePos = Math.abs(ri.left - rj.left) <= tolerance && Math.abs(ri.top - rj.top) <= tolerance;
                const sameSize = Math.abs(ri.width - rj.width) <= tolerance && Math.abs(ri.height - rj.height) <= tolerance;
                if (!samePos) continue;
                if (sameSize) {
                    keep[j] = false;
                    console.log(`filterAndMergeBoxes: drop duplicate ${j} vs ${i}`);
                    continue;
                }

                const priI = getPriority(boxes[i]);
                const priJ = getPriority(boxes[j]);

                if (priI !== priJ) {
                    // Keep higher priority (checkbox over textarea over text)
                    if (priI > priJ) {
                        keep[j] = false;
                        console.log(`filterAndMergeBoxes: keep ${i} (priority ${priI}) drop ${j} (priority ${priJ})`);
                    } else {
                        keep[i] = false;
                        console.log(`filterAndMergeBoxes: keep ${j} (priority ${priJ}) drop ${i} (priority ${priI})`);
                        break;
                    }
                    continue;
                }

                // Same priority -> keep smaller (assume inner field more relevant)
                const preferJ = rj.area < ri.area;
                if (preferJ) {
                    keep[i] = false;
                    console.log(`filterAndMergeBoxes: drop larger ${i} keep ${j}`);
                    break;
                } else {
                    keep[j] = false;
                    console.log(`filterAndMergeBoxes: drop larger ${j} keep ${i}`);
                }
            }
            if (!keep[i]) continue;
        }

        // Remove outer boxes only if fully enclosing smaller ones of same priority
        for (let i = 0; i < boxes.length; i++) {
            if (!keep[i]) continue;
            for (let j = 0; j < boxes.length; j++) {
                if (i === j || !keep[j]) continue;
                const outer = rects[i];
                const inner = rects[j];
                const contains = inner.left >= outer.left + tolerance &&
                    inner.right <= outer.right - tolerance &&
                    inner.top >= outer.top + tolerance &&
                    inner.bottom <= outer.bottom - tolerance;
                if (!contains) continue;

                const priOuter = getPriority(boxes[i]);
                const priInner = getPriority(boxes[j]);

                const higherPriorityInside = priInner >= priOuter;
                const muchBiggerContainer = outer.area > inner.area * 1.5;

                if (higherPriorityInside || muchBiggerContainer) {
                    keep[i] = false;
                    console.log(`filterAndMergeBoxes: drop container ${i} (type ${boxes[i].type}, area ${outer.area}) because contains ${j} (type ${boxes[j].type}, area ${inner.area})`);
                    break;
                }
            }
        }

        // Ensure checkboxes are never covered by larger boxes
        for (let i = 0; i < boxes.length; i++) {
            if (!keep[i] || boxes[i].type !== 'checkbox') continue;
            const cbRect = rects[i];
            for (let j = 0; j < boxes.length; j++) {
                if (i === j || !keep[j]) continue;
                const otherRect = rects[j];
                const contains = cbRect.left >= otherRect.left - tolerance &&
                    cbRect.right <= otherRect.right + tolerance &&
                    cbRect.top >= otherRect.top - tolerance &&
                    cbRect.bottom <= otherRect.bottom + tolerance;
                if (contains && otherRect.area > cbRect.area * 4) {
                    keep[j] = false;
                    console.log(`filterAndMergeBoxes: drop overlay ${j} because it covers checkbox ${i}`);
                }
            }
        }

        // Remove large containers covering inner boxes (tables/areas)
        for (let i = 0; i < boxes.length; i++) {
            if (!keep[i]) continue;
            const outer = rects[i];
            const contained = [];
            for (let j = 0; j < boxes.length; j++) {
                if (i === j || !keep[j]) continue;
                const inner = rects[j];
                if (
                    inner.left >= outer.left + tolerance &&
                    inner.right <= outer.right - tolerance &&
                    inner.top >= outer.top + tolerance &&
                    inner.bottom <= outer.bottom - tolerance
                ) {
                    contained.push(j);
                }
            }
            if (contained.length >= 1) {
                const containedAreas = contained.map(idx => rects[idx].area);
                const maxInnerArea = Math.max(...containedAreas);
                if (outer.area > maxInnerArea * 2.5) {
                    keep[i] = false;
                    console.log(`filterAndMergeBoxes: drop container ${i} covering ${contained.length} boxes (outer area ${outer.area} vs max inner ${maxInnerArea})`);
                }
            }
        }

        const filtered = boxes.filter((box, idx) => keep[idx]);
        console.log(`filterAndMergeBoxes: before=${boxes.length} after=${filtered.length}`);
        return filtered;
    }

    /**
     * Parse operator list to extract drawn rectangles and paths
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {Array} Array of box field objects representing drawn rectangles
     */
    async extractBoxFields(page, viewport) {
        const boxFields = [];
        const opList = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;
        const lineStore = { hLines: [], vLines: [] };

        // State Machine for tracking transformations
        let ctm = [1, 0, 0, 1, 0, 0]; 
        const transformStack = [];

        // Iterate through all operators
        for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            const args = opList.argsArray[i];

            if (fn === OPS.save) {
                // Save current transformation state
                transformStack.push([...ctm]);
            } else if (fn === OPS.restore) {
                // Restore previous transformation state
                if (transformStack.length) ctm = transformStack.pop();
            } else if (fn === OPS.transform) {
                // Apply transformation matrix multiplication
                const [a, b, c, d, e, f] = args;
                const [a1, b1, c1, d1, e1, f1] = ctm;
                ctm = [
                    a1 * a + c1 * b, b1 * a + d1 * b,
                    a1 * c + c1 * d, b1 * c + d1 * d,
                    a1 * e + c1 * f + e1, b1 * e + d1 * f + f1
                ];
            } else if (fn === OPS.rectangle) {
                // Direct rectangle command: [x, y, width, height]
                this.addBox(args[0], args[1], args[2], args[3], ctm, viewport, boxFields);
            } else if (fn === OPS.constructPath) {
                const ops = args[0];
                const data = args[1];
                // existing bounding box fallback
                let dIndex = 0;
                let pathPoints = [];

                for (let j = 0; j < ops.length; j++) {
                    const op = ops[j];
                    if (op === this.OP_CODE.rectangle) {
                        this.addBox(data[dIndex], data[dIndex+1], data[dIndex+2], data[dIndex+3], ctm, viewport, boxFields);
                        dIndex += 4;
                    } else if (op === this.OP_CODE.moveTo) {
                        if (pathPoints.length > 2) this.processPathPoints(pathPoints, ctm, viewport, boxFields);
                        pathPoints = [{x: data[dIndex], y: data[dIndex+1]}];
                        dIndex += 2;
                    } else if (op === this.OP_CODE.lineTo) {
                        pathPoints.push({x: data[dIndex], y: data[dIndex+1]});
                        dIndex += 2;
                    } else if (op === 15) {
                        dIndex += 6;
                    }
                }
                if (pathPoints.length > 2) this.processPathPoints(pathPoints, ctm, viewport, boxFields);

                // additional rectangle detection via line segments
                this.processLinePathForRectangles(ops, data, ctm, viewport, boxFields, lineStore);
            }
        }

        this.buildRectanglesFromLines(lineStore, viewport, boxFields);
        console.log(`Page: Found ${boxFields.length} boxes via robust coord calculation`);
        return boxFields;
    }

    /**
     * Process a single PDF page and extract all interactive elements
     * @param {Object} page - PDF.js page object
     * @param {number} pageNum - Page number (1-indexed)
     * @returns {Promise<Object>} Page data object with image, form fields, cloze fields, and box fields
     */
    async processPage(page, pageNum) {
        const viewport = page.getViewport({ scale: 1.5 });
        
        // Render page to canvas image
        const imgSrc = await this.renderPageToCanvas(page, viewport);
        
        // Extract all field types in parallel
        const [formFields, clozeFields, rawBoxFields] = await Promise.all([
            this.extractFormFields(page, viewport, pageNum),
            this.extractClozeFields(page, viewport),
            this.extractBoxFields(page, viewport)
        ]);
        console.log(`processPage: rawBoxFields=${rawBoxFields.length}`);
        const boxFields = this.filterAndMergeBoxes(rawBoxFields);
        
        
        return {
            width: viewport.width,
            height: viewport.height,
            imgSrc: imgSrc,
            formFields: formFields,
            clozeFields: clozeFields,
            boxFields: boxFields
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
