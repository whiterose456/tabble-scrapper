# Table Scraper

A lightweight Chrome extension for finding HTML tables on the current webpage and exporting the data as CSV or JSON. It is built with Manifest V3 and does not require a build step or third-party JavaScript packages.

## Features

- Detects HTML tables and shows a preview, title, dimensions, and a way to locate each table on the page.
- Handles `rowspan`, `colspan`, multi-row headers, and nested tables when extracting data.
- Search tables by title, ID, or column name; select one or several tables.
- Choose columns and row ranges, preview the selection, and clean citations or whitespace before export.
- Download or copy data as CSV or JSON. CSV supports comma, semicolon, and tab delimiters; JSON supports arrays of objects or rows.

## Install in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Select **Load unpacked** and choose the repository folder (the folder containing `manifest.json`).
4. Open a webpage with an HTML table, then select the Table Scraper icon in the Chrome toolbar.

After changing the extension files, select **Reload** on the extension card to load the latest version.

## Use

Open the extension popup on a page with tables. Select a table card to export it, or use the checkboxes and the selection bar to export multiple tables. The **CSV** and **JSON** actions open Export Studio, where you can choose columns, rows, formatting, and cleanup options before downloading or copying.

The extension works with HTML `<table>` elements. It cannot access Chrome internal pages, the Chrome Web Store, or other browser-restricted pages, and it does not convert page layouts built from non-table elements into tables.

## Permissions and privacy

- `activeTab` and `scripting` are used to inspect the active page and inject the content script when it is not already available.
- The content script is declared for web pages so the popup can request table data from the active tab.
- Table extraction and export happen in the browser. This project does not send scraped page data to a server.
- The popup loads Tailwind CSS from jsDelivr, so its styling requires an internet connection.

## Development checks

Node.js 20 or later is recommended. From the repository root, run:

```sh
npm run check
npm test
```

`check` verifies JavaScript syntax. `test` runs dependency-free smoke checks for the extension manifest, popup references, and content-script messaging. GitHub Actions runs both commands for pushes and pull requests.
