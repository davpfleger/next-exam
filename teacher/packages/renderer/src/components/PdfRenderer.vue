<template>
    <div class="pdf-overlay-root" id="pdfrenderer" @click.stop>
        <ul class="nav nav-tabs position-sticky top-0 start-0 end-0 w-100 bg-white" style="z-index:2000; pointer-events:auto; font-size:1.1rem; height:45px; display: flex; align-items: center; flex-shrink: 0;">
            <li class="nav-item " style="margin-left: 10px;">
                <button 
                    type="button" 
                    class=" btn btn-sm" 
                    :class="editMode ? 'btn-warning' : 'btn-success'"
                    @click.stop="toggleEditMode"
                    style=" "
                >
                    {{ editMode ? 'Speichern' : 'Bearbeiten' }}
                </button>
                <button 
                    type="button" 
                    class=" btn btn-sm btn-success" 
                    :disabled="localCustomFields.length === 0"
                    @click.stop="undoLastField"
                    style="  margin-left: 5px;"
                    title="Rückgängig"
                >
                    ↶
                </button>
            </li>
            <li class="nav-item position-absolute" style="right: 40px;">
                <div class="btn btn-sm btn-warning small text-muted" disabled style="width: 800px; text-align: center; cursor: default; pointer-events: none;">
                    {{ $t('pdf.activesheets') }}
                </div>
            </li>
            
            
            <li class="nav-item position-absolute" style="right: 0;">  
                <div type="button" id="closePDF" class="nav-link btn btn-light btn-sm" :title="$t('dashboard.close')" @click.stop="closePane" style="width:40px; height:45px !important;text-align:center; font-weight:bold;">&times;</div> 
            </li>
        </ul>
        <div v-if="effectiveLoading" class="overlay">
            <div class="spinner"></div>
            <p>Loading PDF...</p>
        </div>
        <div v-else-if="parsedPages.length > 0" class="pdf-scroll-container" :class="{ 'edit-mode': editMode }">
            <div
                v-for="(page, pageIndex) in parsedPages"
                :key="pageIndex"
                class="pdf-page-wrapper"
                :style="{ width: page.width + 'px', height: page.height + 'px' }"
                @mousedown="editMode ? startDrawing($event, pageIndex) : null"
                @mousemove="editMode && isDrawing ? updateDrawing($event, pageIndex) : null"
                @mouseup="editMode && isDrawing ? finishDrawing($event, pageIndex) : null"
                @mouseleave="editMode && isDrawing ? cancelDrawing() : null"
            >
                <img :src="page.imgSrc" class="pdf-bg-image" />

                <div
                    v-if="page.warnings && page.warnings.length"
                    class="pdf-warning"
                >
                    <p v-for="(warning, wIndex) in page.warnings" :key="wIndex">
                        {{ warning }}
                    </p>
                </div>

                <div
                    v-for="field in page.formFields"
                    :key="field.id"
                    class="input-overlay"
                    :id="field.id + '_wrapper'"
                    :style="field.style"
                >
                    <input
                        v-if="field.type === 'checkbox'"
                        type="checkbox"
                        :checked="field.checked"
                        :name="field.name"
                        :id="field.id"
                        class="interactive-input checkbox"
                    />
                    <textarea
                        v-else-if="field.type === 'textarea'"
                        :name="field.name"
                        :id="field.id"
                        class="interactive-input textarea"
                    >
                        {{ field.value }}
                    </textarea>
                    <input
                        v-else
                        type="text"
                        :value="field.value"
                        :name="field.name"
                        :id="field.id"
                        class="interactive-input text"
                    />
                </div>

                <div
                    v-for="cloze in page.clozeFields"
                    :key="cloze.id"
                    :class="['input-overlay', cloze.type === 'checkbox' || cloze.type === 'deselect' ? 'checkbox-overlay' : '']"
                    :id="cloze.id + '_wrapper'"
                    :style="cloze.style"
                >
                    <input
                        v-if="cloze.type === 'checkbox'"
                        type="checkbox"
                        :checked="cloze.checked || false"
                        :name="cloze.id"
                        :id="cloze.id"
                        class="interactive-input checkbox"
                    />
                    <input
                        v-else-if="cloze.type === 'deselect'"
                        type="checkbox"
                        :checked="cloze.checked || false"
                        :name="cloze.id"
                        :id="cloze.id"
                        class="interactive-input checkbox deselect-checkbox"
                    />
                    <input
                        v-else
                        type="text"
                        class="interactive-input cloze"
                        :name="cloze.id"
                        :id="cloze.id"
                    />
                </div>

                <div
                    v-for="box in page.boxFields"
                    :key="box.id"
                    :class="['input-overlay', box.type === 'checkbox' ? 'checkbox-overlay' : '']"
                    :id="box.id + '_wrapper'"
                    :style="box.style"
                >
                    <input
                        v-if="box.type === 'checkbox'"
                        type="checkbox"
                        :name="box.id"
                        :id="box.id"
                        class="interactive-input checkbox"
                    />
                    <textarea
                        v-else-if="box.type === 'textarea' || box.isTextarea"
                        class="interactive-input textarea"
                        :name="box.id"
                        :id="box.id"
                    ></textarea>
                    <input
                        v-else
                        type="text"
                        class="interactive-input table-cell"
                        :name="box.id"
                        :id="box.id"
                    />
                </div>

                <div
                    v-for="customField in getCustomFieldsForPage(pageIndex)"
                    :key="customField.id"
                    class="input-overlay"
                    :id="customField.id + '_wrapper'"
                    :style="customField.style"
                >
                    <textarea
                        class="interactive-input textarea"
                        :name="customField.id"
                        :id="customField.id"
                    ></textarea>
                </div>

                <div
                    v-if="currentRect && currentRect.pageIndex === pageIndex"
                    class="drawing-rectangle"
                    :style="currentRect.style"
                ></div>
            </div>
        </div>
        <div v-else class="pdf-empty-state">
            <p>Keine PDF Seiten vorhanden.</p>
        </div>
    </div>
</template>

<script>
import { parsePdfToPages } from '../utils/pdfparser.js';
import Swal from 'sweetalert2';

export default {
    name: 'PdfOverlay',
    props: {
        pdfBase64: {
            type: String,
            default: null
        },
        loading: {
            type: Boolean,
            default: false
        },
        customFields: {
            type: Array,
            default: () => []
        }
    },
    data() {
        return {
            parsedPages: [],
            isParsing: false,
            warningShown: false,
            editMode: false,
            localCustomFields: [],
            customFieldCounter: 0,
            isDrawing: false,
            drawStart: null,
            currentRect: null
        };
    },
    computed: {
        effectiveLoading() {
            return this.loading || this.isParsing;
        }
    },
    watch: {
        pdfBase64: {
            immediate: true,
            handler(newData) {
                this.processPdf(newData);
            }
        },
        customFields: {
            immediate: true,
            handler(newFields) {
                if (newFields && Array.isArray(newFields)) {
                    this.localCustomFields = JSON.parse(JSON.stringify(newFields));
                    if (newFields.length > 0) {
                        const maxId = Math.max(...newFields.map(f => {
                            const match = f.id?.match(/Custom(\d+)/);
                            return match ? parseInt(match[1]) : 0;
                        }));
                        this.customFieldCounter = maxId;
                    }
                } else {
                    this.localCustomFields = [];
                    this.customFieldCounter = 0;
                }
            }
        },
        parsedPages: {
            handler(newPages) {
                if (newPages && newPages.length > 0 && !this.warningShown) {
                    const pagesWithWarning = newPages.filter(page => page.hasWarning);
                    if (pagesWithWarning.length > 0) {
                        this.showWarningDialog(pagesWithWarning);
                    }
                }
            },
            immediate: false
        }
    },
    methods: {
        async processPdf(base64Data) {
            if (!base64Data) {
                this.parsedPages = [];
                this.warningShown = false;
                return;
            }
            this.isParsing = true;
            this.warningShown = false; // Reset warning flag for new PDF
            try {
                const uint8 = this.base64ToUint8Array(base64Data);
                this.parsedPages = await parsePdfToPages(uint8);
            } catch (error) {
                console.error('PdfOverlay: Failed to parse PDF data', error);
                this.parsedPages = [];
            } finally {
                this.isParsing = false;
            }
        },
        base64ToUint8Array(data) {
            const commaIndex = data.indexOf(',');
            const pureBase64 = commaIndex >= 0 ? data.slice(commaIndex + 1) : data;
            const binaryString = atob(pureBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        },
        showWarningDialog(pagesWithWarning) {
            this.warningShown = true;
            // Find page numbers by checking which pages in parsedPages have warnings
            const pageNumbers = [];
            this.parsedPages.forEach((page, index) => {
                if (page.hasWarning) {
                    pageNumbers.push(index + 1);
                }
            });
            
            const pageLabel = pageNumbers.length === 1 ? this.$t('pdf.page') : this.$t('pdf.pages');
            const pageText = pageNumbers.length === 1 
                ? `${pageLabel} ${pageNumbers[0]}` 
                : `${pageLabel} ${pageNumbers.join(', ')}`;
            
            Swal.fire({
                icon: 'warning',
                title: this.$t('pdf.warningTitle'),
                html: `${this.$t('pdf.warningPrefix')} ${pageText} ${this.$t('pdf.warningMessage')}<br><br>${this.$t('pdf.warningMessage2')}`,
                confirmButtonText: this.$t('pdf.understood'),
               
                allowEscapeKey: true
            }).then(() => {
                this.warningShown = false;
            });
        },
        closePane() {
            this.$emit('close');
        },
        toggleEditMode() {
            if (this.editMode) {
                // Save mode: emit customFields before turning off edit mode
                this.$emit('save-custom-fields', JSON.parse(JSON.stringify(this.localCustomFields)));
            }
            this.editMode = !this.editMode;
            if (!this.editMode) {
                this.cancelDrawing();
            }
        },
        startDrawing(event, pageIndex) {
            event.preventDefault();
            event.stopPropagation();
            const pageWrapper = event.currentTarget;
            const rect = pageWrapper.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            this.isDrawing = true;
            this.drawStart = { x, y, pageIndex };
            this.currentRect = {
                pageIndex,
                style: {
                    position: 'absolute',
                    left: x + 'px',
                    top: y + 'px',
                    width: '0px',
                    height: '0px',
                    border: '2px dashed #0d6efd',
                    pointerEvents: 'none',
                    zIndex: 1000
                }
            };
        },
        updateDrawing(event, pageIndex) {
            if (!this.isDrawing || !this.drawStart || this.drawStart.pageIndex !== pageIndex) return;
            event.preventDefault();
            event.stopPropagation();
            const pageWrapper = event.currentTarget;
            const rect = pageWrapper.getBoundingClientRect();
            const currentX = event.clientX - rect.left;
            const currentY = event.clientY - rect.top;
            const startX = this.drawStart.x;
            const startY = this.drawStart.y;
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            this.currentRect = {
                pageIndex,
                style: {
                    position: 'absolute',
                    left: left + 'px',
                    top: top + 'px',
                    width: width + 'px',
                    height: height + 'px',
                    border: '2px dashed #0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    pointerEvents: 'none',
                    zIndex: 1000
                }
            };
        },
        finishDrawing(event, pageIndex) {
            if (!this.isDrawing || !this.drawStart || this.drawStart.pageIndex !== pageIndex) return;
            event.preventDefault();
            event.stopPropagation();
            const pageWrapper = event.currentTarget;
            const rect = pageWrapper.getBoundingClientRect();
            const currentX = event.clientX - rect.left;
            const currentY = event.clientY - rect.top;
            const startX = this.drawStart.x;
            const startY = this.drawStart.y;
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            if (width > 10 && height > 10) {
                this.customFieldCounter++;
                const customField = {
                    id: `Custom${this.customFieldCounter}`,
                    type: 'textarea',
                    pageIndex: pageIndex,
                    style: {
                        position: 'absolute',
                        left: left + 'px',
                        top: top + 'px',
                        width: width + 'px',
                        height: height + 'px'
                    }
                };
                this.localCustomFields.push(customField);
            }
            this.cancelDrawing();
        },
        cancelDrawing() {
            this.isDrawing = false;
            this.drawStart = null;
            this.currentRect = null;
        },
        undoLastField() {
            if (this.localCustomFields.length > 0) {
                this.localCustomFields.pop();
                // Activate edit mode to allow saving the change
                if (!this.editMode) {
                    this.editMode = true;
                }
            }
        },
        getCustomFieldsForPage(pageIndex) {
            return this.localCustomFields.filter(field => field.pageIndex === pageIndex);
        }
    }
};
</script>

<style>
/* Fonts made from <a href="http://www.webfontfree.com">Web Font Free</a> is licensed by CC BY 4.0 */
@font-face {
    font-family: 'hv';
    src: url('/src/assets/fonts/HelveticaNeueLTPro-Lt.woff2') format('woff2');
    font-weight: 300;
    font-style: normal;
    font-display: swap;
}



</style>

<style scoped>
.pdf-overlay-root {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 1200px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 6px;
    box-shadow: 0 0 15px rgba(22, 9, 9, 0.5);
    overflow: hidden;
}

.overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 0;
    gap: 12px;
    flex: 1;
    overflow-y: auto;
}

.spinner {
    width: 36px;
    height: 36px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top-color: #0d6efd;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.pdf-scroll-container {
    background-color: #eee;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    position: relative;
}

.pdf-scroll-container.edit-mode {
    cursor: crosshair;
}

.pdf-page-wrapper {
    position: relative;
    background: white;
    margin-bottom: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}

.pdf-page-wrapper.edit-mode-active {
    cursor: crosshair;
}

.drawing-rectangle {
    position: absolute;
    pointer-events: none;
    z-index: 1000;
}

.pdf-bg-image {
    display: block;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.pdf-warning {
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    background: rgba(255, 193, 7, 0.9);
    color: #000;
    padding: 6px 10px;
    font-size: 0.85rem;
    border-radius: 4px;
    z-index: 20;
}

.pdf-warning p {
    margin: 0;
}

.pdf-empty-state {
    text-align: center;
    padding: 40px 0;
    color: #666;
}

.input-overlay {
    position: absolute;
    pointer-events: auto;
}

.checkbox-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
}

.interactive-input {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    margin: 0;
    background-color: rgba(255, 230, 0, 0.15);
    border: 1px solid transparent;
}

.interactive-input:focus {
    background-color: rgba(255, 255, 255, 0.9);
    border: 2px solid #0d6efd;
    outline: none;
    box-shadow: 0 0 5px rgba(13, 110, 253, 0.5);
}

.interactive-input.checkbox {
    cursor: pointer;
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 255, 0, 0.05);
    appearance: none;
}

.interactive-input.checkbox:checked {
    background-color: rgba(13, 110, 253, 0.85);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%23fff' d='M6.4 11.2 3.5 8.3l1.4-1.4 1.5 1.5 4.3-4.3 1.4 1.4z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 70% 70%;
}

.interactive-input.checkbox.deselect-checkbox {
  
    background-color: rgba(0, 255, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0;
   
}

.interactive-input.checkbox.deselect-checkbox:checked {
   
    background-color: rgba(0, 255, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.2);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='100' x2='100' y2='0' stroke='%23000' stroke-width='8'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 100% 100%;
}

.interactive-input.cloze {
    border-bottom: 0;
    background-color: rgba(0, 255, 0, 0.1);
    font-size: 14px;
}

.interactive-input.cloze:focus {
    background: #fff;
}

.interactive-input.table-cell {
    background-color: rgba(0, 255, 0, 0.1);
    border: none;
    padding: 5px;
}

.interactive-input.table-cell:focus {
    background-color: rgba(255, 255, 255, 0.9);
    border: 2px solid #0d6efd;
}

.interactive-input.textarea {
    resize: none;
    background-color: rgba(0, 255, 0, 0.1);
   
    border: none;
    font-family: inherit;
    font-size: inherit;
    padding: 5px;
}

.interactive-input.textarea:focus {
    background-color: rgba(255, 255, 255, 0.95);
    border: 2px solid #0d6efd;
    outline: none;
}
</style>

