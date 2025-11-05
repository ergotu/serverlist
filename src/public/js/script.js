/* eslint-disable no-unused-vars */

// Configuration
const REFRESH_INTERVAL_SECONDS = 15;

// Track which series have online servers
const onlineSeriesSet = new Set();

// Track if any servers have mods
let hasAnyMods = false;

// Track all servers for periodic refresh
const allServers = new Map();

// Store original row templates for recreating offline servers
const serverRowTemplates = new Map();

async function checkServerStatus(host, port, game, rowIndex)
{
  try
  {
    const response = await fetch(`/${ game }/${ host }:${ port }`);
    const data = await response.json();

    let playerCount = ``;
    let serverVersion = ``;
    let map = ``;
    let gameType = ``;
    let gameModification = ``;

    if (data.data && data.data.players)
    {
      // sometimes numplayers includes bots, so we need to subtract them
      playerCount = `${ data.data.numplayers - data.data.bots.length } / ${ data.data.maxplayers }`;
      serverVersion = data.data.version || ``;
      map = data.data.map || ``;
      gameType = data.data.raw.g_gametype || ``;
      if (game === `q3a` && gameType === `0`) gameType = ``; // quake 3 fix
      gameModification = data.data.raw.fs_game || ``;
      gameModification = gameModification.replaceAll(`mods/`, ``); // Remove 'mods/' from the mod name
      let hasPassword = data.data.password || false;
      if (hasPassword === `0`) hasPassword = false; // Convert 0 to false (quake 3 fix)
      if (data.data.raw.isPrivate === `1`) hasPassword = true; // iw4 fix

      let row = document.querySelector(`#row-${ rowIndex }`);

      // If row doesn't exist, recreate it from template
      if (!row && serverRowTemplates.has(rowIndex))
      {
        const template = serverRowTemplates.get(rowIndex);
        const tbody = document.querySelector('#serverTable tbody');
        row = template.cloneNode(true);
        tbody.appendChild(row);
      }

      if (row)
      {
        markServerOnline(row);
      }
      if (hasPassword)
        row.children[0].innerHTML += `<img class="icon" src="https://i.chse.sh/p/serverlist/lock.png" alt="" width="32" height="32" onclick="event.stopPropagation(); passwordPrompt(this)">`;
      row.children[2].textContent = playerCount;
      row.children[3].textContent = map;
      row.children[4].textContent = gameType;
      row.children[5].textContent = gameModification;

      // Check if this server has a mod
      if (gameModification && gameModification.trim() !== '')
      {
        hasAnyMods = true;
        updateModColumnVisibility();
      }

      // Track that this series has an online server
      const seriesCell = row.children[7];
      if (seriesCell)
      {
        onlineSeriesSet.add(seriesCell.textContent.trim());
        updateSeriesFilters();
      }

      sortTable();
    } else
    {
      const row = document.querySelector(`#row-${ rowIndex }`);
      if (row)
      {
        markServerOffline(row);
        sortTable();
      }
    }
  } catch (error)
  {
    // console.error(`Error fetching server status:`, error);
    let row = document.querySelector(`#row-${ rowIndex }`);
    if (!row && serverRowTemplates.has(rowIndex))
    {
      // Recreate the row if it doesn't exist
      const template = serverRowTemplates.get(rowIndex);
      const tbody = document.querySelector('#serverTable tbody');
      row = template.cloneNode(true);
      tbody.appendChild(row);
    }
    if (row)
    {
      markServerOffline(row);
      sortTable();
    }
  }
}

/**
 * Marks a server row as offline
 * @param {HTMLElement} row The table row to mark as offline
 */
function markServerOffline(row)
{
  row.classList.add('offline-server');
  row.classList.remove('hidden-row');

  // Clear server data and show offline indicator
  row.children[2].innerHTML = '<span class="offline-indicator">OFFLINE</span>';
  row.children[3].textContent = '';
  row.children[4].textContent = '';
  row.children[5].textContent = '';

  // Disable copy button
  const copyButton = row.querySelector('.copy-button');
  if (copyButton)
  {
    copyButton.disabled = true;
    copyButton.textContent = 'Offline';
  }
}

/**
 * Marks a server row as online
 * @param {HTMLElement} row The table row to mark as online
 */
function markServerOnline(row)
{
  row.classList.remove('offline-server');
  row.classList.remove('hidden-row');
  row.style.display = '';

  // Enable copy button
  const copyButton = row.querySelector('.copy-button');
  if (copyButton)
  {
    copyButton.disabled = false;
    copyButton.textContent = 'Copy';
  }
}

/**
 * Updates the visibility of the mod column based on whether any servers have mods
 */
function updateModColumnVisibility()
{
  const modColumns = document.querySelectorAll('.mod-column');

  for (const column of modColumns)
  {
    if (hasAnyMods)
    {
      column.style.display = '';
    } else
    {
      column.style.display = 'none';
    }
  }
}

/**
 * Updates the visibility of series filter options based on online servers
 */
function updateSeriesFilters()
{
  const seriesFilters = document.querySelectorAll(
    'input[name="series-filter"]:not(#filter-all)',
  );

  for (const filter of seriesFilters)
  {
    const seriesValue = filter.value;
    const label = document.querySelector(`label[for="${ filter.id }"]`);

    if (onlineSeriesSet.has(seriesValue))
    {
      filter.style.display = "";
      if (label) label.style.display = "";
    } else
    {
      filter.style.display = "none";
      if (label) label.style.display = "none";

      // If this filter was selected and now hidden, switch to "All"
      if (filter.checked)
      {
        document.querySelector("#filter-all").checked = true;
        filterTable();
      }
    }
  }
}

/**
 * Sorts the table by player count
 */
function sortTable()
{
  const table = document.querySelector(`#serverTable`);
  const rows = [
    ...table.querySelectorAll(`tr`),
  ].slice(1); // Exclude header row
  rows.sort((a, b) =>
  {
    const aPlayers = a.children[2].textContent.split(` / `)[0] || `0`;
    const bPlayers = b.children[2].textContent.split(` / `)[0] || `0`;
    return Number.parseInt(bPlayers, 10) - Number.parseInt(aPlayers, 10); // Sort in descending order
  });

  const tbody = table.querySelector(`tbody`);
  for (const row of rows) tbody.append(row); // Re-append rows in sorted order
}

/**
 * Filters the table based on the selected filters
 */
function filterTable()
{
  const seriesInput = document.querySelector(
    `input[name="series-filter"]:checked`,
  ).value;
  const table = document.querySelector(`#serverTable`);
  const rows = table.querySelectorAll(`tr`);
  const matchingRows = []; // Array to store matching servers

  const url = new URL(globalThis.location.href);

  // Save current state in the URL
  if (seriesInput === `all`)
  {
    url.searchParams.delete(`series`);
    history.replaceState(null, null, url.toString());
  } else
  {
    url.searchParams.set(`series`, seriesInput.toLowerCase());
    history.replaceState(null, null, url.toString());
  }

  for (let index = 1; index < rows.length; index++)
  {
    const row = rows[index];
    const seriesName = row.querySelectorAll(`td`)[7];
    const seriesNameTextValue = seriesName ? seriesName.textContent : ``;

    // Check if the row matches the series filter
    const matchesSeries =
      seriesInput === `all` || seriesNameTextValue.includes(seriesInput);

    // If condition is met, push the row into the matchingRows array
    if (matchesSeries) matchingRows.push(row);
  }

  // hide every row except the matching ones
  for (let index = 1; index < rows.length; index++)
    rows[index].style.display = matchingRows.includes(rows[index])
      ? ``
      : `none`;

  sortTable();
}

// Activate event listeners for filter updates
for (const radioButton of document.querySelectorAll(
  `input[name="series-filter"]`,
))
  radioButton.addEventListener(`change`, filterTable);

let password = ``;
/**
 * Shows a floating notification at the bottom of the screen
 * @param {string} message The message to display
 */
function showNotification(message)
{
  // Remove any existing notification
  const existingNotification = document.querySelector('.copy-notification');
  if (existingNotification)
  {
    existingNotification.remove();
  }

  // Create new notification
  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Show notification with animation
  setTimeout(() =>
  {
    notification.classList.add('show');
  }, 10);

  // Hide and remove notification after 3 seconds
  setTimeout(() =>
  {
    notification.classList.remove('show');
    setTimeout(() =>
    {
      if (notification.parentNode)
      {
        notification.remove();
      }
    }, 300);
  }, 3000);
}

/**
 *
 * @param {string} text The text to copy
 * @param {HTMLElement} buttonElement The button element to copy to
 */
function copyToClipboard(text, buttonElement)
{
  // Don't allow copying if button is disabled (server offline)
  if (buttonElement.disabled)
  {
    return;
  }

  const isServerPasswordProtected =
    buttonElement.parentNode.parentNode.children[0].innerHTML.includes(
      `lock.png`,
    );
  if (password === `` && isServerPasswordProtected)
  {
    passwordPrompt(buttonElement.parentNode.parentNode.children[0].children[1]);
    return;
  }
  const codeBlock = buttonElement.parentNode.parentNode.querySelector(`code`);
  const range = document.createRange();
  range.selectNodeContents(codeBlock);
  const selection = globalThis.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  navigator.clipboard.writeText(text.trim());

  // Show notification
  const serverName = buttonElement.parentNode.parentNode.children[0].textContent.trim();
  showNotification(`Copied connection string for ${ serverName }!`);

  buttonElement.textContent = `✔️`;
  buttonElement.style.opacity = 0.7;
  buttonElement.style.backgroundColor = `var(--ctp-green)`;
  buttonElement.disabled = true;
  setTimeout(() =>
  {
    buttonElement.textContent = `Copy`;
    buttonElement.style.opacity = 1;
    buttonElement.style.backgroundColor = `var(--ctp-blue)`;
    buttonElement.disabled = false;
  }, 3000);
}

/**
 * Handles clicking on a table row to copy the connection string
 * @param {HTMLElement} row The table row that was clicked
 */
function copyRowConnectionString(row)
{
  // Don't allow copying if server is offline
  if (row.classList.contains('offline-server'))
  {
    return;
  }

  const copyButton = row.querySelector('.copy-button');
  if (copyButton && !copyButton.disabled)
  {
    copyButton.click();
  }
}

/**
 * Prompts the user to enter a password for the server
 * @param {HTMLElement} row The row to check for password prompts
 */
function passwordPrompt(row)
{
  const friendlyName = row.parentNode.parentNode.children[0].textContent.trim();
  const series = row.parentNode.parentNode.children[7].textContent.trim();
  const connectString =
    row.parentNode.parentNode.children[1].textContent.trim();
  const gameName = row.parentNode.parentNode.children[8].textContent.trim();
  if (series === `minecraft` || gameName === `halo`)
  {
    // These games handle "passwords" differently (mc for example is a whitelist), while halo you enter it in another field
    password = gameName;
    copyToClipboard(
      connectString,
      row.parentNode.parentNode.children[6].children[0],
    );
    password = ``;
  } else
  {
    // All other games use a password command before connect string

    password = prompt(`Enter the password for ${ friendlyName }:`);
    if (password)
    {
      password = password.trim();
      if (
        series === `cod` ||
        series === `counterstrike` ||
        series === `halflife` ||
        gameName === `garrysmod` ||
        series === `teamfortress` ||
        series === `insurgency` ||
        series === `quake`
      )
        // games that use "password" as a command
        copyToClipboard(
          `password ${ password }; ${ connectString }`,
          row.parentNode.parentNode.children[6].children[0],
        );
      // games that dont use "password" as a command
      else
        copyToClipboard(
          `${ connectString }`,
          row.parentNode.parentNode.children[6].children[0],
        );
      password = ``;
    } else password = ``; // Cancelled
  }
}

document.addEventListener(`DOMContentLoaded`, () =>
{
  // Restore filters on refresh
  const url = new URL(globalThis.location.href);
  const series = url.searchParams.get(`series`);

  if (series)
  {
    const radioButton = document.querySelector(
      `input[name="series-filter"][value="${ series }"]`,
    );
    if (radioButton) radioButton.checked = true;
  }

  // Call filterTable to apply the filters
  filterTable();
  setInterval(filterTable, 350);

  // Initially hide mod column
  updateModColumnVisibility();

  // Set up periodic server status updates
  setInterval(refreshAllServers, REFRESH_INTERVAL_SECONDS * 1000);

  // Set up Server-Sent Events for real-time config updates
  setupServerSentEvents();
});

/**
 * Registers a server for periodic refresh tracking
 */
function registerServer(host, port, game, rowId)
{
  allServers.set(rowId, { host, port, game, rowId });

  // Store the original row template for potential recreation
  const row = document.querySelector(`#row-${ rowId }`);
  if (row)
  {
    serverRowTemplates.set(rowId, row.cloneNode(true));
  }
}

/**
 * Refreshes all server statuses without reloading the page
 */
function refreshAllServers()
{
  // Check all registered servers, including those that may be offline
  for (const serverInfo of allServers.values())
  {
    checkServerStatus(serverInfo.host, serverInfo.port, serverInfo.game, serverInfo.rowId);
  }
}

/**
 * Set up Server-Sent Events for real-time configuration updates
 */
function setupServerSentEvents() {
  console.log('[SSE] Setting up Server-Sent Events connection...');
  const eventSource = new EventSource('/events');
  
  eventSource.onopen = function() {
    console.log('[SSE] Connected to server events successfully');
    console.log('[SSE] Connection state:', eventSource.readyState);
  };
  
  eventSource.onmessage = function(event) {
    console.log('[SSE] Received message:', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('[SSE] Parsed data:', data);
      
      if (data.type === 'connected') {
        console.log('[SSE] Server confirmed connection at:', data.timestamp);
      } else if (data.type === 'config-update') {
        console.log('[SSE] Received configuration update');
        console.log('[SSE] New servers count:', Object.keys(data.servers).length);
        console.log('[SSE] Available series:', data.availableSeries);
        handleConfigurationUpdate(data);
      }
    } catch (error) {
      console.error('[SSE] Error parsing server event:', error);
      console.error('[SSE] Raw event data:', event.data);
    }
  };
  
  eventSource.onerror = function(error) {
    console.error('[SSE] Server events error:', error);
    console.error('[SSE] Connection state:', eventSource.readyState);
    console.error('[SSE] Ready states: CONNECTING=0, OPEN=1, CLOSED=2');
    
    // Automatically reconnect after 5 seconds
    setTimeout(() => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('[SSE] Attempting to reconnect...');
        setupServerSentEvents();
      }
    }, 5000);
  };
}

/**
 * Handle configuration updates from the server
 */
function handleConfigurationUpdate(data) {
  console.log('[CONFIG] Handling configuration update...');
  const { servers, availableSeries } = data;
  
  console.log('[CONFIG] Previous servers count:', allServers.size);
  console.log('[CONFIG] New servers count:', Object.keys(servers).length);
  console.log('[CONFIG] New available series:', availableSeries);
  
  // Clear existing servers tracking
  allServers.clear();
  serverRowTemplates.clear();
  onlineSeriesSet.clear();
  hasAnyMods = false;
  
  console.log('[CONFIG] Cleared existing server tracking data');
  
  // Rebuild the server table
  console.log('[CONFIG] Rebuilding server table...');
  rebuildServerTable(servers);
  
  // Update series filters
  console.log('[CONFIG] Updating series filters...');
  updateSeriesFilters(availableSeries);
  
  // Re-apply current filters
  console.log('[CONFIG] Re-applying current filters...');
  filterTable();
  
  // Update mod column visibility
  console.log('[CONFIG] Updating mod column visibility...');
  updateModColumnVisibility();
  
  // Start checking status for new servers
  console.log('[CONFIG] Starting status checks for new servers...');
  for (const [serverName, serverInfo] of Object.entries(servers)) {
    const rowId = serverName.replace(/[^a-zA-Z0-9]/g, '_');
    console.log(`[CONFIG] Registering server: ${serverName} -> ${rowId}`);
    registerServer(serverInfo.host, serverInfo.port, serverInfo.game, rowId);
    checkServerStatus(serverInfo.host, serverInfo.port, serverInfo.game, rowId);
  }
  
  console.log('[CONFIG] Configuration update completed successfully');
}

/**
 * Rebuild the entire server table with new configuration
 */
function rebuildServerTable(servers) {
  const tbody = document.querySelector('#serverTable tbody');
  tbody.innerHTML = ''; // Clear existing rows
  
  // Create new rows for each server
  for (const [serverName, serverInfo] of Object.entries(servers)) {
    const rowId = serverName.replace(/[^a-zA-Z0-9]/g, '_');
    const row = createServerRow(serverName, serverInfo, rowId);
    tbody.appendChild(row);
  }
}

/**
 * Create a new server table row
 */
function createServerRow(serverName, serverInfo, rowId) {
  const row = document.createElement('tr');
  row.id = `row-${rowId}`;
  row.className = 'offline-server';
  row.onclick = function() { copyRowConnectionString(this); };
  
  const connectString = serverInfo.manualConnectString || 
    (serverInfo.needsConnectString ? 'connect ' : '') + serverInfo.host + ':' + serverInfo.port;
  
  row.innerHTML = `
    <td class="icon-td">
      <img class="icon" alt="Game Icon" src="${serverInfo.icon}" width="32" height="32">
      ${serverInfo.password ? '<img class="icon" alt="Lock Icon" src="https://i.chse.sh/p/serverlist/lock.png" width="32" height="32" onclick="event.stopPropagation(); passwordPrompt(this)">' : ''}
      ${serverInfo.friendlyName}
    </td>
    <td id="connectString-${serverInfo.host}:${serverInfo.port}">
      <code>${connectString}</code>
    </td>
    <td><span class="offline-indicator">OFFLINE</span></td>
    <td class="hidden-mobile"></td>
    <td class="hidden-mobile"></td>
    <td class="hidden-mobile mod-column"></td>
    <td class="hidden-mobile">
      <button id="copyButton-${serverInfo.host}:${serverInfo.port}" class="copy-button" 
              onclick="event.stopPropagation(); copyToClipboard(\`\${document.getElementById('connectString-${serverInfo.host}:${serverInfo.port}').textContent}\`, this)">
        Copy
      </button>
    </td>
    <td class="hidden-row">${serverInfo.series}</td>
    <td class="hidden-row">${serverInfo.game}</td>
  `;
  
  return row;
}

/**
 * Update series filters with new available series
 */
function updateSeriesFilters(availableSeries) {
  const seriesLabels = {
    minecraft: 'Minecraft',
    counterstrike: 'Counter-Strike', 
    cod: 'Call of Duty',
    halo: 'Halo',
    halflife: 'Half-Life',
    teamfortress: 'Team Fortress',
    garrysmod: "Garry's Mod",
    insurgency: 'Insurgency',
    quake: 'Quake'
  };
  
  // Remove existing series filters (except "All")
  const existingFilters = document.querySelectorAll('input[name="series-filter"]:not(#filter-all)');
  const existingLabels = document.querySelectorAll('label:not([for="filter-all"])');
  
  existingFilters.forEach(filter => filter.remove());
  existingLabels.forEach(label => label.remove());
  
  // Add new series filters
  const filterContainer = document.querySelector('.series-filter');
  
  for (const series of availableSeries.sort()) {
    if (seriesLabels[series]) {
      const input = document.createElement('input');
      input.type = 'radio';
      input.id = `filter-${series}`;
      input.name = 'series-filter';
      input.value = series;
      input.style.display = 'none';
      input.addEventListener('change', filterTable);
      
      const label = document.createElement('label');
      label.htmlFor = `filter-${series}`;
      label.textContent = seriesLabels[series];
      label.style.display = 'none';
      
      filterContainer.appendChild(input);
      filterContainer.appendChild(label);
    }
  }
}

// Attach event listeners for filter updates
for (const radioButton of document.querySelectorAll(
  `input[name="series-filter"]`,
))
  radioButton.addEventListener(`change`, filterTable);
