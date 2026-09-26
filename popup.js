/**
 * Table Scraper - Popup Script
 * Coordinates between popup UI and the active tab content script.
 * Features full 2D grid table detection, multi-table batch selection,
 * and an interactive Export Studio for column/row selection before downloading.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Main View
  const stateLoading = document.getElementById('state-loading');
  const stateEmpty = document.getElementById('state-empty');
  const stateRestricted = document.getElementById('state-restricted');
  const tablesList = document.getElementById('tables-list');
  const tableCountSubtitle = document.getElementById('table-count-subtitle');
  const searchContainer = document.getElementById('search-container');
  const searchInput = document.getElementById('search-input');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnEmptyRetry = document.getElementById('btn-empty-retry');
  const footerPageTitle = document.getElementById('footer-page-title');
  const toast = document.getElementById('toast');

  // DOM Elements - Multi-Table Batch Selection Bar
  const selectionBar = document.getElementById('selection-bar');
  const selectAllTablesCheckbox = document.getElementById('select-all-tables');
  const selectedTablesLabel = document.getElementById('selected-tables-label');
  const btnExportSelectedCsv = document.getElementById('btn-export-selected-csv');
  const btnExportSelectedJson = document.getElementById('btn-export-selected-json');

  // DOM Elements - Export & Selection Modal
  const exportModal = document.getElementById('export-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnModalCancel = document.getElementById('btn-modal-cancel');
  const btnModalCopy = document.getElementById('btn-modal-copy');
  const btnModalDownload = document.getElementById('btn-modal-download');
  const modalDownloadText = document.getElementById('modal-download-text');
  const modalTableTitle = document.getElementById('modal-table-title');
  const modalTableSubtitle = document.getElementById('modal-table-subtitle');
  const tabFormatCsv = document.getElementById('tab-format-csv');
  const tabFormatJson = document.getElementById('tab-format-json');
  const modalSelectionSummary = document.getElementById('modal-selection-summary');
  const modalColCountBadge = document.getElementById('modal-col-count-badge');
  const btnColSelectAll = document.getElementById('btn-col-select-all');
  const btnColDeselectAll = document.getElementById('btn-col-deselect-all');
  const btnColInvert = document.getElementById('btn-col-invert');
  const modalColSearch = document.getElementById('modal-col-search');
  const modalColumnsList = document.getElementById('modal-columns-list');
  const modalRowAllCount = document.getElementById('modal-row-all-count');
  const modalRowLimitVal = document.getElementById('modal-row-limit-val');
  const modalRowRangeStart = document.getElementById('modal-row-range-start');
  const modalRowRangeEnd = document.getElementById('modal-row-range-end');
  const modalOptCleanCitations = document.getElementById('modal-opt-clean-citations');
  const modalOptUnmergeRowspan = document.getElementById('modal-opt-unmerge-rowspan');
  const modalOptTrimWhitespace = document.getElementById('modal-opt-trim-whitespace');
  const modalCsvDelimiterContainer = document.getElementById('modal-csv-delimiter-container');
  const modalCsvDelimiter = document.getElementById('modal-csv-delimiter');
  const modalJsonFormatContainer = document.getElementById('modal-json-format-container');
  const modalJsonFormat = document.getElementById('modal-json-format');
  const modalPreviewTheadTr = document.getElementById('modal-preview-thead-tr');
  const modalPreviewTbody = document.getElementById('modal-preview-tbody');

  // State Variables
  let activeTabId = null;
  let pageTitle = 'scraped_page';
  let tablesData = [];
  const selectedTableIndices = new Set();

  // Modal State Variables
  let modalCurrentTable = null;
  let modalFormat = 'csv'; // 'csv' or 'json'
  let modalSelectedCols = new Set(); // Set of column indices

  // Show Toast Message
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');
    setTimeout(() => {
      toast.classList.remove('opacity-100');
      toast.classList.add('opacity-0');
    }, 2200);
  }

  // Sanitize Filename
  function sanitizeFilename(name) {
    return (name || 'table')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  // Trigger browser download via Blob
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Convert table data to standard RFC-4180 CSV
  function tableToCSV(headers, rows, delimiter = ',') {
    const escapeCell = (val) => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (str.includes('"') || str.includes(delimiter) || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const lines = [];
    if (headers && headers.length > 0) {
      lines.push(headers.map(escapeCell).join(delimiter));
    }
    rows.forEach(row => {
      lines.push(row.map(escapeCell).join(delimiter));
    });

    // UTF-8 BOM ensures proper character encoding in Excel
    return '\uFEFF' + lines.join('\r\n');
  }

  // ==========================================
  // TABLE CARD RENDERING & MULTI-SELECTION
  // ==========================================

  function updateBatchSelectionUI() {
    const total = tablesData.length;
    const selectedCount = selectedTableIndices.size;

    selectedTablesLabel.textContent = `${selectedCount} of ${total} tables selected`;
    selectAllTablesCheckbox.checked = (total > 0 && selectedCount === total);
    selectAllTablesCheckbox.indeterminate = (selectedCount > 0 && selectedCount < total);

    if (total > 0) {
      selectionBar.classList.remove('hidden');
    } else {
      selectionBar.classList.add('hidden');
    }
  }

  function createTableCard(table) {
    const card = document.createElement('div');
    card.className = 'bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition duration-150 overflow-hidden';
    card.dataset.tableIndex = table.index;

    const displayTitle = table.title || `Table #${table.index + 1}`;
    const isChecked = selectedTableIndices.has(table.index);

    card.innerHTML = `
      <div class="p-3">
        <!-- Top row: Checkbox, Title, and Badges -->
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <div class="flex items-start space-x-2.5 min-w-0 flex-1">
            <input type="checkbox" class="table-card-checkbox mt-1 h-3.5 w-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer" ${isChecked ? 'checked' : ''}>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold text-gray-900 truncate" title="${displayTitle}">
                ${displayTitle}
              </h3>
              <p class="text-xs text-gray-400 truncate">
                ${table.id ? '#' + table.id + ' ' : ''}${table.caption ? '• Caption: ' + table.caption : ''}
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-1 flex-shrink-0">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
              ${table.rowCount} rows
            </span>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
              ${table.colCount} cols
            </span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
          <!-- Left: Locate & Preview buttons -->
          <div class="flex items-center space-x-1">
            <button class="btn-locate p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition" title="Locate & highlight on page">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
              </svg>
            </button>
            <button class="btn-preview px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition font-medium flex items-center space-x-1">
              <span>Preview</span>
              <svg class="w-3 h-3 transform transition-transform duration-150 preview-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>

          <!-- Right: Selection & Export Studio buttons -->
          <div class="flex items-center space-x-1.5">
            <button class="btn-copy-quick text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-1.5 rounded transition" title="Copy table to clipboard">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path>
              </svg>
            </button>
            <button class="btn-csv text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-2.5 py-1.5 rounded shadow-xs transition flex items-center space-x-1" title="Select columns & download CSV">
              <span>CSV</span>
            </button>
            <button class="btn-json text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-2.5 py-1.5 rounded shadow-xs transition flex items-center space-x-1" title="Select columns & download JSON">
              <span>JSON</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Preview Drawer (Hidden by default) -->
      <div class="preview-drawer hidden border-t border-gray-100 bg-gray-50 p-2.5 overflow-x-auto">
        <div class="text-[11px] font-medium text-gray-500 mb-1.5 flex justify-between items-center">
          <span>First ${Math.min(table.rows.length, 5)} of ${table.rows.length} rows</span>
          <button class="btn-open-studio text-indigo-600 hover:text-indigo-800 hover:underline font-medium">Open Export Studio &rarr;</button>
        </div>
        <div class="border border-gray-200 rounded bg-white overflow-hidden max-h-40 overflow-y-auto">
          <table class="min-w-full text-left text-xs divide-y divide-gray-200">
            <thead class="bg-gray-100 text-gray-700 sticky top-0">
              <tr>
                ${table.headers.map(h => `<th class="px-2 py-1 font-semibold truncate max-w-[120px]">${h || '-'}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 text-gray-600">
              ${(table.preview || []).map(row => `
                <tr class="hover:bg-gray-50">
                  ${table.headers.map((_, i) => `<td class="px-2 py-1 truncate max-w-[120px]">${row[i] !== undefined ? row[i] : ''}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Event Listeners for this card
    const chk = card.querySelector('.table-card-checkbox');
    const btnCsv = card.querySelector('.btn-csv');
    const btnJson = card.querySelector('.btn-json');
    const btnLocate = card.querySelector('.btn-locate');
    const btnPreview = card.querySelector('.btn-preview');
    const btnCopyQuick = card.querySelector('.btn-copy-quick');
    const btnOpenStudio = card.querySelector('.btn-open-studio');
    const previewDrawer = card.querySelector('.preview-drawer');
    const previewChevron = card.querySelector('.preview-chevron');

    chk.addEventListener('change', (e) => {
      e.stopPropagation();
      if (chk.checked) {
        selectedTableIndices.add(table.index);
      } else {
        selectedTableIndices.delete(table.index);
      }
      updateBatchSelectionUI();
    });

    // Clicking CSV or JSON opens the Export Studio with that format preselected
    btnCsv.addEventListener('click', () => openExportModal(table, 'csv'));
    btnJson.addEventListener('click', () => openExportModal(table, 'json'));
    btnOpenStudio.addEventListener('click', () => openExportModal(table, 'csv'));

    btnLocate.addEventListener('click', () => highlightTableOnPage(table.index));

    btnCopyQuick.addEventListener('click', () => {
      const textToCopy = tableToCSV(table.headers, table.rows);
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Table copied as CSV!');
      }).catch(() => {
        showToast('Failed to copy to clipboard');
      });
    });

    btnPreview.addEventListener('click', () => {
      const isHidden = previewDrawer.classList.contains('hidden');
      if (isHidden) {
        previewDrawer.classList.remove('hidden');
        previewChevron.classList.add('rotate-180');
      } else {
        previewDrawer.classList.add('hidden');
        previewChevron.classList.remove('rotate-180');
      }
    });

    return card;
  }

  function renderTables(tablesToRender) {
    tablesList.innerHTML = '';

    if (!tablesToRender || tablesToRender.length === 0) {
      if (tablesData.length > 0) {
        tablesList.innerHTML = `
          <div class="text-center py-8 text-gray-500 text-xs">
            No tables match your search query.
          </div>
        `;
      } else {
        showState('empty');
      }
      return;
    }

    tablesToRender.forEach(table => {
      const card = createTableCard(table);
      tablesList.appendChild(card);
    });

    updateBatchSelectionUI();
  }

  function handleSearch() {
    const query = (searchInput.value || '').toLowerCase().trim();
    if (!query) {
      renderTables(tablesData);
      return;
    }

    const filtered = tablesData.filter(table => {
      const titleMatch = (table.title || '').toLowerCase().includes(query);
      const idMatch = (table.id || '').toLowerCase().includes(query);
      const headerMatch = (table.headers || []).some(h => (h || '').toLowerCase().includes(query));
      return titleMatch || idMatch || headerMatch;
    });

    renderTables(filtered);
  }

  function highlightTableOnPage(index) {
    if (!activeTabId) return;
    chrome.tabs.sendMessage(activeTabId, { action: 'HIGHLIGHT_TABLE', index }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Could not highlight:', chrome.runtime.lastError.message);
      }
    });
  }

  // ==========================================
  // EXPORT & SELECTION MODAL LOGIC
  // ==========================================

  function openExportModal(table, format = 'csv') {
    modalCurrentTable = table;
    modalFormat = format;

    // Reset column selection: by default, all columns selected
    modalSelectedCols = new Set(table.headers.map((_, i) => i));

    // Update Modal Header & Title
    modalTableTitle.textContent = table.title || `Table #${table.index + 1}`;
    modalTableSubtitle.textContent = `${table.rowCount} rows × ${table.colCount} columns`;
    modalRowAllCount.textContent = `${table.rowCount} total rows`;

    // Reset range input defaults
    modalRowRangeStart.value = '1';
    modalRowRangeEnd.value = String(Math.min(table.rowCount, 50));
    modalRowLimitVal.value = String(Math.min(table.rowCount, 25));

    // Reset column search
    modalColSearch.value = '';

    // Switch Format Tabs
    setModalFormat(format);

    // Populate Column Checklist
    renderModalColumnList();

    // Update Live Preview and summary
    updateModalPreviewAndSummary();

    // Display modal
    exportModal.classList.remove('hidden');
  }

  function closeExportModal() {
    exportModal.classList.add('hidden');
    modalCurrentTable = null;
  }

  function setModalFormat(format) {
    modalFormat = format;
    if (format === 'csv') {
      tabFormatCsv.className = 'px-3 py-1 text-xs font-semibold rounded transition bg-white text-gray-900 shadow-xs';
      tabFormatJson.className = 'px-3 py-1 text-xs font-medium rounded transition text-gray-600 hover:text-gray-900';
      modalCsvDelimiterContainer.classList.remove('hidden');
      modalJsonFormatContainer.classList.add('hidden');
      modalDownloadText.textContent = 'Download CSV';
    } else {
      tabFormatJson.className = 'px-3 py-1 text-xs font-semibold rounded transition bg-white text-gray-900 shadow-xs';
      tabFormatCsv.className = 'px-3 py-1 text-xs font-medium rounded transition text-gray-600 hover:text-gray-900';
      modalCsvDelimiterContainer.classList.add('hidden');
      modalJsonFormatContainer.classList.remove('hidden');
      modalDownloadText.textContent = 'Download JSON';
    }
    updateModalPreviewAndSummary();
  }

  function renderModalColumnList() {
    if (!modalCurrentTable) return;
    const filterQuery = (modalColSearch.value || '').toLowerCase().trim();
    modalColumnsList.innerHTML = '';

    modalCurrentTable.headers.forEach((header, idx) => {
      if (filterQuery && !header.toLowerCase().includes(filterQuery)) {
        return;
      }

      const isChecked = modalSelectedCols.has(idx);
      const samples = (modalCurrentTable.columnSamples && modalCurrentTable.columnSamples[idx]) || [];
      const sampleText = samples.length > 0 ? samples.join(', ') : 'no sample';

      const label = document.createElement('label');
      label.className = `col-checkbox-label flex items-start space-x-2 p-1.5 rounded border border-gray-200 cursor-pointer text-xs transition select-none ${isChecked ? 'selected' : ''}`;

      label.innerHTML = `
        <input type="checkbox" class="modal-col-checkbox mt-0.5 h-3.5 w-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" data-col-index="${idx}" ${isChecked ? 'checked' : ''}>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-gray-800 truncate" title="${header}">${header}</p>
          <p class="text-[10px] text-gray-400 truncate" title="${sampleText}">${sampleText}</p>
        </div>
      `;

      const chk = label.querySelector('.modal-col-checkbox');
      chk.addEventListener('change', () => {
        if (chk.checked) {
          modalSelectedCols.add(idx);
          label.classList.add('selected');
        } else {
          modalSelectedCols.delete(idx);
          label.classList.remove('selected');
        }
        updateModalPreviewAndSummary();
      });

      modalColumnsList.appendChild(label);
    });
  }

  // Get currently selected filtered data based on user configuration
  function getFilteredExportData() {
    if (!modalCurrentTable) return null;

    const table = modalCurrentTable;
    const selectedIndices = Array.from(modalSelectedCols).sort((a, b) => a - b);
    const selectedHeaders = selectedIndices.map(i => table.headers[i]);

    // Choose base rows: unmerged rowspans or unfilled
    const useUnmerged = modalOptUnmergeRowspan.checked;
    const sourceRows = (useUnmerged ? table.rows : (table.rowsUnfilled || table.rows)) || [];

    // Filter rows based on row scope
    const rowScopeInput = document.querySelector('input[name="modal-row-scope"]:checked');
    const scope = rowScopeInput ? rowScopeInput.value : 'all';

    let rowStart = 0;
    let rowEnd = sourceRows.length;

    if (scope === 'limit') {
      const limit = Math.max(1, parseInt(modalRowLimitVal.value || '25', 10));
      rowEnd = Math.min(sourceRows.length, limit);
    } else if (scope === 'range') {
      const start = Math.max(1, parseInt(modalRowRangeStart.value || '1', 10)) - 1;
      const end = Math.max(start + 1, parseInt(modalRowRangeEnd.value || String(sourceRows.length), 10));
      rowStart = Math.min(sourceRows.length, Math.max(0, start));
      rowEnd = Math.min(sourceRows.length, end);
    }

    const slicedRows = sourceRows.slice(rowStart, rowEnd);

    // Extract only selected columns
    const cleanCitations = modalOptCleanCitations.checked;
    const trimWhitespace = modalOptTrimWhitespace.checked;

    const filteredRows = slicedRows.map(row => {
      return selectedIndices.map(colIdx => {
        let val = row[colIdx] !== undefined ? row[colIdx] : '';
        if (cleanCitations && typeof val === 'string') {
          val = val.replace(/\[\s*(?:\d+|[a-zA-Z]|note\s*\d+)\s*\]/gi, '');
        }
        if (trimWhitespace && typeof val === 'string') {
          val = val.trim();
        }
        return val;
      });
    });

    // Build JSON objects if needed
    const jsonObjects = filteredRows.map(row => {
      const obj = {};
      selectedHeaders.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });

    return {
      headers: selectedHeaders,
      rows: filteredRows,
      jsonObjects,
      colCount: selectedHeaders.length,
      rowCount: filteredRows.length
    };
  }

  function updateModalPreviewAndSummary() {
    if (!modalCurrentTable) return;

    const data = getFilteredExportData();
    if (!data) return;

    // Update badges
    modalColCountBadge.textContent = `(${data.colCount} of ${modalCurrentTable.colCount} selected)`;
    modalSelectionSummary.textContent = `${data.colCount} cols, ${data.rowCount} rows`;

    // Disable download if 0 columns
    if (data.colCount === 0 || data.rowCount === 0) {
      btnModalDownload.disabled = true;
      btnModalDownload.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      btnModalDownload.disabled = false;
      btnModalDownload.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // Populate live preview table (first 3 rows)
    modalPreviewTheadTr.innerHTML = '';
    modalPreviewTbody.innerHTML = '';

    if (data.colCount === 0) {
      modalPreviewTbody.innerHTML = `<tr><td class="p-3 text-center text-gray-400" colspan="100%">No columns selected. Please select at least one column above.</td></tr>`;
      return;
    }

    data.headers.forEach(h => {
      const th = document.createElement('th');
      th.className = 'px-2 py-1 font-semibold truncate max-w-[130px]';
      th.textContent = h;
      modalPreviewTheadTr.appendChild(th);
    });

    const previewRows = data.rows.slice(0, 3);
    if (previewRows.length === 0) {
      modalPreviewTbody.innerHTML = `<tr><td class="p-3 text-center text-gray-400" colspan="${data.colCount}">No rows match the specified range.</td></tr>`;
      return;
    }

    previewRows.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50';
      row.forEach(val => {
        const td = document.createElement('td');
        td.className = 'px-2 py-1 truncate max-w-[130px]';
        td.textContent = val !== undefined ? val : '';
        tr.appendChild(td);
      });
      modalPreviewTbody.appendChild(tr);
    });
  }

  // Handle Download from Modal
  function handleModalDownload() {
    const data = getFilteredExportData();
    if (!data || data.colCount === 0 || data.rowCount === 0) {
      showToast('Please select at least 1 column and row');
      return;
    }

    const baseName = sanitizeFilename(`${pageTitle}_${modalCurrentTable.title || 'table'}`);

    if (modalFormat === 'csv') {
      const delimiter = modalCsvDelimiter.value || ',';
      const csvContent = tableToCSV(data.headers, data.rows, delimiter);
      const filename = `${baseName}_selected.csv`;
      downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
      showToast(`Exported ${filename}`);
    } else {
      const jsonMode = modalJsonFormat.value;
      const contentData = (jsonMode === 'rows') ? [data.headers, ...data.rows] : data.jsonObjects;
      const jsonContent = JSON.stringify(contentData, null, 2);
      const filename = `${baseName}_selected.json`;
      downloadFile(jsonContent, filename, 'application/json;charset=utf-8;');
      showToast(`Exported ${filename}`);
    }

    closeExportModal();
  }

  // Handle Copy from Modal
  function handleModalCopy() {
    const data = getFilteredExportData();
    if (!data || data.colCount === 0) {
      showToast('No columns selected to copy');
      return;
    }

    let textToCopy = '';
    if (modalFormat === 'csv') {
      const delimiter = modalCsvDelimiter.value || ',';
      textToCopy = tableToCSV(data.headers, data.rows, delimiter);
    } else {
      const jsonMode = modalJsonFormat.value;
      const contentData = (jsonMode === 'rows') ? [data.headers, ...data.rows] : data.jsonObjects;
      textToCopy = JSON.stringify(contentData, null, 2);
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(`Copied ${modalFormat.toUpperCase()} data to clipboard!`);
    }).catch(err => {
      showToast('Failed to copy');
      console.error(err);
    });
  }

  // ==========================================
  // BATCH MULTI-TABLE EXPORT
  // ==========================================

  function exportSelectedTables(format) {
    if (selectedTableIndices.size === 0) {
      showToast('No tables selected');
      return;
    }

    const selectedTables = tablesData.filter(t => selectedTableIndices.has(t.index));

    if (format === 'json') {
      const bundle = {};
      selectedTables.forEach((table, i) => {
        const key = table.title || `Table_${table.index + 1}`;
        bundle[key] = table.jsonData;
      });
      const content = JSON.stringify(bundle, null, 2);
      const fname = `${sanitizeFilename(pageTitle)}_selected_${selectedTables.length}_tables.json`;
      downloadFile(content, fname, 'application/json;charset=utf-8;');
      showToast(`Exported ${selectedTables.length} tables to JSON!`);
    } else {
      selectedTables.forEach((table, idx) => {
        setTimeout(() => {
          const csvContent = tableToCSV(table.headers, table.rows);
          const fname = `${sanitizeFilename(pageTitle)}_table_${table.index + 1}.csv`;
          downloadFile(csvContent, fname, 'text/csv;charset=utf-8;');
        }, idx * 250);
      });
      showToast(`Exporting ${selectedTables.length} CSV files...`);
    }
  }

  // ==========================================
  // VIEW STATE SWITCHER & SCANNING
  // ==========================================

  function showState(state) {
    stateLoading.classList.add('hidden');
    stateEmpty.classList.add('hidden');
    stateRestricted.classList.add('hidden');
    tablesList.classList.add('hidden');
    selectionBar.classList.add('hidden');

    if (state === 'loading') {
      stateLoading.classList.remove('hidden');
      tableCountSubtitle.textContent = 'Scanning active tab...';
      searchContainer.classList.add('hidden');
    } else if (state === 'empty') {
      stateEmpty.classList.remove('hidden');
      tableCountSubtitle.textContent = '0 tables found';
      searchContainer.classList.add('hidden');
    } else if (state === 'restricted') {
      stateRestricted.classList.remove('hidden');
      tableCountSubtitle.textContent = 'Cannot access this page';
      searchContainer.classList.add('hidden');
    } else if (state === 'success') {
      tablesList.classList.remove('hidden');
      const count = tablesData.length;
      tableCountSubtitle.textContent = `${count} ${count === 1 ? 'table' : 'tables'} detected`;

      if (count > 0) {
        selectionBar.classList.remove('hidden');
      }
      if (count > 1) {
        searchContainer.classList.remove('hidden');
      }
      updateBatchSelectionUI();
    }
  }

  async function scanActiveTab() {
    showState('loading');
    searchInput.value = '';
    selectedTableIndices.clear();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showState('empty');
        return;
      }

      activeTabId = tab.id;
      pageTitle = tab.title || 'scraped_page';
      footerPageTitle.textContent = tab.url ? new URL(tab.url).hostname : 'Webpage';

      // Check if restricted protocol
      if (tab.url && (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('view-source:')
      )) {
        showState('restricted');
        return;
      }

      // Try communicating with content script
      const sendScanRequest = () => {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(activeTabId, { action: 'GET_TABLES' }, (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            resolve(response);
          });
        });
      };

      let response;
      try {
        response = await sendScanRequest();
      } catch (err) {
        // If content script is not yet injected on existing tab, inject it dynamically
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTabId },
            files: ['content.js']
          });
          await new Promise(r => setTimeout(r, 120));
          response = await sendScanRequest();
        } catch (injectErr) {
          console.error('Failed to inject script:', injectErr);
          showState('restricted');
          return;
        }
      }

      if (response && response.success) {
        tablesData = response.tables || [];
        if (response.pageTitle) {
          pageTitle = response.pageTitle;
        }
        if (tablesData.length > 0) {
          // Pre-select all tables by default
          tablesData.forEach(t => selectedTableIndices.add(t.index));
          showState('success');
          renderTables(tablesData);
        } else {
          showState('empty');
        }
      } else {
        showState('empty');
      }
    } catch (e) {
      console.error('Scan error:', e);
      showState('empty');
    }
  }

  // ==========================================
  // EVENT LISTENERS BINDING
  // ==========================================

  // Refresh & Retry
  btnRefresh.addEventListener('click', scanActiveTab);
  btnEmptyRetry.addEventListener('click', scanActiveTab);
  searchInput.addEventListener('input', handleSearch);

  // Multi-Table Selection Bar
  selectAllTablesCheckbox.addEventListener('change', () => {
    if (selectAllTablesCheckbox.checked) {
      tablesData.forEach(t => selectedTableIndices.add(t.index));
    } else {
      selectedTableIndices.clear();
    }
    renderTables(tablesData);
  });

  btnExportSelectedCsv.addEventListener('click', () => exportSelectedTables('csv'));
  btnExportSelectedJson.addEventListener('click', () => exportSelectedTables('json'));

  // Export Studio Modal Listeners
  btnCloseModal.addEventListener('click', closeExportModal);
  btnModalCancel.addEventListener('click', closeExportModal);
  tabFormatCsv.addEventListener('click', () => setModalFormat('csv'));
  tabFormatJson.addEventListener('click', () => setModalFormat('json'));

  btnColSelectAll.addEventListener('click', () => {
    if (!modalCurrentTable) return;
    modalSelectedCols = new Set(modalCurrentTable.headers.map((_, i) => i));
    renderModalColumnList();
    updateModalPreviewAndSummary();
  });

  btnColDeselectAll.addEventListener('click', () => {
    modalSelectedCols.clear();
    renderModalColumnList();
    updateModalPreviewAndSummary();
  });

  btnColInvert.addEventListener('click', () => {
    if (!modalCurrentTable) return;
    const inverted = new Set();
    modalCurrentTable.headers.forEach((_, i) => {
      if (!modalSelectedCols.has(i)) inverted.add(i);
    });
    modalSelectedCols = inverted;
    renderModalColumnList();
    updateModalPreviewAndSummary();
  });

  modalColSearch.addEventListener('input', renderModalColumnList);

  // Row Scope Radio Listeners
  document.querySelectorAll('input[name="modal-row-scope"]').forEach(radio => {
    radio.addEventListener('change', updateModalPreviewAndSummary);
  });
  modalRowLimitVal.addEventListener('input', () => {
    const radio = document.querySelector('input[name="modal-row-scope"][value="limit"]');
    if (radio) radio.checked = true;
    updateModalPreviewAndSummary();
  });
  modalRowRangeStart.addEventListener('input', () => {
    const radio = document.querySelector('input[name="modal-row-scope"][value="range"]');
    if (radio) radio.checked = true;
    updateModalPreviewAndSummary();
  });
  modalRowRangeEnd.addEventListener('input', () => {
    const radio = document.querySelector('input[name="modal-row-scope"][value="range"]');
    if (radio) radio.checked = true;
    updateModalPreviewAndSummary();
  });

  // Cleaning & Format Option Listeners
  modalOptCleanCitations.addEventListener('change', updateModalPreviewAndSummary);
  modalOptUnmergeRowspan.addEventListener('change', updateModalPreviewAndSummary);
  modalOptTrimWhitespace.addEventListener('change', updateModalPreviewAndSummary);
  modalCsvDelimiter.addEventListener('change', updateModalPreviewAndSummary);
  modalJsonFormat.addEventListener('change', updateModalPreviewAndSummary);

  // Modal Actions
  btnModalDownload.addEventListener('click', handleModalDownload);
  btnModalCopy.addEventListener('click', handleModalCopy);

  // Initial tab scan
  scanActiveTab();
});
