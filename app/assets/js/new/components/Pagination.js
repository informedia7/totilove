/**
 * Pagination Component
 * 
 * Pagination component extending BaseComponent
 * Provides pagination controls and page navigation
 * 
 * Migration Phase 2: Week 8
 */

import { BaseComponent } from './BaseComponent.js';
import { debounce } from '../core/utils.js';

export class Pagination extends BaseComponent {
    /**
     * @param {Object} config - Pagination configuration
     * @param {HTMLElement|string} config.container - Container element
     * @param {number} config.currentPage - Current page number (1-based)
     * @param {number} config.totalPages - Total number of pages
     * @param {number} config.totalItems - Total number of items
     * @param {number} config.itemsPerPage - Items per page
     * @param {number} config.maxVisible - Maximum visible page buttons
     * @param {Function} config.onPageChange - Callback when page changes
     * @param {Function} config.onItemsPerPageChange - Callback when items per page changes
     */
    constructor(config = {}) {
        super({
            container: typeof config.container === 'string'
                ? document.getElementById(config.container) || document.querySelector(config.container)
                : config.container || document.body,
            autoInit: false
        });
        
        this.currentPage = config.currentPage || 1;
        this.totalPages = config.totalPages || 1;
        this.totalItems = config.totalItems || 0;
        this.itemsPerPage = config.itemsPerPage || 20;
        this.maxVisible = config.maxVisible || 7;
        this.onPageChange = config.onPageChange;
        this.onItemsPerPageChange = config.onItemsPerPageChange;
        
        this.init();
    }
    
    async onInit() {
        this.render();
    }
    
    /**
     * Update pagination data
     * @param {Object} data - Pagination data
     */
    update(data) {
        if (data.currentPage !== undefined) this.currentPage = data.currentPage;
        if (data.totalPages !== undefined) this.totalPages = data.totalPages;
        if (data.totalItems !== undefined) this.totalItems = data.totalItems;
        if (data.itemsPerPage !== undefined) this.itemsPerPage = data.itemsPerPage;
        
        this.render();
    }
    
    /**
     * Go to specific page
     * @param {number} page - Page number (1-based)
     */
    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) {
            return;
        }
        
        this.currentPage = page;
        this.render();
        
        if (this.onPageChange) {
            this.onPageChange(page);
        }
        
        this.emit('pagination:change', { page, totalPages: this.totalPages });
    }
    
    /**
     * Go to next page
     */
    nextPage() {
        this.goToPage(this.currentPage + 1);
    }
    
    /**
     * Go to previous page
     */
    previousPage() {
        this.goToPage(this.currentPage - 1);
    }
    
    /**
     * Go to first page
     */
    firstPage() {
        this.goToPage(1);
    }
    
    /**
     * Go to last page
     */
    lastPage() {
        this.goToPage(this.totalPages);
    }
    
    /**
     * Calculate visible page range
     * @returns {Object} Start and end page numbers
     */
    getVisibleRange() {
        const half = Math.floor(this.maxVisible / 2);
        let start = Math.max(1, this.currentPage - half);
        let end = Math.min(this.totalPages, start + this.maxVisible - 1);
        
        // Adjust start if we're near the end
        if (end - start < this.maxVisible - 1) {
            start = Math.max(1, end - this.maxVisible + 1);
        }
        
        return { start, end };
    }
    
    /**
     * Render pagination controls
     */
    render() {
        if (!this.container) return;
        
        const { start, end } = this.getVisibleRange();
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
        
        let html = '<nav class="pagination" aria-label="Page navigation">';
        
        // Info text
        if (this.totalItems > 0) {
            html += `<div class="pagination-info">Showing ${startItem}-${endItem} of ${this.totalItems}</div>`;
        }
        
        html += '<div class="pagination-controls">';
        
        // First page button
        html += `<button class="page-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="first" aria-label="First page">««</button>`;
        
        // Previous button
        html += `<button class="page-btn" ${this.currentPage === 1 ? 'disabled' : ''} data-page="prev" aria-label="Previous page">‹</button>`;
        
        // Page numbers
        if (start > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (start > 2) {
                html += `<span class="page-dots">...</span>`;
            }
        }
        
        for (let i = start; i <= end; i++) {
            const isActive = i === this.currentPage;
            html += `<button class="page-btn ${isActive ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }
        
        if (end < this.totalPages) {
            if (end < this.totalPages - 1) {
                html += `<span class="page-dots">...</span>`;
            }
            html += `<button class="page-btn" data-page="${this.totalPages}">${this.totalPages}</button>`;
        }
        
        // Next button
        html += `<button class="page-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="next" aria-label="Next page">›</button>`;
        
        // Last page button
        html += `<button class="page-btn" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="last" aria-label="Last page">»»</button>`;
        
        html += '</div>';
        
        // Items per page selector (optional)
        if (this.onItemsPerPageChange) {
            html += '<div class="pagination-items-per-page">';
            html += '<label>Items per page: ';
            html += `<select class="items-per-page-select">`;
            [10, 20, 50, 100].forEach(num => {
                html += `<option value="${num}" ${this.itemsPerPage === num ? 'selected' : ''}>${num}</option>`;
            });
            html += '</select>';
            html += '</label></div>';
        }
        
        html += '</nav>';
        
        this.container.innerHTML = html;
        
        // Set up event listeners
        this.setupEvents();
    }
    
    setupEvents() {
        // Page button clicks
        const buttons = this.container.querySelectorAll('.page-btn:not([disabled])');
        buttons.forEach(btn => {
            this.on(btn, 'click', () => {
                const page = btn.dataset.page;
                if (page === 'first') {
                    this.firstPage();
                } else if (page === 'prev') {
                    this.previousPage();
                } else if (page === 'next') {
                    this.nextPage();
                } else if (page === 'last') {
                    this.lastPage();
                } else {
                    this.goToPage(parseInt(page));
                }
            });
        });
        
        // Items per page change
        if (this.onItemsPerPageChange) {
            const select = this.container.querySelector('.items-per-page-select');
            if (select) {
                this.on(select, 'change', (e) => {
                    const newItemsPerPage = parseInt(e.target.value);
                    this.itemsPerPage = newItemsPerPage;
                    const newTotalPages = Math.ceil(this.totalItems / newItemsPerPage);
                    this.totalPages = newTotalPages;
                    
                    // Reset to first page if current page is out of range
                    if (this.currentPage > newTotalPages) {
                        this.currentPage = newTotalPages || 1;
                    }
                    
                    this.render();
                    
                    if (this.onItemsPerPageChange) {
                        this.onItemsPerPageChange(newItemsPerPage);
                    }
                    
                    this.emit('pagination:itemsperpagechange', { itemsPerPage: newItemsPerPage });
                });
            }
        }
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.Pagination = Pagination;
}












































