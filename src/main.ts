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

const oakesClassroom = leaflet.latLng(36.98949379578401, -122.06277128548504);
const map = document.querySelector<HTMLDivElement>("#map")!;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;

const zoom = 19;

// map
const gameMap = leaflet.map(map, {
  center: oakesClassroom,
  zoom: zoom,
  zoomControl: true,
});

// load tiles
leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(gameMap);

// player marker
leaflet.marker(oakesClassroom).addTo(gameMap);
let score = 0;
statusPanel.textContent = "0 points";

const TILE_SIZE = 1e-4;

// create caches and enable player interaction
function createCache(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [oakesClassroom.lat + i * TILE_SIZE, oakesClassroom.lng + j * TILE_SIZE],
    [
      oakesClassroom.lat + (i + 1) * TILE_SIZE,
      oakesClassroom.lng + (j + 1) * TILE_SIZE,
    ],
  ]);
  const cacheRectangle = leaflet.rectangle(bounds).addTo(gameMap);
  const cacheNumber = Math.floor(luck([i, j, "initialValue"].toString()) * 100);
  // click on rectangle
  cacheRectangle.on(
    "click",
    () => handleCacheInteraction(i, j, cacheNumber, cacheRectangle),
  );
}

// player click to collect/deposit from caches
function handleCacheInteraction(
  x: number,
  y: number,
  value: number,
  rectangle: leaflet.Rectangle,
) {
  // setup container stats
  const popupContent =
    `Position: ${x},${y} <div> <span id="value">${value}</span> points
    <button id="collect">Collect</button>
    <button id="deposit">Deposit</button>`;
  const container = document.createElement("div");
  container.innerHTML = popupContent;
  const collect = container.querySelector<HTMLButtonElement>("#collect")!;
  const deposit = container.querySelector<HTMLButtonElement>("#deposit")!;
  const number = container.querySelector<HTMLSpanElement>("#value")!;

  // make container stats pop up
  rectangle.bindPopup(container).openPopup();

  // collect button
  collect.addEventListener("click", () => {
    if (value > 0) {
      value -= 1;
      score += 1;
      number.textContent = value.toString();
      statusPanel.textContent = `${score} points`;
    }
  });
  // deposit button
  deposit.addEventListener("click", () => {
    if (score > 0) {
      value += 1;
      score -= 1;
      number.textContent = value.toString();
      statusPanel.textContent = `${score} points`;
    }
  });
}

const spawnRadius = 10;
const spawnRate = 0.05;

// generate caches and add values
for (let i = -1 * spawnRadius; i <= spawnRadius; i++) {
  for (let j = -1 * spawnRadius; j <= spawnRadius; j++) {
    if (Math.random() < spawnRate) {
      createCache(i, j);
    }
  }
}
