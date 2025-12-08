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
    constructor(options = {}) {
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
        this.debugBoxExtraction = true;


        // python3 pdf-parser.py -o 8 lückentextmitpunkten.pdf	Liefert den /Widths Array (die horizontalen Breiten) sowie die Referenz für den FontDescriptor (12 0 R) und das Encoding-Dictionary (17 0 R).
        // python3 pdf-parser.py -o 12 lückentextmitpunkten.pdf	Liefert die globalen Metriken: /Ascent, /Descent, /CapHeight, /XHeight und /FontWeight.
        // python3 pdf-parser.py -o 17 lückentextmitpunkten.pdf	Liefert die /BaseEncoding /WinAnsiEncoding und den /Differences-Array. Dies bestätigt das Mapping von Code 32 zu space und Code 133 zu ellipsis.


        this.fontAdjustments = {
            //NotoSans-Regular mit sans-serif ersetzen
            'NotoSans-Regular': {   
                family: 'sans-serif', 
                scale: 1 
            },
            //LiberationSans mit sans-serif ersetzen
            'LiberationSans': {   
                family: 'sans-serif', 
                scale: 1 
            },

            'HelveticaNeueLTPro-Lt': { 
                family: 'hv, Helvetica Neue, Helvetica, Arial, sans-serif', 
                scale: 1
            },
            'ArialMT': { 
                family: 'Arial, Helvetica, sans-serif', 
                scale: 1 
            },
            'TimesNewRomanPSMT': { 
                family: 'Times New Roman, Times, serif', 
                scale: 1 
            },
            'PoloBasisTB-Leicht': { 
                family: 'Arial, Helvetica, sans-serif', 
                scale: 1,
                // Global kerning compensation per character (empirical value, may need calibration)
                kerningCompensationEm: 0.022, // Compensates for missing negative kerning in advance widths
                // PDF encoding from Font (obj 8) - /Encoding 17 0 R
                encoding: {
                    baseEncoding: 'WinAnsiEncoding',
                    // Differences starting at code 26: [26 /approxequal /fl /fi /currency /greaterequal /minus]
                    // Codes 26-31 are mapped to Differences array indices 0-5
                    // Code 32 (space) and above use WinAnsiEncoding standard mapping
                    differences: {
                        26: 0, // /approxequal -> widths[0]
                        27: 1, // /fl -> widths[1]
                        28: 2, // /fi -> widths[2]
                        29: 3, // /currency -> widths[3]
                        30: 4, // /greaterequal -> widths[4]
                        31: 5  // /minus -> widths[5]
                    }
                },
                // PDF glyph widths from Font (obj 8) - /Widths array with /FirstChar 26, /LastChar 252
                glyphWidths: {
                    widths: [486, 567, 567, 595, 486, 486, 243, 0, 0, 0, 495, 0, 587, 0, 324, 324, 0, 486, 203, 277, 203, 375, 486, 412, 486, 486, 486, 486, 486, 465, 486, 486, 243, 220, 486, 486, 486, 385, 0, 587, 608, 547, 628, 527, 466, 628, 648, 0, 284, 547, 466, 830, 648, 648, 527, 648, 567, 527, 466, 628, 547, 830, 526, 506, 506, 284, 0, 284, 0, 608, 0, 506, 547, 446, 547, 506, 324, 542, 547, 243, 223, 466, 243, 830, 547, 527, 547, 547, 344, 425, 344, 527, 466, 749, 446, 446, 446, 0, 283, 0, 0, 0, 0, 0, 0, 0, 319, 1009, 0, 0, 0, 1142, 0, 0, 0, 0, 0, 0, 0, 0, 0, 319, 0, 0, 486, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 883, 0, 0, 0, 0, 0, 0, 342, 0, 301, 0, 0, 0, 0, 283, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 587, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 648, 0, 668, 0, 0, 0, 628, 0, 0, 567, 0, 0, 0, 0, 506, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 527, 0, 0, 0, 0, 0, 527],
                    firstChar: 26,
                    lastChar: 252
                }
            },
            'PoloBasisTB-Krftg': {
                family: 'Arial, Helvetica, sans-serif',
                scale: 1,
                // Global kerning compensation per character (empirical value, may need calibration)
                kerningCompensationEm: 0.022, // Bolder fonts typically need more compensation
                // PDF encoding from Font (obj 21) - /Encoding 4 0 R
                encoding: {
                    baseEncoding: 'WinAnsiEncoding',
                    // Differences starting at code 27: [27 /fi /fl /approxequal /minus /currency]
                    // Codes 27-31 are mapped to Differences array indices 0-4
                    // Code 32 (space) and above use WinAnsiEncoding standard mapping
                    differences: {
                        27: 0, // /fi -> widths[0]
                        28: 1, // /fl -> widths[1]
                        29: 2, // /approxequal -> widths[2]
                        30: 3, // /minus -> widths[3]
                        31: 4  // /currency -> widths[4]
                    }
                },
                // PDF glyph widths from Font (obj 21) - /Widths array with /FirstChar 27, /LastChar 252
                glyphWidths: {
                    widths: [596, 599, 486, 486, 598, 243, 311, 0, 0, 0, 770, 0, 0, 321, 321, 0, 486, 235, 287, 235, 387, 486, 412, 486, 486, 486, 486, 486, 470, 486, 486, 263, 253, 486, 486, 486, 405, 0, 600, 608, 524, 633, 527, 487, 632, 641, 295, 294, 574, 468, 858, 652, 625, 556, 618, 567, 525, 470, 628, 556, 854, 0, 0, 496, 0, 0, 0, 0, 0, 0, 507, 547, 415, 545, 506, 333, 529, 547, 253, 253, 508, 253, 833, 547, 526, 545, 545, 351, 435, 355, 537, 454, 739, 473, 456, 431, 0, 0, 0, 0, 0, 0, 0, 0, 0, 351, 1339, 0, 0, 0, 1134, 0, 0, 0, 0, 0, 0, 0, 0, 0, 375, 0, 0, 486, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 337, 0, 336, 336, 0, 0, 0, 303, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 625, 0, 0, 0, 0, 0, 628, 0, 0, 572, 0, 0, 0, 0, 507, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 526, 0, 0, 0, 0, 0, 537],
                    firstChar: 27,
                    lastChar: 252
                }
            }
        };
        
        // Feature flags - all enabled by default (true) for backward compatibility
        // Standard values are explicitly set to true for better visibility
        this.detectCheckboxes = options.detectCheckboxes ?? true; // Unicode checkboxes (☐, ☑, ☒)
        this.detectUnderscores = options.detectUnderscores ?? true; // Underscore gaps (____)
        this.detectDots = options.detectDots ?? true; // Dot gaps (....)
        this.detectDeselectFields = options.detectDeselectFields ?? true; // Standalone capital letters
        this.detectIsolatedLines = options.detectIsolatedLines ?? true; // Isolated horizontal lines
        this.detectFormFields = options.detectFormFields ?? true; // PDF form fields (AcroForms)
        this.detectBoxFields = options.detectBoxFields ?? true; // Drawn rectangles and tables
        
        // Filter options
        this.enableFilterAndMerge = options.enableFilterAndMerge ?? true; // Remove duplicates and containers
        this.enableFilterBoxesWithText = options.enableFilterBoxesWithText ?? true; // Filter boxes containing text
        this.enableFilterBoxesWithTextPrecise = options.enableFilterBoxesWithTextPrecise ?? true; // Precise text overlap filter 
      
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
            let customAdjust = null;
            if (fontInfo) {
                // Try baseFont first (most specific), then fontName as fallback
                customAdjust = this.findFontAdjustmentByName(fontInfo.baseFont) || 
                               this.findFontAdjustmentByName(fontInfo.fontName);
                if (customAdjust) {
                    if (customAdjust.family) {
                        effectiveFontFamily = customAdjust.family;
                    }
                    if (typeof customAdjust.scale === 'number') {
                        fontScale = customAdjust.scale;
                    }
                } else {
                    // Debug: log when font adjustment is not found
                    console.log(`pdfparser @ font adjustment not found:`, {
                        baseFont: fontInfo.baseFont,
                        fontName: fontInfo.fontName,
                        family: fontInfo.family,
                        currentEffectiveFont: effectiveFontFamily
                    });
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
            if (this.detectUnderscores) {
                const regex = /(_+)/g;
                let match;
                
                while ((match = regex.exec(text)) !== null) {
                const underscoreStr = match[0];
                const startIndex = match.index;
                
                // Calculate width of text before the underscore
                const prefixText = text.substring(0, startIndex);
                let prefixWidth = this.measureTextWidthWithMetrics(prefixText, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                
                // Calculate width of the underscore string (this is the input width)
                let underscoreWidth = this.measureTextWidthWithMetrics(underscoreStr, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                
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
            }
            
            // Find cloze text patterns with dots (.... or … or combinations) - minimum 4 dots total
            // Handles both single dots (.) and ellipsis characters (… = 3 dots)
            // Excludes: exactly 3 single dots, exactly 1 ellipsis (3 dots)
            // Field starts at the beginning of the sequence, includes all dots
            if (this.detectDots) {
                // Match sequences of dots (.) and ellipsis (…) - at least one character
                const dotRegex = /([.…]+)/g;
                let dotMatch;
                let lastIndex = 0; // Track last processed position to avoid overlaps
                
                while ((dotMatch = dotRegex.exec(text)) !== null) {
                    const dotStr = dotMatch[0];
                    const startIndex = dotMatch.index;
                    
                    // Skip if we've already processed this position (shouldn't happen, but safety check)
                    if (startIndex < lastIndex) {
                        continue;
                    }
                    
                    // Count total dots: single dots (.) = 1, ellipsis (…) = 3
                    let totalDotCount = 0;
                    for (let i = 0; i < dotStr.length; i++) {
                        if (dotStr[i] === '.') {
                            totalDotCount += 1;
                        } else if (dotStr[i] === '…') {
                            totalDotCount += 3;
                        }
                    }
                    
                    // Skip if exactly 3 single dots or exactly 1 ellipsis (3 dots total)
                    if (totalDotCount === 3 && dotStr === '...') {
                        lastIndex = startIndex + dotStr.length;
                        continue; // Skip exactly 3 single dots
                    }
                    if (totalDotCount === 3 && dotStr === '…') {
                        lastIndex = startIndex + dotStr.length;
                        continue; // Skip exactly 1 ellipsis
                    }
                    
                    // Only process if at least 4 dots total
                    if (totalDotCount < 4) {
                        lastIndex = startIndex + dotStr.length;
                        continue;
                    }
                    
                    // Field includes ALL dots from the beginning of the sequence
                    // Calculate width of text before the dots (everything before startIndex)
                    const prefixText = text.substring(0, startIndex);
                    // Use precise glyph width calculation
                    let prefixWidth = this.measureTextWidthWithMetrics(prefixText, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                    
                    // Calculate width of the ENTIRE dot string (includes all dots from start)
                    let dotWidth = this.measureTextWidthWithMetrics(dotStr, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                    
                    
                    // Calculate final X position: startX + width of preceding text
                    // This positions the field at the very beginning of the dot sequence
                    const finalX = itemX + prefixWidth;
                    
                    clozeFields.push({
                        id: this.generateElementId('cloze'),
                        type: 'text',
                        style: {
                            position: 'absolute',
                            left: `${finalX}px`, // Starts at beginning of sequence
                            top: `${itemY - fontSize}px`, // Adjust Y for baseline alignment
                            width: `${dotWidth}px`, // Width includes ALL dots
                            height: `${fontSize + 2}px`,
                            zIndex: 10
                        }
                    });
                    
                    lastIndex = startIndex + dotStr.length;
                }
            }
            
            // Find Unicode checkboxes (☐, ☑, ☒)
            if (this.detectCheckboxes && (text.includes('☐') || text.includes('☑') || text.includes('☒'))) {
                for (let i = 0; i < text.length; i++) {
                    if (text[i] === '☐' || text[i] === '☑' || text[i] === '☒') {
                        const prefixText = text.substring(0, i);
                        let prefixWidth = this.measureTextWidthWithMetrics(prefixText, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                        
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
        
        // Extract standalone capital letters as deselect fields
        if (this.detectDeselectFields) {
            const deselectFields = await this.extractDeselectFields(page, viewport);
            clozeFields.push(...deselectFields);
        }
        
        // Find isolated horizontal lines and create cloze fields
        if (this.detectIsolatedLines) {
            const isolatedLineFields = await this.findIsolatedHorizontalLines(page, viewport);
            clozeFields.push(...isolatedLineFields);
        }
        
        return clozeFields;
    }

    async findIsolatedHorizontalLines(page, viewport) {
        const clozeFields = [];
        // Extract all horizontal and vertical lines
        const opList = await page.getOperatorList();
        const OPS = pdfjsLib.OPS;
        const hLines = [];
        const vLines = [];
        let ctm = [1, 0, 0, 1, 0, 0];
        const transformStack = [];
        
        for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            const args = opList.argsArray[i];
            
            if (fn === OPS.save) transformStack.push([...ctm]);
            else if (fn === OPS.restore && transformStack.length) ctm = transformStack.pop();
            else if (fn === OPS.transform) {
                const [a, b, c, d, e, f] = args;
                const [a1, b1, c1, d1, e1, f1] = ctm;
                ctm = [a1 * a + c1 * b, b1 * a + d1 * b, a1 * c + c1 * d, b1 * c + d1 * d, a1 * e + c1 * f + e1, b1 * e + d1 * f + f1];
            } else if (fn === OPS.constructPath) {
                const ops = args[0], data = args[1];
                let dIndex = 0, currentX = 0, currentY = 0;
                for (let j = 0; j < ops.length; j++) {
                    const op = ops[j];
                    if (op === this.OP_CODE.moveTo) {
                        currentX = data[dIndex]; currentY = data[dIndex + 1]; dIndex += 2;
                    } else if (op === this.OP_CODE.lineTo) {
                        const nextX = data[dIndex], nextY = data[dIndex + 1];
                        const start = this.transformPoint(currentX, currentY, ctm);
                        const end = this.transformPoint(nextX, nextY, ctm);
                        const dx = Math.abs(end.x - start.x);
                        const dy = Math.abs(end.y - start.y);
                        
                        if (dy <= 3.0 && dx >= 10) {
                            // Horizontal line
                            const x1 = Math.min(start.x, end.x), x2 = Math.max(start.x, end.x);
                            const y = (start.y + end.y) / 2;
                            // Convert PDF coordinates to viewport coordinates
                            const pdfRect = [x1, y - 0.5, x2, y + 0.5];
                            const vRect = viewport.convertToViewportRectangle(pdfRect);
                            const vX1 = Math.min(vRect[0], vRect[2]);
                            const vX2 = Math.max(vRect[0], vRect[2]);
                            const vY = (Math.min(vRect[1], vRect[3]) + Math.max(vRect[1], vRect[3])) / 2;
                            hLines.push({ x1: vX1, x2: vX2, y: vY });
                        } else if (dx <= 3.0 && dy >= 10) {
                            // Vertical line
                            const y1 = Math.min(start.y, end.y), y2 = Math.max(start.y, end.y);
                            const x = (start.x + end.x) / 2;
                            // Convert PDF coordinates to viewport coordinates
                            const pdfRect = [x - 0.5, y1, x + 0.5, y2];
                            const vRect = viewport.convertToViewportRectangle(pdfRect);
                            const vY1 = Math.min(vRect[1], vRect[3]);
                            const vY2 = Math.max(vRect[1], vRect[3]);
                            const vX = (Math.min(vRect[0], vRect[2]) + Math.max(vRect[0], vRect[2])) / 2;
                            vLines.push({ x: vX, y1: vY1, y2: vY2 });
                        }
                        currentX = nextX; currentY = nextY; dIndex += 2;
                    } else if (op === this.OP_CODE.rectangle) dIndex += 4;
                    else if (op === 15) dIndex += 6;
                }
            }
        }
        
        // Find isolated horizontal lines (no other horizontal line on same Y position within 20 pixels horizontally)
        // AND no vertical line touching or nearby
        const Y_TOLERANCE = 2; // Lines must be on same Y position (within 2px)
        const MIN_X_DISTANCE = 20; // Minimum horizontal distance
        const VERTICAL_PROXIMITY = 5; // Maximum distance to vertical line to be considered "touching"
        
        const isolatedLines = hLines.filter(line => {
            // Check for nearby horizontal lines
            const hasNearbyHLine = hLines.some(otherLine => {
                if (line === otherLine) return false;
                
                const yDistance = Math.abs(line.y - otherLine.y);
                if (yDistance > Y_TOLERANCE) return false;
                
                const lineLeft = line.x1;
                const lineRight = line.x2;
                const otherLeft = otherLine.x1;
                const otherRight = otherLine.x2;
                
                const overlap = !(lineRight < otherLeft || lineLeft > otherRight);
                let minXDistance;
                if (overlap) {
                    minXDistance = 0;
                } else if (lineRight < otherLeft) {
                    minXDistance = otherLeft - lineRight;
                } else {
                    minXDistance = lineLeft - otherRight;
                }
                
                return overlap || minXDistance < MIN_X_DISTANCE;
            });
            
            if (hasNearbyHLine) return false;
            
            // Check for nearby vertical lines (touching or within proximity)
            const hasNearbyVLine = vLines.some(vLine => {
                // Check if vertical line is within the horizontal range of the horizontal line
                const vLineInRange = vLine.x >= line.x1 - VERTICAL_PROXIMITY && vLine.x <= line.x2 + VERTICAL_PROXIMITY;
                if (!vLineInRange) return false;
                
                // Check if vertical line touches or is near the horizontal line's Y position
                const yDistance = Math.abs(vLine.y1 - line.y);
                const yDistance2 = Math.abs(vLine.y2 - line.y);
                const minYDistance = Math.min(yDistance, yDistance2);
                
                // Check if vertical line crosses the horizontal line's Y position
                const crossesY = (vLine.y1 <= line.y && vLine.y2 >= line.y) || (vLine.y2 <= line.y && vLine.y1 >= line.y);
                
                return crossesY || minYDistance <= VERTICAL_PROXIMITY;
            });
            
            return !hasNearbyVLine;
        });
        
        isolatedLines.forEach(line => {
            // Create cloze field exactly above the line, same width as line
            const lineWidth = line.x2 - line.x1;
            const fontSize = 18;
            
            clozeFields.push({
                id: this.generateElementId('cloze'),
                type: 'text',
                style: {
                    position: 'absolute',
                    left: `${line.x1}px`,
                    top: `${line.y - fontSize - 2}px`,
                    width: `${lineWidth}px`,
                    height: `${fontSize}px`,
                    zIndex: 10
                }
            });
        });
        
        return clozeFields;
    }


    /**
     * Extract standalone capital letters (A-Z) and create deselect fields
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {Promise<Array>} Array of deselect field objects
     */
    async extractDeselectFields(page, viewport) {
        const textContent = await page.getTextContent();
        const deselectFields = [];
        
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
            let customAdjust = null;
            if (fontInfo) {
                customAdjust = this.findFontAdjustmentByName(fontInfo.baseFont) || 
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
            
            // Detect potential kerning/offset corrections by comparing measured vs actual width
            const measuredFullWidth = measureCtx.measureText(text).width || 0;
            const actualFullWidthRaw = typeof item.width === 'number' ? Math.abs(item.width) : measuredFullWidth;
            let widthScale = measuredFullWidth > 0 ? actualFullWidthRaw / measuredFullWidth : 1;
            if (!isFinite(widthScale) || widthScale <= 0.2 || widthScale >= 3) {
                widthScale = 1;
            }
            
            const usesExtremeSpacing = typeof item.charSpacing === 'number' && Math.abs(item.charSpacing) > fontSize * 0.2;
            const useScale = usesExtremeSpacing && Math.abs(widthScale - 1) > 0.15;
            
            // Find standalone capital letters (A-Z)
            // Pattern: letter not preceded by another letter
            // The next 2 positions after the letter must contain NO characters (only spaces or nothing)
            const capitalLetterRegex = /(?<![A-Za-z])([A-Z])/g;
            let capitalMatch;
            
            while ((capitalMatch = capitalLetterRegex.exec(text)) !== null) {
                const letter = capitalMatch[1]; // Use capture group 1 for the letter itself
                const startIndex = capitalMatch.index;
                
                // Check that the next 2 positions contain only spaces or nothing (end of string)
                // NO other characters are allowed in the next 2 positions
                const afterLetter = text.substring(startIndex + 1, startIndex + 3); // Next 2 characters
                const hasOnlySpacesOrEnd = afterLetter.length === 0 || /^\s{0,2}$/.test(afterLetter);
                
                // Also check that the character immediately after (if exists) is not a letter
                const nextChar = text[startIndex + 1];
                const isFollowedByLetter = nextChar && /[A-Za-z]/.test(nextChar);
                
                // Skip if there are any non-space characters in the next 2 positions
                if (!hasOnlySpacesOrEnd || isFollowedByLetter) {
                    continue;
                }
                
                // Calculate position similar to cloze fields
                const prefixText = text.substring(0, startIndex);
                let prefixWidth = this.measureTextWidthWithMetrics(prefixText, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                
                // Calculate width of the letter for positioning
                let letterWidth = this.measureTextWidthWithMetrics(letter, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);
                
                // Create extra large checkbox that covers the letter
                // Size: 1.7x the font size for better visibility
                const checkboxSize = fontSize * 1.1;
                const checkboxLeft = itemX + prefixWidth - (checkboxSize - letterWidth) / 2; // Center over letter
                const checkboxTop = itemY - fontSize - (checkboxSize - fontSize) / 2 + 2; // Center vertically, shifted 2px down
                
                // Add as deselect field (extra large checkbox)
                deselectFields.push({
                    id: this.generateElementId('deselect'),
                    type: 'deselect',
                    style: {
                        position: 'absolute',
                        left: `${checkboxLeft}px`,
                        top: `${checkboxTop}px`,
                        width: `${checkboxSize}px`,
                        height: `${checkboxSize}px`,
                        zIndex: 20
                    }
                });
            }
        });
        
        return deselectFields;
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
     * Check if a path is closed (first point ≈ last point)
     * @param {Array} points - Array of point objects with x and y coordinates
     * @returns {boolean} True if path is closed
     */
    isPathClosed(points) {
        if (points.length < 3) return false;
        const first = points[0];
        const last = points[points.length - 1];
        const distance = Math.hypot(last.x - first.x, last.y - first.y);
        return distance < 2.0; // Closed if first and last point are within 2 units
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
    addBoxFromPdfRect(pdfRect, viewport, boxFields, skipSmallCheck = false, typeHint = null, isTableCell = false) {
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
            isTableCell: isTableCell,
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
                    // For edge cells, allow lines that don't span full height but are close
                    const spansHeight = v.y1 <= cellTop + tol && v.y2 >= cellBottom - tol;
                    // Also allow lines that are very close to spanning (for edge cells)
                    const almostSpansHeight = (v.y1 <= cellTop + tol * 2 && v.y2 >= cellBottom - tol * 2) ||
                                            (v.y1 <= cellTop && v.y2 >= cellBottom - tol * 3);
                    // Vertical line must be within or near the horizontal range
                    const inRange = v.x >= leftBound - tol && v.x <= rightBound + tol;
                    return (spansHeight || almostSpansHeight) && inRange;
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
                        this.addBoxFromPdfRect(pdfRect, viewport, boxFields, false, 'textarea', true);
                        added++;
                    }
                }
            }
        }

        if (this.debugBoxExtraction) {
            console.log(`pdfparser @ buildRectanglesFromLines: ${horizontals.length} horizontal lines, ${verticals.length} vertical lines`);
            console.log(`pdfparser @ buildRectanglesFromLines: constructed ${added} rectangles, skipped ${skippedTooSmall} too small, ${skippedNoIntersection} no intersection`);
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
     * Filter out table-cell box fields that contain text (likely text lines, not real table cells)
     * Only applies to textarea fields (table-cells), not checkboxes or other field types
     * @param {Array} boxFields - Array of box field objects
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {Promise<Array>} Filtered array of box fields without text
     */
    async filterBoxesWithText(boxFields, page, viewport) {
        if (!boxFields || boxFields.length === 0) return boxFields;
        
        const textContent = await page.getTextContent();
        if (!textContent || !textContent.items || textContent.items.length === 0) {
            return boxFields; // No text to check
        }
        
        return boxFields.filter(box => {
            // Only filter table-cell fields, not checkboxes
            if (!box.isTableCell) {
                return true; // Keep non-table-cell fields (checkboxes, etc.)
            }
            
            const rect = this.getRectFromStyle(box.style);
            
            // Check if any text item is significantly inside this box (not just overlapping from outside)
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim()) continue;
                
                // Transform text position to viewport coordinates
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
                const itemX = tx[4];
                const itemY = tx[5];
                
                // Calculate text width - use actual width if available
                const textWidth = typeof item.width === 'number' ? Math.abs(item.width) : (fontSize * item.str.length * 0.6);
                const textLeft = itemX;
                const textRight = itemX + textWidth;
                const textTop = itemY - fontSize;
                const textBottom = itemY;
                const textCenterX = (textLeft + textRight) / 2;
                const textCenterY = (textTop + textBottom) / 2;
                
                // Check if text center is inside the box (more strict than overlap)
                // Also check if at least 50% of text width/height is inside
                const tolerance = 5; // px - reduced tolerance
                const centerInside = textCenterX >= rect.left - tolerance && textCenterX <= rect.right + tolerance &&
                                    textCenterY >= rect.top - tolerance && textCenterY <= rect.bottom + tolerance;
                
                // Calculate overlap area to ensure text is mostly inside
                const overlapLeft = Math.max(textLeft, rect.left);
                const overlapRight = Math.min(textRight, rect.right);
                const overlapTop = Math.max(textTop, rect.top);
                const overlapBottom = Math.min(textBottom, rect.bottom);
                const overlapWidth = Math.max(0, overlapRight - overlapLeft);
                const overlapHeight = Math.max(0, overlapBottom - overlapTop);
                const textArea = (textRight - textLeft) * (textBottom - textTop);
                const overlapArea = overlapWidth * overlapHeight;
                const overlapRatio = textArea > 0 ? overlapArea / textArea : 0;
                
                // Filter if text center is inside AND at least 30% of text overlaps with box
                if (centerInside && overlapRatio >= 0.3) {
                    return false; // Box contains text, filter it out
                }
            }
            return true; // Box doesn't contain text, keep it
        });
    }

    /**
     * Precise filter for box fields with exact text measurement and height check
     * Only applies to textarea fields (table-cells), not checkboxes or other field types and only checks if the box overlaps with text (not contains text)
     * @param {Array} boxFields - Array of box field objects (already filtered by filterBoxesWithText)
     * @param {Object} page - PDF.js page object
     * @param {Object} viewport - PDF.js viewport object
     * @returns {Promise<Array>} Filtered array of box fields
     */
    async filterBoxesWithTextPrecise(boxFields, page, viewport) {
        if (!boxFields || boxFields.length === 0) return boxFields;
        
        const textContent = await page.getTextContent();
        if (!textContent || !textContent.items || textContent.items.length === 0) {
            return boxFields;
        }
        
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        
        return boxFields.filter(box => {
            // Filtere keine Checkboxen/Deselect-Felder, da sie explizit sind
            if (box.type === 'checkbox' || box.type === 'deselect') {
                return true;
            }

            const rect = this.getRectFromStyle(box.style);
            const overlapTol = 3;
            
            // Iteriere über alle Text-Items auf der Seite
            for (const item of textContent.items) {
                if (!item.str || !item.str.trim()) continue;
                
                // Font-Informationen sammeln (wie in extractClozeFields)
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
                const fontName = item.fontName;
                const fontInfo = this.getFontInfo(page, fontName);
                
                let customAdjust = null;
                let effectiveFontFamily = 'sans-serif';
                let fontScale = 1;
                
                if (fontInfo) {
                    customAdjust = this.findFontAdjustmentByName(fontInfo.baseFont) ||
                                   this.findFontAdjustmentByName(fontInfo.fontName);
                    if (customAdjust) {
                        effectiveFontFamily = customAdjust.family || effectiveFontFamily;
                        fontScale = customAdjust.scale || fontScale;
                    }
                }

                measureCtx.font = `${fontSize}px ${effectiveFontFamily}`;
                
                // Breite/Skalierung aus item.width und Canvas-Messung ableiten
                const measuredFullWidth = measureCtx.measureText(item.str).width || 0;
                const actualFullWidthRaw = typeof item.width === 'number' ? Math.abs(item.width) : measuredFullWidth;
                let widthScale = measuredFullWidth > 0 ? actualFullWidthRaw / measuredFullWidth : 1;
                if (!isFinite(widthScale) || widthScale <= 0.2 || widthScale >= 3) {
                    widthScale = 1;
                }
                const usesExtremeSpacing = typeof item.charSpacing === 'number' && Math.abs(item.charSpacing) > fontSize * 0.2;
                const useScale = usesExtremeSpacing && Math.abs(widthScale - 1) > 0.15;

                // Genaue Breite des Text-Items mit PDF-Metriken messen
                let textWidth = this.measureTextWidthWithMetrics(item.str, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust);

                // Bounding Box des Textes in Viewport-Koordinaten berechnen
                const itemX = tx[4];
                const itemY = tx[5];
                
                const textLeft = itemX;
                const textRight = itemX + textWidth;
                const textTop = itemY - fontSize;
                const textBottom = itemY + 2;

                // Überlappungsprüfung
                const horizontalOverlap = (rect.right > textLeft - overlapTol && rect.left < textRight + overlapTol);
                const verticalOverlap = (rect.bottom > textTop - overlapTol && rect.top < textBottom + overlapTol);
                
                if (horizontalOverlap && verticalOverlap) {
                    // Schütze Table Cells - wenn es ein Table Cell oder ein großes Textfeld ist (Typ 'textarea'), behalte es
                    if (box.type === 'textarea') {
                        return true; // Behalte die Tabelle/Textarea und überspringe das Filtern
                    }
                    
                    // Wenn es ein einfaches Text-Rechteck ist UND es eng mit dem Text überlappt
                    if (box.type === 'text') {
                        // Checke, ob die Box nur unwesentlich höher ist als der Text
                        if (rect.height < fontSize * 1.5) {
                            return false; // Filter: Dies ist ein Text-Hintergrund-Rechteck
                        }
                    }
                }
            }
            
            // Die Box hat entweder keinen Text überlappt oder wurde als schützenswerte TextArea identifiziert
            return true;
        });
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
                        // Start a new subpath - process previous path only if it was closed
                        if (pathPoints.length > 2 && this.isPathClosed(pathPoints)) {
                            this.processPathPoints(pathPoints, ctm, viewport, boxFields);
                        }
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
                // Process final path only if it was closed
                if (pathPoints.length > 2 && this.isPathClosed(pathPoints)) {
                    this.processPathPoints(pathPoints, ctm, viewport, boxFields);
                }

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
            this.detectFormFields ? this.extractFormFields(page, viewport, pageNum) : Promise.resolve([]),
            this.extractClozeFields(page, viewport),
            this.detectBoxFields ? this.extractBoxFields(page, viewport) : Promise.resolve([])
        ]);
        if (this.debugBoxExtraction) {
            console.log(`processPage: rawBoxFields=${rawBoxFields.length}`);
            const tableCells = rawBoxFields.filter(b => b.isTableCell);
            console.log(`processPage: table-cells in rawBoxFields=${tableCells.length}`);
        }
        
        let boxFields = this.enableFilterAndMerge ? this.filterAndMergeBoxes(rawBoxFields) : rawBoxFields;
        
        if (this.debugBoxExtraction) {
            const tableCellsAfterFilter = boxFields.filter(b => b.isTableCell);
            console.log(`processPage: table-cells after filterAndMergeBoxes=${tableCellsAfterFilter.length}`);
        }
        


        // Filter out box fields that contain text (likely text lines, not table cells)
        let boxFieldsWithoutText = this.enableFilterBoxesWithText ? await this.filterBoxesWithText(boxFields, page, viewport) : boxFields;
        
        // Apply precise filter with exact text measurement and height check
        const boxFieldsPreciseFilter = this.enableFilterBoxesWithTextPrecise ? await this.filterBoxesWithTextPrecise(boxFieldsWithoutText, page, viewport) : boxFieldsWithoutText;
        




        // Filter clozeFields and boxFields together to ensure deselect boxes win over textareas
        // Combine all fields and filter to remove larger fields that contain smaller ones
        const allFields = [...clozeFields, ...boxFieldsPreciseFilter];
        const filteredAllFields = this.enableFilterAndMerge ? this.filterAndMergeBoxes(allFields) : allFields;
        
        // Separate back into clozeFields and boxFields
        const filteredClozeFields = filteredAllFields.filter(field => 
            clozeFields.some(cf => cf.id === field.id)
        );
        const filteredBoxFields = filteredAllFields.filter(field => 
            boxFieldsPreciseFilter.some(bf => bf.id === field.id)
        );
        
        // Check total number of all fields (formFields, clozeFields, boxFields)
        const totalFields = formFields.length + filteredClozeFields.length + filteredBoxFields.length;
        const warnings = [];
        const hasWarning = totalFields < this.SCAN_MIN_BOXES;
        if (hasWarning) {
            const warningMsg = `pdfparser @ processPage: only ${totalFields} fields found (${formFields.length} form fields, ${filteredClozeFields.length} cloze fields, ${filteredBoxFields.length} box fields) - possible scanned PDF without detectable forms`;
           // console.warn(warningMsg);
            warnings.push(warningMsg);
        }
        
        return {
            width: viewport.width,
            height: viewport.height,
            imgSrc: imgSrc,
            formFields: formFields,
            clozeFields: filteredClozeFields,
            boxFields: filteredBoxFields,
            warnings,
            hasWarning: hasWarning, // Only trigger warning dialog for "less than 2 fields total" warning
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

    /**
     * Map Unicode character code to PDF Character Code using WinAnsiEncoding + Differences
     * @param {number} unicodeCharCode - Unicode character code (e.g. from charCodeAt)
     * @param {Object} encoding - Encoding object with baseEncoding and differences
     * @returns {number} PDF Character Code
     */
    mapUnicodeToPdfCharCode(unicodeCharCode, encoding) {
        if (!encoding || encoding.baseEncoding !== 'WinAnsiEncoding') {
            return unicodeCharCode;
        }

        // Special mappings for WinAnsiEncoding
        if (unicodeCharCode === 32) {
            // Space - standard WinAnsiEncoding code 32
            return 32;
        } else if (unicodeCharCode === 8230) {
            // Ellipsis (…) - standard WinAnsiEncoding code 133
            return 133;
        }

        // Check if character is in Differences array (codes 26-31 for Leicht, 27-31 for Krftg)
        if (encoding.differences) {
            // Differences override standard mapping for specific codes
            // For codes in Differences, the PDF code maps directly to the array index
            // For other codes, use standard WinAnsiEncoding mapping
            const diffCodes = Object.keys(encoding.differences).map(Number);
            if (diffCodes.includes(unicodeCharCode)) {
                // This code is in Differences - return as-is (it's already the PDF code)
                return unicodeCharCode;
            }
        }

        // Standard WinAnsiEncoding: ASCII 32-126 maps 1:1, extended ASCII 128-255 also maps
        if (unicodeCharCode >= 32 && unicodeCharCode <= 255) {
            return unicodeCharCode;
        }

        // Fallback: return as-is
        return unicodeCharCode;
    }

    /**
     * Measure text width using glyph widths from fontAdjustments if available, otherwise use canvas measurement
     * @param {string} text - Text to measure
     * @param {CanvasRenderingContext2D} measureCtx - Canvas context
     * @param {number} fontSize - Font size in pixels
     * @param {boolean} useScale - Whether to use width scale
     * @param {number} widthScale - Width scale factor
     * @param {number} fontScale - Font scale factor
     * @param {Object|null} customAdjust - Font adjustment object from fontAdjustments
     * @returns {number} Text width in pixels
     */
    measureTextWidthWithMetrics(text, measureCtx, fontSize, useScale, widthScale, fontScale, customAdjust) {
        // Use glyph widths from fontAdjustments if available
        let glyphWidths = null;
        if (customAdjust && customAdjust.glyphWidths) {
            glyphWidths = customAdjust.glyphWidths;
        }
        
        // If glyph widths are available, use them for precise calculation
        if (glyphWidths && glyphWidths.widths && Array.isArray(glyphWidths.widths)) {
            const encoding = customAdjust?.encoding;
            
            // Calculate total glyph width in font units
            let totalGlyphWidth = 0;
            
            for (let i = 0; i < text.length; i++) {
                const unicodeCharCode = text.charCodeAt(i);
                // Map Unicode to PDF Character Code using WinAnsiEncoding + Differences
                const pdfCharCode = this.mapUnicodeToPdfCharCode(unicodeCharCode, encoding);
                const glyphIndex = pdfCharCode - glyphWidths.firstChar;
                
                if (glyphIndex >= 0 && glyphIndex < glyphWidths.widths.length) {
                    const glyphWidth = glyphWidths.widths[glyphIndex];
                    if (glyphWidth > 0) {
                        totalGlyphWidth += glyphWidth;
                    } else {
                        // Zero width glyph - fallback to canvas measurement
                        totalGlyphWidth += (measureCtx.measureText(text[i]).width / fontSize) * 1000;
                    }
                } else {
                    // Character outside range - fallback to canvas measurement
                    totalGlyphWidth += (measureCtx.measureText(text[i]).width / fontSize) * 1000;
                }
            }
            
            // Convert from font units to pixels
            // PDF Type1 fonts use 1000 font units = 1em
            const fontUnitsPerEm = 1000;
            let totalWidth = (totalGlyphWidth / fontUnitsPerEm) * fontSize;
            
            // Apply kerning compensation to correct for missing negative kerning in advance widths
            // This compensates the excess width caused by summing advance widths without kerning table
            if (customAdjust && typeof customAdjust.kerningCompensationEm === 'number') {
                // Compensation in pixels = kerningCompensationEm * number of characters * fontSize
                totalWidth += customAdjust.kerningCompensationEm * text.length * fontSize;
            }
            
            // Apply existing scale factors
            if (useScale) {
                totalWidth *= widthScale;
            }
            totalWidth *= fontScale;
            
            return totalWidth;
        }
        
        // Fallback to standard canvas measurement
        let width = measureCtx.measureText(text).width;
        
        // Apply existing scale factors
        if (useScale) {
            width *= widthScale;
        }
        width *= fontScale;
        
        return width;
    }
}

/**
 * Parse PDF data and extract interactive elements
 * @param {Uint8Array|ArrayBuffer} pdfData - Raw PDF file data
 * @param {Object} options - Optional configuration object to enable/disable features
 * @param {boolean} options.detectCheckboxes - Enable/disable Unicode checkbox detection (default: true)
 * @param {boolean} options.detectUnderscores - Enable/disable underscore gap detection (default: true)
 * @param {boolean} options.detectDots - Enable/disable dot gap detection (default: true)
 * @param {boolean} options.detectDeselectFields - Enable/disable deselect field detection (default: true)
 * @param {boolean} options.detectIsolatedLines - Enable/disable isolated line detection (default: true)
 * @param {boolean} options.detectFormFields - Enable/disable PDF form field detection (default: true)
 * @param {boolean} options.detectBoxFields - Enable/disable drawn rectangle/table detection (default: true)
 * @returns {Promise<Array>} Array of page objects with form fields, cloze fields, and box fields
 */
export async function parsePdfToPages(pdfData, options = {}) {
    const parser = new PdfParser(options);
    return await parser.parse(pdfData);
}
