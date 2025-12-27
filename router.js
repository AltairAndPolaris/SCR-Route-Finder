/* =======================
   PARSE route.txt
======================= */
const DEFAULT_OPERATOR_PRICES = {
    CN: 5,
    MT: 3,
    WL: 7,
    AL: 10,
    EX: 15
};
const ROUTE_INDEX = new Map();

function parseRouteFile(text) {
    
    const graph = new Map();
    const stations = new Set();
    const operators = new Set();

    function addEdge(from, to, route, operator, time) {
        if (!graph.has(from)) graph.set(from, []);
        graph.get(from).push({ to, route, operator, time });
    }

    const routes = text.split("//").filter(r => r.trim());

    for (const r of routes) {
        const [operator, routeId, stationPart] = r.split("/");
        operators.add(operator);

        const list = stationPart.split(";").map(s => {
            const [name, t] = s.split(",");
            return { name, time: Number(t) };
        });

        /* === BUILD ROUTE INDEX (ORDERED STOPS) === */
        ROUTE_INDEX.set(routeId, {
            operator,
            stations: list.map(x => x.name)
        });

        for (let i = 0; i < list.length - 1; i++) {
            const a = list[i];
            const b = list[i + 1];
            const dt = b.time - a.time;

            addEdge(a.name, b.name, routeId, operator, dt);
            addEdge(b.name, a.name, routeId, operator, dt);

            stations.add(a.name);
            stations.add(b.name);
        }
    }

    return { graph, stations: [...stations].sort(), operators: [...operators].sort() };
}


/* =======================
   PRIORITY QUEUE
======================= */

class PriorityQueue {
    constructor(compare) {
        this.data = [];
        this.compare = compare;
    }
    push(x) {
        this.data.push(x);
        this.data.sort(this.compare);
    }
    pop() {
        return this.data.shift();
    }
    get size() {
        return this.data.length;
    }
}

/* =======================
   PATHFINDING
======================= */

function findPath(graph, from, to, mode, pricing) {
    const TRANSFER_PENALTY = 5;

    const pq = new PriorityQueue((a, b) => {
        if (mode === "direct") {
            if (a.transfers !== b.transfers)
                return a.transfers - b.transfers;
            return a.time - b.time;
        }
        if (mode === "cheap") {
            if (a.cost !== b.cost) return a.cost - b.cost;
            return a.time - b.time;  // tie-breaker: prefer faster
        }
        return (a.time + a.transfers * TRANSFER_PENALTY) -
               (b.time + b.transfers * TRANSFER_PENALTY);
    });

    const best = new Map();

    for (const e of graph.get(from) || []) {
        const s = {
            station: from,
            route: e.route,
            operator: e.operator,
            time: 0,
            transfers: 0,
            cost: 0,
            path: []
        };
        best.set(from + "|" + e.route, s);
        pq.push(s);
    }

    while (pq.size) {
        const cur = pq.pop();
        if (cur.station === to) return cur;

        for (const e of graph.get(cur.station) || []) {
            const transfer = cur.route && e.route !== cur.route;
            const next = {
                station: e.to,
                route: e.route,
                operator: e.operator,
                time: cur.time + e.time,
                transfers: cur.transfers + (transfer ? 1 : 0),
                cost: cur.cost + (pricing[e.operator] || 0),
                path: cur.path.concat({
                    from: cur.station,
                    to: e.to,
                    route: e.route,
                    operator: e.operator,
                    time: e.time,
                    transfer
                })
            };

            const key = e.to + "|" + e.route;
            const prev = best.get(key);

            let better = false;
            if (!prev) {
                better = true;
            } else if (mode === "direct") {
                // For direct mode: fewer transfers wins, then faster time
                better = next.transfers < prev.transfers ||
                         (next.transfers === prev.transfers && next.time < prev.time);
            } else if (mode === "cheap") {
                // For cheap mode: lower cost wins, then faster time
                better = next.cost < prev.cost ||
                         (next.cost === prev.cost && next.time < prev.time);
            } else {
                // For balanced mode: use combined score
                better = (next.time + next.transfers * TRANSFER_PENALTY) <
                         (prev.time + prev.transfers * TRANSFER_PENALTY);
            }

            if (better) {
                best.set(key, next);
                pq.push(next);
            }
        }
    }
    return null;
}


function findEquivalentRoutesForSegment(segment) {
    const refStops = segment.stations.join(">");
    const result = [];

    for (const [routeId, info] of ROUTE_INDEX.entries()) {
        if (info.operator !== segment.operator) continue;

        const i = info.stations.indexOf(segment.from);
        const j = info.stations.indexOf(segment.to);
        if (i < 0 || j <= i) continue;

        const slice = info.stations.slice(i, j + 1).join(">");
        if (slice === refStops) {
            result.push(routeId);
        }
    }

    return result;
}

// =======================
// PARSE trains.txt (single-line, multiple trains separated by semicolons)
// =======================
let TRAINS = [];

fetch("trains.txt")
  .then(r => r.text())
  .then(text => {
    text = text.trim().replace(/;$/, "");

    // Split by semicolon to get each train
    const entries = text.split(";").filter(e => e.trim());

    TRAINS = entries.map(entry => {
      const [trainClass, operator, type, formation] = entry.split(",");
      return { class: trainClass, operator, type, formation };
    });

    console.log("Parsed trains:", TRAINS);
  })
  .catch(err => {
    console.error("Failed to load trains.txt", err);
  });


function calculateTrainLength(formation) {
    const parts = formation.split("+").map(Number);

    // HST: power cars at both ends
    if (
        parts.length === 3 &&
        parts[0] === 1 &&
        parts[2] === 1
    ) {
        return parts.reduce((a, b) => a + b, 0);
    }

    // FLIRT / middle power unit
    if (
        parts.length === 3 &&
        parts[1] === 1
    ) {
        return parts[0] + parts[2];
    }

    // Default
    return parts.reduce((a, b) => a + b, 0);
}

/* =======================
   UI
======================= */

let GRAPH, OPERATORS, STATION_NAMES;

// Load station names first
fetch("station.txt")
    .then(r => r.text())
    .then(text => {
        STATION_NAMES = {};
        const entries = text.split("/").filter(e => e.trim());
        entries.forEach(entry => {
            const [code, name] = entry.split(";");
            if (code && name) {
                STATION_NAMES[code.trim()] = name.trim();
            }
        });
        
        // Then load routes
        return fetch("route.txt");
    })
    .then(r => r.text())
    .then(text => {
        const { graph, stations, operators } = parseRouteFile(text);
        GRAPH = graph;
        OPERATORS = operators;

        const from = document.getElementById("from");
        const to = document.getElementById("to");

        stations.forEach(s => {
            const displayName = STATION_NAMES[s] ? `${s} - ${STATION_NAMES[s]}` : s;
            from.add(new Option(displayName, s));
            to.add(new Option(displayName, s));
        });

        const pricingDiv = document.getElementById("pricing");
        operators.forEach(op => {
            const defaultPrice = DEFAULT_OPERATOR_PRICES[op] ?? 10;
        
            pricingDiv.innerHTML += `
                <div class="pricing-item">
                    <label class="operator-badge operator-${op}">${op}</label>
                    <input
                        type="number"
                        id="price_${op}"
                        value="${defaultPrice}"
                        min="0"
                    >
                </div>
            `;
        });

    })
    .catch(err => {
        document.body.innerHTML = `
            <div class="container">
                <div class="card">
                    <h2 style="color: #e74c3c;">❌ Failed to load data files</h2>
                    <p>Make sure route.txt and station.txt are in the same directory.</p>
                    <p style="color: #999; font-size: 0.9rem;">${err.message}</p>
                </div>
            </div>
        `;
        console.error(err);
    });

function compute() {
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;

    if (!from || !to) {
        alert("Please select both departure and arrival stations");
        return;
    }

    const pricing = {};
    OPERATORS.forEach(op => {
        pricing[op] = Number(document.getElementById("price_" + op).value);
    });

    const out = document.getElementById("output");
    out.innerHTML = "";

    render("Balanced Route", findPath(GRAPH, from, to, "balanced", pricing), "#667eea");
    render("Most Direct Route", findPath(GRAPH, from, to, "direct", pricing), "#2ecc71");
    render("Cheapest Route", findPath(GRAPH, from, to, "cheap", pricing), "#f39c12");
}
function extractSegments(path) {
    const segments = [];
    let current = null;

    for (const step of path) {
        if (!current || step.transfer) {
            if (current) segments.push(current);
            current = {
                route: step.route,
                operator: step.operator,
                from: step.from,
                to: step.to,
                stations: [step.from, step.to],
                steps: [step],   // store actual steps for timing
                time: step.time  // initialize time
            };
        } else {
            current.to = step.to;
            current.stations.push(step.to);
            current.steps.push(step);
            current.time += step.time;  // accumulate time
        }
    }

    if (current) segments.push(current);
    return segments;
}

function render(title, r, color) {
    const out = document.getElementById("output");

    if (!r) {
        out.innerHTML += `
            <div class="route-card" style="border-left-color: ${color}">
                <h3>${title}</h3>
                <div class="no-route">No route found</div>
            </div>`;
        return;
    }

    const getDisplayName = c =>
        STATION_NAMES[c] ? `${c} - ${STATION_NAMES[c]}` : c;

    let html = `
        <div class="route-card" style="border-left-color: ${color}">
            <h3>${title}</h3>

            <div class="route-stats">
                <div class="stat"><span class="stat-label">⏱️</span>${r.time} min</div>
                <div class="stat"><span class="stat-label">🔄</span>${r.transfers}</div>
                <div class="stat"><span class="stat-label">💵</span>${r.cost}</div>
            </div>

            <div class="route-path">
    `;

    const segments = extractSegments(r.path);

    segments.forEach((seg, idx) => {
        if (idx > 0) {
            html += `<div class="transfer-badge">Transfer</div>`;
        }
    
        const stopId = `stops_${title}_${idx}`.replace(/\s+/g, "_");
    
        // Find equivalent routes
        const equivalents = findEquivalentRoutesForSegment(seg)
            .filter(id => id !== seg.route);
    
        html += `
            <div class="route-step">
                <div class="step-icon"></div>
                <div class="step-details">
                    <!-- Block for main segment info -->
                    <div class="segment-main">
                        <span class="step-stations">
                            ${getDisplayName(seg.from)} → ${getDisplayName(seg.to)}
                        </span>
                        <span class="operator-badge operator-${seg.operator}" data-from="${seg.from}" data-to="${seg.to}">${seg.route}</span>
                        ${equivalents.map(id => `<span class="operator-badge operator-${seg.operator}" data-from="${seg.from}" data-to="${seg.to}">${id}</span>`).join("")}
                        <span class="step-time">${seg.time || ""} min</span>
                    </div>
            
                    <!-- Block for toggle and stops -->
                    <div class="segment-container">
                        <div class="segment-toggle"
                             onclick="document.getElementById('${stopId}').classList.toggle('hidden')">
                             ▼ Show all stops (${seg.stations.length})
                        </div>
                        <div id="${stopId}" class="segment-stops hidden">
                            ${seg.stations.map(s => `<div>${getDisplayName(s)}</div>`).join("")}
                        </div>
                    </div>
                </div>
            </div>

        `;
    });
    html += `</div></div>`; // closes route-path and route-card
    out.innerHTML += html;
}

// Single event listener for operator badges
document.getElementById("output").addEventListener("click", e => {
    if (e.target.classList.contains("operator-badge")) {
        const routeId = e.target.textContent.trim();
        const fromStation = e.target.getAttribute("data-from");
        const toStation = e.target.getAttribute("data-to");
        
        if (fromStation && toStation) {
            showServiceMap(routeId, fromStation, toStation);
        } else {
            showServiceMap(routeId);
        }
        e.stopPropagation();
    }
});

document.getElementById("output").addEventListener("click", e => {
    if (e.target.classList.contains("operator-badge")) {
        const routeId = e.target.textContent.trim();
        showServiceMap(routeId);
        e.stopPropagation();
    }
});

// Add global click listener to close popup when clicking outside or on close button
document.addEventListener("click", e => {
    const popup = document.getElementById("service-map-popup");
    if (!popup) return;
    
    // Close if clicking outside the popup or on the popup itself (for the X button)
    if (!e.target.closest(".service-line") || e.target.classList.contains("service-map-popup")) {
        popup.remove();
    }
});

function showServiceMap(routeId, fromStation, toStation) {
    const route = ROUTE_INDEX.get(routeId);
    if (!route) return alert("Route not found");

    // Get operator color
    const operatorColors = {
        CN: '#0096EE',
        MT: '#EE4044',
        WL: '#002D5F',
        AL: '#EC7D33',
        EX: '#FF0080'
    };
    const operatorColor = operatorColors[route.operator] || '#667eea';

    // Find the indices of from and to stations
    const fromIdx = route.stations.indexOf(fromStation);
    const toIdx = route.stations.indexOf(toStation);
    
    // Determine the range (handle both directions)
    const startIdx = Math.min(fromIdx, toIdx);
    const endIdx = Math.max(fromIdx, toIdx);

    // Remove existing popup
    let existing = document.getElementById("service-map-popup");
    if (existing) existing.remove();

    // Create popup container
    const container = document.createElement("div");
    container.id = "service-map-popup";
    container.className = "service-map-popup";

    // Add click handler to close
    container.addEventListener("click", function(e) {
        if (e.target === container) {
            container.remove();
        }
    });

    // Create close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.className = "popup-close-btn";
    closeBtn.style.cssText = "position: absolute; top: 1rem; right: 1rem; z-index: 10001; background: #f7fafc; border: 2px solid #e2e8f0; border-radius: 50%; width: 2.5rem; height: 2.5rem; cursor: pointer; font-size: 1.5rem;";
    
    closeBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        container.remove();
    });

    container.appendChild(closeBtn);

    // Create line container
    const lineContainer = document.createElement("div");
    lineContainer.className = "service-line";

    route.stations.forEach((station, idx) => {
        const isBranch = station.endsWith(">") || station.endsWith("<");

        const dotWrapper = document.createElement("div");
        dotWrapper.className = "station-wrapper";

        const dot = document.createElement("div");
        dot.className = "station-dot" + (isBranch ? " branch" : "");
        
        // Determine color based on position in journey
        let dotColor = operatorColor;
        
        console.log(`Station ${station} (idx ${idx}): fromIdx=${fromIdx}, toIdx=${toIdx}, startIdx=${startIdx}, endIdx=${endIdx}`);
        
        if (fromIdx >= 0 && toIdx >= 0) {
            if (idx === fromIdx) {
                dotColor = '#2ecc71'; // Green for boarding
                dot.style.boxShadow = '0 0 0 4px rgba(46, 204, 113, 0.3)';
                console.log(`  -> Setting GREEN (boarding)`);
            } else if (idx === toIdx) {
                dotColor = '#e74c3c'; // Red for alighting
                dot.style.boxShadow = '0 0 0 4px rgba(231, 76, 60, 0.3)';
                console.log(`  -> Setting RED (alighting)`);
            } else if (idx > startIdx && idx < endIdx) {
                dotColor = '#f39c12'; // Orange for intermediate
                console.log(`  -> Setting ORANGE (intermediate)`);
            }
        } else {
            console.log(`  -> No highlighting (fromIdx or toIdx is -1)`);
        }
        
        console.log(`  -> Final color: ${dotColor}`);
        dot.style.background = dotColor;
        dotWrapper.appendChild(dot);

        const label = document.createElement("div");
        label.className = "station-label";
        label.textContent = station;
        
        // Style label based on position
        if (fromIdx >= 0 && toIdx >= 0) {
            if (idx === fromIdx) {
                label.style.color = '#2ecc71';
                label.style.fontWeight = '700';
            } else if (idx === toIdx) {
                label.style.color = '#e74c3c';
                label.style.fontWeight = '700';
            } else if (idx > startIdx && idx < endIdx) {
                label.style.color = '#f39c12';
                label.style.fontWeight = '600';
            }
        }
        
        dotWrapper.appendChild(label);
        lineContainer.appendChild(dotWrapper);

        if (idx < route.stations.length - 1) {
            const line = document.createElement("div");
            line.className = "station-line";
            
            // Highlight line if it's part of the journey
            if (fromIdx >= 0 && toIdx >= 0 && idx >= startIdx && idx < endIdx) {
                line.style.background = '#f39c12'; // Orange for active journey
                line.style.height = '4px'; // Make it thicker
            } else {
                line.style.background = operatorColor;
            }
            
            lineContainer.appendChild(line);
        }
    });

    container.appendChild(lineContainer);
    document.body.appendChild(container);
}