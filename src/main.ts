import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// cell interface represents a grid cell with row i and column j
interface Cell {
  readonly i: number;
  readonly j: number;
}

// class that represents the grid used in the game
class boardClass {
  readonly tileWidth: number;
  readonly neighborhoodRadius: number;
  private readonly knownCells: Map<string, Cell>; // a map to store cells by their stringified key

  // constructor to initialize the board with tile width and neighborhood radius
  constructor(tileWidth: number, neighborhoodRadius: number) {
    this.tileWidth = tileWidth;
    this.neighborhoodRadius = neighborhoodRadius;
    this.knownCells = new Map<string, Cell>(); // initialize an empty map to store the cells
  }

  // retrieve a cell, if the cell hasn't been seen before, it's added to the map of known cells
  private getRealCell(cell: Cell): Cell {
    const { i, j } = cell;
    const key = [i, j].toString();
    // if the cell is not already known, add it to the map
    if (!this.knownCells.has(key)) {
      this.knownCells.set(key, { i, j });
    }
    // return the canonical (standardized) cell
    return this.knownCells.get(key)!;
  }

  // method to get the corresponding grid cell for a given point on the map (LatLng)
  getCellPoint(point: leaflet.LatLng): Cell {
    // calculate the grid cell's row i and column j based on the tile width and the point's coordinates
    const i = Math.floor(point.lat / this.tileWidth);
    const j = Math.floor(point.lng / this.tileWidth);

    return this.getRealCell({ i, j });
  }

  // method to get the boundaries of a given cell
  getBounds(cell: Cell): leaflet.LatLngBounds {
    // the bounds are determined by multiplying the row and column indices by the tile width to get the coordinates
    return leaflet.latLngBounds([
      [cell.i * this.tileWidth, cell.j * this.tileWidth],
      [(cell.i + 1) * this.tileWidth, (cell.j + 1) * this.tileWidth],
    ]);
  }

  // method to get a list of cells near a given point within a certain radius
  getNearbyCells(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const radius = this.neighborhoodRadius * this.tileWidth;

    for (let i = -radius; i <= radius; i += this.tileWidth) {
      for (let j = -radius; j <= radius; j += this.tileWidth) {
        // for each offset, calculate the nearby cell and add it to the result
        resultCells.push(this.getCellPoint(
          leaflet.latLng(point.lat + i, point.lng + j), // calculate the nearby point and convert it to a cell
        ));
      }
    }

    // return the list of nearby cells
    return resultCells;
  }
}

interface Coin {
  i: number;
  j: number;
  serial: number;
}

// establish game title, various grid variables that will be used later on
const gameTitle = "Geocoin Carrier";
const location = leaflet.latLng(36.98949379578401, -122.06277128548504);
const zoom = 19;
const tileSize = 1e-4;
const gridSteps = 8;
const cacheSpawnRate = 0.1;
const neighborhoodBoard = new boardClass(tileSize, gridSteps);
document.title = gameTitle;

// necessary UI information, status panel, header
const header = document.createElement("h1");
header.textContent = gameTitle;
header.style.textAlign = "center";
document.body.insertBefore(header, document.body.firstChild);
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

const playerCoins: Coin[] = [];
const inventory = document.createElement("p");
inventory.innerHTML = "COIN INVENTORY: <div id=coins></div>";
statusPanel.append(inventory);

const map = leaflet.map(document.getElementById("map")!, {
  center: location,
  zoom: zoom,
  zoomControl: true,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: zoom,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const mapContainer = document.createElement("div");
mapContainer.style.position = "relative";
mapContainer.style.width = "100%";
mapContainer.style.height = "80vh";
document.body.appendChild(mapContainer);

mapContainer.appendChild(document.getElementById("map")!);

if (statusPanel) {
  mapContainer.appendChild(statusPanel);
}

const playerMarker = leaflet.marker(location).bindTooltip("You are here");
playerMarker.addTo(map);

// player class, retrieve movement, update player location
class Player {
  lat: number = location.lat;
  lng: number = location.lng;

  move(direction: string) {
    const moveStep = tileSize;
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
    updatePlayerLocation(this.lat, this.lng);
    refreshCaches();
  }
}

// maintain player location and save state
function updatePlayerLocation(lat: number, lng: number) {
  player.lat = lat;
  player.lng = lng;
  playerMarker.setLatLng([lat, lng]);
  pathHistory.push(leaflet.latLng(lat, lng));
  playerPath.setLatLngs(pathHistory);
  map.panTo([lat, lng]);
  saveGameState();
}

const player = new Player();
const cacheStates = new Map<string, string>();

let isTrackingActive = false;
let geoWatchId: number | null = null;
const pathHistory: leaflet.LatLng[] = [];
const playerPath = leaflet.polyline(pathHistory, { color: "red" }).addTo(map);

// geolocation management
function toggleTracking() {
  if (!isTrackingActive) {
    isTrackingActive = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        updatePlayerLocation(
          position.coords.latitude,
          position.coords.longitude,
        );
      });
      geoWatchId = navigator.geolocation.watchPosition((position) => {
        updatePlayerLocation(
          position.coords.latitude,
          position.coords.longitude,
        );
      });
    } else {
      alert("Geolocation is not supported on this browser.");
    }
  } else {
    isTrackingActive = false;
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
    }
  }
}

// stores to local storage to preserve game state
function saveGameState() {
  const state = {
    playerPosition: { lat: player.lat, lng: player.lng },
    path: pathHistory.map((latlng) => [latlng.lat, latlng.lng]),
    collectedCoins: playerCoins,
  };
  localStorage.setItem("gameState", JSON.stringify(state));
}

// gets item from local storage to restore game state data
function loadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const { playerPosition, path, collectedCoins } = JSON.parse(savedState);
    player.lat = playerPosition.lat;
    player.lng = playerPosition.lng;
    pathHistory.push(
      ...path.map(([lat, lng]: [number, number]) => leaflet.latLng(lat, lng)),
    );
    playerCoins.push(...collectedCoins);
    playerMarker.setLatLng([player.lat, player.lng]);
    playerPath.setLatLngs(pathHistory);
    refreshCaches();
  }
}

// will load state upon initialization
loadGameState();

// reset game state
function resetGameState() {
  if (
    prompt("Reset the game state? Type and enter 'yes' to proceed.") === "yes"
  ) {
    localStorage.removeItem("gameState");
    playerCoins.length = 0;
    pathHistory.length = 0;
    playerPath.setLatLngs([]);
    player.lat = location.lat;
    player.lng = location.lng;
    playerMarker.setLatLng(location);
    refreshCaches();
    saveGameState();
  }
}

// create caches and mememtoes
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

// function to properly collect coin if length suffices
function collectCoin(cacheCoins: Coin[]) {
  if (cacheCoins.length > 0) {
    const coin = cacheCoins.shift();
    playerCoins.push(coin!);
  }
}

// function to properly deposit coin if length suffices
function depositCoin(cacheCoins: Coin[]) {
  if (playerCoins.length > 0) {
    const coin = playerCoins.pop();
    cacheCoins.unshift(coin!);
  }
}

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
      coordinates: ${i}, ${j}. current tokens: <span id="value">${cache.tokens.length}</span>
      <button id="collect">collect</button>
      <button id="deposit">deposit</button>
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
    if (luck([cell.i, cell.j].toString()) < cacheSpawnRate) {
      spawnCache(cell.i, cell.j, neighborhoodBoard.getBounds(cell));
    }
  }
}

// movement control buttons
const movementPanel = document.createElement("div");
movementPanel.style.position = "absolute";
movementPanel.style.top = "-50px";
movementPanel.style.left = "10px";
movementPanel.style.zIndex = "1000";
mapContainer.appendChild(movementPanel);

// create player directions and symbols to pair with them
const directionMap = {
  north: "⬆️",
  south: "⬇️",
  east: "➡️",
  west: "⬅️",
} as const;

// geolocation button
const geoButton = document.createElement("button");
geoButton.textContent = "🌐";
geoButton.style.margin = "5px";
geoButton.addEventListener("click", toggleTracking);
movementPanel.appendChild(geoButton);

// button to reset game state
const resetButton = document.createElement("button");
resetButton.textContent = "🚮";
resetButton.style.margin = "5px";
resetButton.addEventListener("click", resetGameState);
movementPanel.appendChild(resetButton);

// foe each direction key, add a click listener
Object.keys(directionMap).forEach((direction) => {
  const dirKey = direction as keyof typeof directionMap;
  const button = document.createElement("button");
  button.textContent = directionMap[dirKey];
  button.style.margin = "2px";
  button.addEventListener("click", () => player.move(dirKey));
  movementPanel.appendChild(button);
});
