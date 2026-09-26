/**
 * Table Scraper - Content Script
 * Extracts table data from the current DOM with full 2D grid matrix support
 * (colspan, rowspan, multi-level headers, and citation cleaning)
 * and responds to extension requests.
 */

(() => {
  // Prevent duplicate listener registration if injected multiple times
  if (window.__tableScraperInjected) {
    return;
  }
  window.__tableScraperInjected = true;

  // Find the closest preceding heading (h1-h6) or section label
  function findPrecedingHeading(table) {
    let el = table.previousElementSibling;
    while (el) {
      if (/^H[1-6]$/i.test(el.tagName)) {
        const text = el.innerText?.trim();
        if (text) return text;
      }
      // Check if child has a heading
      const headingInside = el.querySelector?.('h1, h2, h3, h4, h5, h6');
      if (headingInside) {
        const text = headingInside.innerText?.trim();
        if (text) return text;
      }
      el = el.previousElementSibling;
    }

    // Check parent's previous element or parent heading
    let parent = table.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      if (parent.tagName === 'BODY') break;
      let prev = parent.previousElementSibling;
      while (prev) {
        if (/^H[1-6]$/i.test(prev.tagName)) {
          const text = prev.innerText?.trim();
          if (text) return text;
        }
        prev = prev.previousElementSibling;
      }
      parent = parent.parentElement;
      depth++;
    }

    return null;
  }

  // Clean cell text thoroughly
  function cleanCellText(cell) {
    if (!cell) return '';
    const clone = cell.cloneNode(true);

    // Remove nested tables to avoid inner content pollution
    clone.querySelectorAll('table').forEach(t => t.remove());

    // Remove script, style, noscript, svg, canvas elements
    clone.querySelectorAll('script, style, noscript, svg, canvas').forEach(el => el.remove());

    // Remove Wikipedia & web references, citations, edit links
    clone.querySelectorAll('sup.reference, .mw-ref, .reference, .citation, .mw-editsection').forEach(el => el.remove());

    // Remove hidden/screen-reader elements and sort keys
    clone.querySelectorAll('.sortkey, .mw-empty-elt, .sr-only, .visually-hidden, [aria-hidden="true"]').forEach(el => el.remove());
    clone.querySelectorAll('[style*="display:none"], [style*="display: none"]').forEach(el => el.remove());

    // Replace linebreaks with space
    clone.querySelectorAll('br').forEach(br => br.replaceWith(' '));

    let text = clone.innerText !== undefined ? clone.innerText : clone.textContent;
    if (!text) text = '';

    // Strip bracketed footnote artifacts like [1], [note 1], [a]
    text = text.replace(/\[\s*(?:\d+|[a-zA-Z]|note\s*\d+)\s*\]/gi, '');

    // Normalize whitespace, non-breaking spaces (\u00A0), tabs and newlines
    return text
      .replace(/\u00A0/g, ' ')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Build a true 2D matrix honoring colspan and rowspan
  function build2DGrid(trElements) {
    const grid = [];
    for (let r = 0; r < trElements.length; r++) {
      if (!grid[r]) grid[r] = [];
      const tr = trElements[r];
      const cells = Array.from(tr.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH');

      let c = 0;
      for (const cell of cells) {
        // Find next unoccupied column slot in row r
        while (grid[r][c] !== undefined) {
          c++;
        }

        const text = cleanCellText(cell);
        const rowspan = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10));
        const colspan = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10));

        for (let dr = 0; dr < rowspan; dr++) {
          const targetRow = r + dr;
          if (!grid[targetRow]) grid[targetRow] = [];
          for (let dc = 0; dc < colspan; dc++) {
            const targetCol = c + dc;
            grid[targetRow][targetCol] = {
              text: text,
              isOrigin: (dr === 0 && dc === 0),
              isRowspanFill: (dr > 0),
              isColspanFill: (dc > 0),
              tag: cell.tagName.toLowerCase()
            };
          }
        }
        c += colspan;
      }
    }
    return grid;
  }

  // Parse a single table element into structured data
  function parseTable(table, index) {
    const captionEl = table.querySelector('caption');
    const caption = captionEl ? cleanCellText(captionEl) : '';
    const heading = findPrecedingHeading(table);
    const tableId = table.id ? `#${table.id}` : '';
    const tableClass = table.className && typeof table.className === 'string'
      ? '.' + table.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';

    // Collect all direct row elements (excluding rows from nested tables)
    const allTrs = Array.from(table.querySelectorAll('tr')).filter(tr => tr.closest('table') === table);
    if (allTrs.length === 0) return null;

    // Distinguish header rows and body rows
    const thead = table.querySelector('thead');
    let headerTrs = [];
    let bodyTrs = [];

    if (thead) {
      headerTrs = Array.from(thead.querySelectorAll('tr')).filter(tr => tr.closest('table') === table);
      bodyTrs = allTrs.filter(tr => !thead.contains(tr));
    } else {
      // Detect if leading rows are predominantly <th>
      let headerEndIndex = 0;
      for (let i = 0; i < allTrs.length; i++) {
        const tr = allTrs[i];
        const cells = Array.from(tr.children).filter(el => el.tagName === 'TD' || el.tagName === 'TH');
        if (cells.length === 0) continue;
        const thCount = cells.filter(el => el.tagName === 'TH').length;
        if (thCount >= cells.length / 2 && i < 3) {
          headerEndIndex = i + 1;
        } else {
          break;
        }
      }

      if (headerEndIndex > 0) {
        headerTrs = allTrs.slice(0, headerEndIndex);
        bodyTrs = allTrs.slice(headerEndIndex);
      } else {
        bodyTrs = allTrs;
      }
    }

    // Build 2D grids for headers and body
    const headerGrid = headerTrs.length > 0 ? build2DGrid(headerTrs) : [];
    const bodyGrid = bodyTrs.length > 0 ? build2DGrid(bodyTrs) : [];

    // Calculate maximum columns across both grids
    let maxCols = 0;
    headerGrid.forEach(row => { if (row.length > maxCols) maxCols = row.length; });
    bodyGrid.forEach(row => { if (row.length > maxCols) maxCols = row.length; });

    if (maxCols === 0) return null;

    // Resolve hierarchical column headers
    const rawHeaders = [];
    for (let c = 0; c < maxCols; c++) {
      const parts = [];
      for (let r = 0; r < headerGrid.length; r++) {
        const cell = headerGrid[r] ? headerGrid[r][c] : null;
        if (cell && cell.text) {
          // Avoid duplicate adjacent parts from rowspans
          if (parts.length === 0 || parts[parts.length - 1] !== cell.text) {
            parts.push(cell.text);
          }
        }
      }
      const combined = parts.join(' - ').trim();
      rawHeaders.push(combined || `Column ${c + 1}`);
    }

    // Ensure header names are unique for JSON keys and column selection
    const uniqueHeaders = [];
    const headerCounts = {};
    rawHeaders.forEach((h, idx) => {
      let name = h || `Column ${idx + 1}`;
      if (headerCounts[name]) {
        headerCounts[name]++;
        name = `${name}_${headerCounts[name]}`;
      } else {
        headerCounts[name] = 1;
      }
      uniqueHeaders.push(name);
    });

    // Extract row values (both filled with rowspans and unfilled)
    const rowsData = [];
    const rowsUnfilled = [];
    const columnSamples = Array(maxCols).fill(null).map(() => []);

    for (let r = 0; r < bodyGrid.length; r++) {
      const gridRow = bodyGrid[r];
      let hasData = false;
      const rowFilled = [];
      const rowUnfilled = [];

      for (let c = 0; c < maxCols; c++) {
        const cell = gridRow ? gridRow[c] : null;
        const text = cell ? cell.text : '';
        if (text) hasData = true;

        rowFilled.push(text);
        rowUnfilled.push((cell && cell.isRowspanFill) ? '' : text);

        if (text && columnSamples[c].length < 2 && !columnSamples[c].includes(text)) {
          columnSamples[c].push(text);
        }
      }

      if (hasData) {
        rowsData.push(rowFilled);
        rowsUnfilled.push(rowUnfilled);
      }
    }

    // Generate JSON items as array of objects
    const jsonData = rowsData.map(row => {
      const obj = {};
      uniqueHeaders.forEach((colName, idx) => {
        obj[colName] = row[idx] !== undefined ? row[idx] : '';
      });
      return obj;
    });

    const title = caption || heading || (tableId ? `Table ${tableId}` : (tableClass ? `Table ${tableClass}` : `Table #${index + 1}`));

    return {
      index,
      title,
      caption,
      heading,
      id: table.id || '',
      className: typeof table.className === 'string' ? table.className : '',
      rowCount: rowsData.length,
      colCount: maxCols,
      headers: uniqueHeaders,
      rows: rowsData,
      rowsUnfilled: rowsUnfilled,
      columnSamples: columnSamples,
      jsonData,
      preview: rowsData.slice(0, 5)
    };
  }

  // Find all visible and non-empty tables
  function scanTables() {
    const rawTables = Array.from(document.querySelectorAll('table'));
    const detected = [];

    rawTables.forEach((table, idx) => {
      const style = window.getComputedStyle(table);
      if (style.display === 'none' || style.visibility === 'hidden') {
        if (!table.rows || table.rows.length === 0) return;
      }

      const parsed = parseTable(table, idx);
      if (parsed && (parsed.rowCount > 0 || parsed.headers.length > 0)) {
        detected.push(parsed);
      }
    });

    return detected;
  }

  // Highlight and scroll to a table on page
  function highlightTable(index) {
    const tables = document.querySelectorAll('table');
    const table = tables[index];
    if (!table) return false;

    table.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const originalTransition = table.style.transition;
    const originalOutline = table.style.outline;
    const originalBoxShadow = table.style.boxShadow;

    table.style.transition = 'all 0.3s ease';
    table.style.outline = '3px solid #3b82f6';
    table.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.6)';

    setTimeout(() => {
      table.style.transition = originalTransition;
      table.style.outline = originalOutline;
      table.style.boxShadow = originalBoxShadow;
    }, 2500);

    return true;
  }

  // Message listener for communication with popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_TABLES') {
      try {
        const tables = scanTables();
        sendResponse({
          success: true,
          tables,
          pageTitle: document.title || 'webpage',
          pageUrl: window.location.href
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.action === 'HIGHLIGHT_TABLE') {
      const ok = highlightTable(message.index);
      sendResponse({ success: ok });
      return true;
    }
  });
})();
