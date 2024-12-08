import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// Cell interface represents a grid cell with row i and column j
interface Cell {
  readonly i: number;
  readonly j: number;
}

// Class that represents the grid used in the game
class boardClass {
  readonly tileWidth: number;
  readonly neighborhoodRadius: number;
  private readonly knownCells: Map<string, Cell>; // A map to store cells by their stringified key

  // Constructor to initialize the board with tile width and neighborhood radius
  constructor(tileWidth: number, neighborhoodRadius: number) {
    this.tileWidth = tileWidth;
    this.neighborhoodRadius = neighborhoodRadius;
    this.knownCells = new Map<string, Cell>(); // Initialize an empty map to store the cells
  }

  // Retrieve a cell, if the cell hasn't been seen before, it's added to the map of known cells
  private getRealCell(cell: Cell): Cell {
    const { i, j } = cell;
    const key = [i, j].toString();
    // If the cell is not already known, add it to the map
    if (!this.knownCells.has(key)) {
      this.knownCells.set(key, { i, j });
    }
    // Return the canonical (standardized) cell
    return this.knownCells.get(key)!;
  }

  // Method to get the corresponding grid cell for a given point on the map (LatLng)
  getCellPoint(point: leaflet.LatLng): Cell {
    // Calculate the grid cell's row (i) and column (j) based on the tile width and the point's coordinates
    const i = Math.floor(point.lat / this.tileWidth);
    const j = Math.floor(point.lng / this.tileWidth);

    return this.getRealCell({ i, j });
  }

  // Method to get the boundaries of a given cell in the form of LatLngBounds
  getBounds(cell: Cell): leaflet.LatLngBounds {
    // The bounds are determined by multiplying the row and column indices by the tile width to get the coordinates
    return leaflet.latLngBounds([
      [cell.i * this.tileWidth, cell.j * this.tileWidth],
      [(cell.i + 1) * this.tileWidth, (cell.j + 1) * this.tileWidth],
    ]);
  }

  // Method to get a list of cells near a given point within a certain radius
  getNearbyCells(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const radius = this.neighborhoodRadius * this.tileWidth;

    for (let i = -radius; i <= radius; i += this.tileWidth) {
      for (let j = -radius; j <= radius; j += this.tileWidth) {
        // For each offset, calculate the nearby cell and add it to the result
        resultCells.push(this.getCellPoint(
          leaflet.latLng(point.lat + i, point.lng + j), // Calculate the nearby point's LatLng and convert it to a cell
        ));
      }
    }

    // Return the list of nearby cells
    return resultCells;
  }
}

// The information contained in a coin
interface Coin {
  i: number;
  j: number;
  serial: number;
}

const GAME_NAME = "Geocoin Carrier";
document.title = GAME_NAME;

// Create and append the header to the top of the document body
const header = document.createElement("h1");
header.textContent = GAME_NAME;
header.style.textAlign = "center"; // Center the title
document.body.insertBefore(header, document.body.firstChild); // Insert at the top

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

const HQ_LOCATION = leaflet.latLng(36.98949379578401, -122.06277128548504);
const ZOOM_LEVEL = 19;
const TILE_SIZE = 1e-4;
const GRID_STEPS = 8;
const CACHE_SPAWN_CHANCE = 0.1;

const playerCoins: Coin[] = [];
const coinDisplay = document.createElement("p");
coinDisplay.innerHTML = "Backpack: <div id=coins></div>";
statusPanel.append(coinDisplay);

const neighborhoodBoard = new boardClass(TILE_SIZE, GRID_STEPS);

const map = leaflet.map(document.getElementById("map")!, {
  center: HQ_LOCATION,
  zoom: ZOOM_LEVEL,
  zoomControl: true,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: ZOOM_LEVEL,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const playerMarker = leaflet.marker(HQ_LOCATION).bindTooltip("You are here");
playerMarker.addTo(map);

// Player Class for Movement
class Player {
  lat: number = HQ_LOCATION.lat;
  lng: number = HQ_LOCATION.lng;

  // switch cases that handle movement
  move(direction: string) {
    const moveStep = TILE_SIZE;
    switch (direction) {
      case "north":
        this.lat += moveStep;
        break;
      case "south":
        this.lat -= moveStep;
        break;
      case "east":
        this.lng += moveStep;
        break;
      case "west":
        this.lng -= moveStep;
        break;
    }
    playerMarker.setLatLng([this.lat, this.lng]);
    refreshCaches();
  }
}

const player = new Player();
const cacheStates = new Map<string, string>();

// Cache and Memento Creation
function createCache(
  i: number,
  j: number,
): {
  tokens: Coin[];
  memento: { toMemento(): string; fromMemento(memento: string): void };
} {
  const tokens: Coin[] = Array.from({
    length: Math.floor(luck([i, j].toString()) * 100),
  }, (_, serial) => ({ i, j, serial }));

  return {
    tokens,
    memento: {
      toMemento() {
        return JSON.stringify(tokens);
      },
      fromMemento(memento: string) {
        tokens.splice(0, tokens.length, ...JSON.parse(memento));
      },
    },
  };
}

// spawn interactable caches with coin count
function spawnCache(i: number, j: number, bounds: leaflet.LatLngBounds) {
  const cache = createCache(i, j);
  const cacheKey = `${i},${j}`;
  if (cacheStates.has(cacheKey)) {
    cache.memento.fromMemento(cacheStates.get(cacheKey)!);
  }

  const rect = leaflet.rectangle(bounds).addTo(map);
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      Cache at ${i}, ${j}. Tokens available: <span id="value">${cache.tokens.length}</span>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
      <div id="coins"></div>`;
    updateCoinCounter(cache.tokens, popupDiv);

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        collectCoin(cache.tokens);
        updateCoinCounter(cache.tokens, popupDiv);
      },
    );
    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        depositCoin(cache.tokens);
        updateCoinCounter(cache.tokens, popupDiv);
      },
    );

    return popupDiv;
  });

  cacheStates.set(cacheKey, cache.memento.toMemento());
}

function collectCoin(cacheCoins: Coin[]) {
  if (cacheCoins.length > 0) {
    const coin = cacheCoins.shift();
    playerCoins.push(coin!);
  }
}

function depositCoin(cacheCoins: Coin[]) {
  if (playerCoins.length > 0) {
    const coin = playerCoins.pop();
    cacheCoins.unshift(coin!);
  }
}

function updateCoinCounter(cacheCoins: Coin[], popupDiv: HTMLDivElement) {
  const availableCoinsDiv = popupDiv.querySelector<HTMLDivElement>("#coins")!;
  availableCoinsDiv.innerHTML = "";
  cacheCoins.slice(0, 5).forEach((coin) => {
    availableCoinsDiv.innerHTML += `${coin.i}:${coin.j}#${coin.serial}</br>`;
  });

  // Update the token count in the popup
  const valueSpan = popupDiv.querySelector<HTMLSpanElement>("#value")!;
  valueSpan.textContent = cacheCoins.length.toString();

  // Update player's inventory display in status panel
  const inventoryCoinsDiv = statusPanel.querySelector<HTMLDivElement>(
    "#coins",
  )!;
  inventoryCoinsDiv.innerHTML = "";
  playerCoins.forEach((coin) => {
    inventoryCoinsDiv.innerHTML += `${coin.i}:${coin.j}#${coin.serial}</br>`;
  });
}

function refreshCaches() {
  map.eachLayer((layer: leaflet.Layer) => {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer);
    }
  });
  const nearbyCells = neighborhoodBoard.getNearbyCells(
    leaflet.latLng(player.lat, player.lng),
  );
  for (const cell of nearbyCells) {
    if (luck([cell.i, cell.j].toString()) < CACHE_SPAWN_CHANCE) {
      spawnCache(cell.i, cell.j, neighborhoodBoard.getBounds(cell));
    }
  }
}

// Create movement control buttons
const movementPanel = document.createElement("div");
movementPanel.style.textAlign = "center";
document.body.appendChild(movementPanel);

// Create a mapping between directions and their corresponding arrow symbols
const directionMap = {
  north: "⬆️",
  south: "⬇️",
  east: "➡️",
  west: "⬅️",
} as const;

Object.keys(directionMap).forEach((direction) => {
  const dirKey = direction as keyof typeof directionMap; // Assert the type here
  const button = document.createElement("button");
  button.textContent = directionMap[dirKey]; // No error here
  button.addEventListener("click", () => player.move(dirKey));
  movementPanel.appendChild(button);
});
