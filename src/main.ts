// todo

// libraries
import leaflet from "leaflet";
import luck from "./luck.ts";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";

// establishing variables
const title = "Geocoin Carrier";
document.title = title;

// create header
const header = document.createElement("h1");
header.textContent = title;
header.style.textAlign = "center"; // Center title
document.body.insertBefore(header, document.body.firstChild);

// Element references
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
const coinDisplay = document.createElement("p");
coinDisplay.innerHTML = "Backpack: <div id=coins></div>";
statusPanel.append(coinDisplay);

// Map settings
const oakes = leaflet.latLng(36.98949379578401, -122.06277128548504);
const zoom = 19;
const tileSize = 1e-4;
const gridSize = 8;
const spawnChance = 0.1;

// Player data
const playerCoins: Coin[] = [];

// Cell interface
interface Cell {
  readonly i: number;
  readonly j: number;
}

// Map initialization
const map = leaflet.map(document.getElementById("map")!, {
  center: oakes,
  zoom: zoom,
  zoomControl: true,
});

// load tiles
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

// Player marker
const playerMarker = leaflet.marker(oakes).bindTooltip("You are here");
playerMarker.addTo(map);

// Coin interface
interface Coin {
  i: number;
  j: number;
  serial: number;
}

// Board logic integrated
const knownCells: Map<string, Cell> = new Map();

// Function to get a canonical cell, either new or cached
function getNewCell(cell: Cell): Cell {
  const { i, j } = cell;
  const key = [i, j].toString();
  if (!knownCells.has(key)) {
    knownCells.set(key, { i, j });
  }
  return knownCells.get(key)!;
}

// Function to get the cell for a given point on the map
function getCellPoint(point: leaflet.LatLng): Cell {
  const i = Math.floor(point.lat / tileSize);
  const j = Math.floor(point.lng / tileSize);
  return getNewCell({ i, j });
}

// Function to get the bounds of a given cell
function getCellBounds(cell: Cell): leaflet.LatLngBounds {
  return leaflet.latLngBounds([
    [cell.i * tileSize, cell.j * tileSize],
    [(cell.i + 1) * tileSize, (cell.j + 1) * tileSize],
  ]);
}

// Function to get the neighboring cells of a given point
function getCellsNearPoint(point: leaflet.LatLng): Cell[] {
  const resultCells: Cell[] = [];
  const radius = gridSize * tileSize;
  for (let i = -radius; i <= radius; i += tileSize) {
    for (let j = -radius; j <= radius; j += tileSize) {
      resultCells.push(getCellPoint(
        leaflet.latLng(point.lat + i, point.lng + j),
      ));
    }
  }
  return resultCells;
}

// Function to spawn a cache at given grid coordinates
function spawnCache(i: number, j: number, bounds: leaflet.LatLngBounds) {
  const rect = leaflet.rectangle(bounds).addTo(map);
  const coinsInCache = generateCacheCoins(i, j);

  rect.bindPopup(() => {
    const popupContent = createPopupContent(coinsInCache);
    return popupContent;
  });
}

// Function to generate a random number of coins for a cache
function generateCacheCoins(i: number, j: number): Coin[] {
  const coinCount = Math.floor(luck([i, j, "iniValue"].toString()) * 100);
  return Array.from({ length: coinCount }, (_, serial) => ({ i, j, serial }));
}

// Function to create the popup content for a cache
function createPopupContent(cacheCoins: Coin[]): HTMLDivElement {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div>coordinates: ${cacheCoins[0].i}, ${
    cacheCoins[0].j
  }, tokens: <span id="value">${cacheCoins.length}</span></div>
    <button id="collect">Collect</button>
    <button id="deposit">Deposit</button>
    <div id="coins"></div>`;

  updateCoinDisplay(cacheCoins, popupDiv);
  addPopupListeners(cacheCoins, popupDiv);
  return popupDiv;
}

// Update the coin count and player's backpack display
function updateCoinDisplay(cacheCoins: Coin[], popupDiv: HTMLDivElement) {
  const availableCoinsDiv = popupDiv.querySelector<HTMLDivElement>("#coins")!;
  availableCoinsDiv.innerHTML = "";
  cacheCoins.slice(0, 5).forEach((coin) => {
    availableCoinsDiv.innerHTML += `${coin.i}:${coin.j}#${coin.serial}</br>`;
  });

  const valueSpan = popupDiv.querySelector<HTMLSpanElement>("#value")!;
  valueSpan.textContent = cacheCoins.length.toString();

  const inventoryCoinsDiv = statusPanel.querySelector<HTMLDivElement>(
    "#coins",
  )!;
  inventoryCoinsDiv.innerHTML = "";
  playerCoins.forEach((coin) => {
    inventoryCoinsDiv.innerHTML += `${coin.i}:${coin.j}#${coin.serial}</br>`;
  });
}

// Event listeners for collect and deposit buttons
function addPopupListeners(cacheCoins: Coin[], popupDiv: HTMLDivElement) {
  popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
    "click",
    () => {
      collectCoin(cacheCoins);
      updateCoinDisplay(cacheCoins, popupDiv);
    },
  );

  popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
    "click",
    () => {
      depositCoin(cacheCoins);
      updateCoinDisplay(cacheCoins, popupDiv);
    },
  );
}

// Function to collect a coin from a cache
function collectCoin(cacheCoins: Coin[]) {
  if (cacheCoins.length > 0) {
    const coin = cacheCoins.shift();
    playerCoins.push(coin!);
  }
}

// Function to deposit a coin to a cache
function depositCoin(cacheCoins: Coin[]) {
  if (playerCoins.length > 0) {
    const coin = playerCoins.pop();
    cacheCoins.unshift(coin!);
  }
}

// Randomly spawn caches in the nearby grid cells
function spawnCaches() {
  const nearbyCells = getCellsNearPoint(oakes);
  nearbyCells.forEach((cell) => {
    if (luck([cell.i, cell.j].toString()) < spawnChance) {
      spawnCache(cell.i, cell.j, getCellBounds(cell));
    }
  });
}

// Call function to spawn caches
spawnCaches();
