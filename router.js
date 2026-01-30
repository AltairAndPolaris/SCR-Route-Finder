/* =======================
   CONFIGURATION
======================= */
const OPERATOR_CODES = {
    "Stepford Connect": "CN",
    "Metro": "MT",
    "Waterline": "WL",
    "AirLink": "AL",
    "Stepford Express": "EX"
};

const DEFAULT_OPERATOR_PRICES = {
    "CN": 5,
    "MT": 3,
    "WL": 7,
    "AL": 10,
    "EX": 15
};

const OPERATOR_COLORS = {
    "CN": '#0096EE',
    "MT": '#EE4044',
    "WL": '#002D5F',
    "AL": '#EC7D33',
    "EX": '#FF0080'
};

/* ======================
   DATA STRUCTURES
======================= */
let GRAPH = new Map();
let ROUTE_DATA = new Map();
let STATION_DATA = new Map();
let TRAIN_DATA = [];
let OPERATORS = new Set();
let INVALID_ROUTES = {};

/* =======================
   LOAD ALL DATA
======================= */
async function loadAllData() {
    try {
        const [segmentsRes, routesRes, stationsRes, trainsRes] = await Promise.all([
            fetch("segments.json"),
            fetch("routes.json"),
            fetch("stations.json"),
            fetch("trains.json"),
            fetch("invalid_routes.json")
        ]);

        const [segmentsData, routesData, stationsData, trainsData] = await Promise.all([
            segmentsRes.json(),
            routesRes.json(),
            stationsRes.json(),
            trainsRes.json(),
            invalidRoutesRes.json()
        ]);

        return { segmentsData, routesData, stationsData, trainsData, invalidRoutesData };
    } catch (error) {
        console.error("Error loading data files:", error);
        throw error;
    }
}

function processData({ segmentsData, routesData, stationsData, trainsData }) {
    // Process stations
    stationsData.stations.forEach(station => {
        STATION_DATA.set(station.code, station.name);
    });

    // Process routes
    routesData.routes.forEach(route => {
        const operatorCode = OPERATOR_CODES[route.operator] || route.operator;
        ROUTE_DATA.set(route.name, {
            operator: route.operator,
            operatorCode: operatorCode,
            compatibleTrains: route.compatible_trains
        });
        OPERATORS.add(operatorCode);
    });

    //Process invalid routes
    INVALID_ROUTES = invalidRoutesData.invalid_routes || {};

    // Process trains
    TRAIN_DATA = trainsData.trains;

    // Build graph from segments
    const graph = new Map();
    const stations = new Set();

    segmentsData.segments.forEach(segment => {
        const { from, to, routes } = segment;
        
        stations.add(from);
        stations.add(to);

        routes.forEach(routeInfo => {
            const { route: routeId, duration_minutes: time } = routeInfo;
            
            // Get operator from route data
            const routeDetails = ROUTE_DATA.get(routeId);
            const operatorCode = routeDetails ? routeDetails.operatorCode : "Unknown";

            // Add edge to graph
            if (!graph.has(from)) {
                graph.set(from, []);
            }
            graph.get(from).push({
                to,
                route: routeId,
                operator: operatorCode,
                time
            });
        });
    });

    GRAPH = graph;

    return {
        stations: [...stations].sort(),
        operators: [...OPERATORS].sort()
    };
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
   INVALID ROUTES
======================= */
function showInvalidRoutesWarning() {
    let existing = document.getElementById("invalid-routes-popup");
    if (existing) {
        existing.remove();
        return;
    }

    const container = document.createElement("div");
    container.id = "invalid-routes-popup";
    container.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5); display: flex; align-items: center;
        justify-content: center; z-index: 10000; padding: 2rem;
        backdrop-filter: blur(4px);
    `;

    container.addEventListener("click", (e) => {
        if (e.target === container) container.remove();
    });

    const content = document.createElement("div");
    content.style.cssText = `
        background: white; border-radius: 16px; padding: 2rem;
        max-width: 700px; max-height: 80vh; overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); position: relative;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.cssText = `
        position: absolute; top: 1rem; right: 1rem; background: #f7fafc;
        border: 2px solid #e2e8f0; border-radius: 50%; width: 2.5rem;
        height: 2.5rem; cursor: pointer; font-size: 1.5rem;
    `;
    closeBtn.onclick = () => container.remove();
    content.appendChild(closeBtn);

    const header = document.createElement("div");
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
            <span style="font-size: 2rem;">⚠️</span>
            <h2 style="margin: 0; font-size: 1.75rem;">Data Warning</h2>
        </div>
        <p style="margin: 0; color: #718096;">
            These routes have been identified to have wrong data. This may be due to data being absent on the Fandom wiki.
        </p>
    `;
    content.appendChild(header);

    const count = Object.keys(INVALID_ROUTES).length;
    const countBadge = document.createElement("div");
    countBadge.style.cssText = `
        background: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px;
        padding: 0.75rem; margin: 1rem 0; text-align: center;
        font-weight: 600; color: #92400e;
    `;
    countBadge.textContent = `${count} route${count !== 1 ? 's' : ''} affected`;
    content.appendChild(countBadge);

    const routesList = document.createElement("div");
    for (const [routeId, errors] of Object.entries(INVALID_ROUTES)) {
        const card = document.createElement("div");
        card.style.cssText = `
            background: #fff7ed; border: 2px solid #fdba74; border-radius: 8px;
            padding: 1rem; margin-bottom: 0.75rem;
        `;
        card.innerHTML = `
            <div style="font-weight: 700; color: #92400e; margin-bottom: 0.5rem;">${routeId}</div>
            ${errors.map(e => `<div style="font-size: 0.85rem; color: #78350f; padding-left: 1rem;">• ${e}</div>`).join('')}
        `;
        routesList.appendChild(card);
    }
    content.appendChild(routesList);
    container.appendChild(content);
    document.body.appendChild(container);
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
            return a.time - b.time;
        }
        // Balanced mode: compare combined score
        const scoreA = a.time + (a.transfers * TRANSFER_PENALTY);
        const scoreB = b.time + (b.transfers * TRANSFER_PENALTY);
        return scoreA - scoreB;
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
                better = next.transfers < prev.transfers ||
                         (next.transfers === prev.transfers && next.time < prev.time);
            } else if (mode === "cheap") {
                better = next.cost < prev.cost ||
                         (next.cost === prev.cost && next.time < prev.time);
            } else {
                // Balanced mode
                const nextScore = next.time + (next.transfers * TRANSFER_PENALTY);
                const prevScore = prev.time + (prev.transfers * TRANSFER_PENALTY);
                better = nextScore < prevScore;
            }

            if (better) {
                best.set(key, next);
                pq.push(next);
            }
        }
    }
    return null;
}

/* =======================
   ROUTE UTILITIES
======================= */
function findEquivalentRoutesForSegment(segment) {
    const result = [];

    // Check which routes serve this exact segment
    for (const edge of GRAPH.get(segment.from) || []) {
        if (edge.to === segment.to && 
            edge.operator === segment.operator && 
            edge.route !== segment.route) {
            result.push(edge.route);
        }
    }

    return result;
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
                steps: [step],
                time: step.time
            };
        } else {
            current.to = step.to;
            current.stations.push(step.to);
            current.steps.push(step);
            current.time += step.time;
        }
    }

    if (current) segments.push(current);
    return segments;
}

/* =======================
   TRAIN UTILITIES
======================= */
function getCompatibleTrainsForRoute(routeId) {
    const routeInfo = ROUTE_DATA.get(routeId);
    if (!routeInfo) return [];

    return TRAIN_DATA.filter(train => 
        routeInfo.compatibleTrains.includes(train.name)
    );
}

/* =======================
   INITIALIZATION
======================= */
async function initialize() {
    try {
        const data = await loadAllData();
        const { stations, operators } = processData(data);

        // Populate station dropdowns
        const fromSelect = document.getElementById("from");
        const toSelect = document.getElementById("to");

        stations.forEach(code => {
            const name = STATION_DATA.get(code);
            const displayName = name ? `${code} - ${name}` : code;
            fromSelect.add(new Option(displayName, code));
            toSelect.add(new Option(displayName, code));
        });

        // Setup operator pricing
        const pricingDiv = document.getElementById("pricing");
        operators.forEach(op => {
            const defaultPrice = DEFAULT_OPERATOR_PRICES[op] ?? 10;
            const color = OPERATOR_COLORS[op] || '#667eea';
            
            pricingDiv.innerHTML += `
                <div class="pricing-item">
                    <label class="operator-badge operator-${op}" style="background: ${color}; color: white;">${op}</label>
                    <input
                        type="number"
                        id="price_${op}"
                        data-operator="${op}"
                        value="${defaultPrice}"
                        min="0"
                    >
                </div>
            `;
        });

        // Add warning icon (top left)
        const invalidRouteCount = Object.keys(INVALID_ROUTES).length;
        if (invalidRouteCount > 0) {`
            const warningBtn = document.createElement('button');
            warningBtn.style.cssText = 
                position: fixed; top: 10px; left: 10px;
                background: #fef3c7; border: 2px solid #f59e0b;
                border-radius: 50%; width: 3rem; height: 3rem;
                cursor: pointer; font-size: 1.5rem; z-index: 9999;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            `;
            warningBtn.innerHTML = '⚠️';
            warningBtn.title = `${invalidRouteCount} route${invalidRouteCount !== 1 ? 's' : ''} with data issues`;
            warningBtn.onclick = showInvalidRoutesWarning;
            document.body.appendChild(warningBtn);
        }

        console.log(`Loaded ${stations.length} stations, ${operators.length} operators, ${ROUTE_DATA.size} routes, ${TRAIN_DATA.length} trains`);

    } catch (err) {
        document.body.innerHTML = `
            <div class="container">
                <div class="card">
                    <h2 style="color: #e74c3c;">❌ Failed to load data files</h2>
                    <p>Make sure segments.json, routes.json, stations.json, and trains.json are in the same directory.</p>
                    <p style="color: #999; font-size: 0.9rem;">${err.message}</p>
                </div>
            </div>
        `;
        console.error(err);
    }
}

// Initialize on page load
initialize();

/* =======================
   UI FUNCTIONS
======================= */
function compute() {
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;

    if (!from || !to) {
        alert("Please select both departure and arrival stations");
        return;
    }

    const pricing = {};
    
    // Collect pricing from inputs
    document.querySelectorAll('#pricing input[type="number"]').forEach(input => {
        const operator = input.getAttribute('data-operator');
        pricing[operator] = Number(input.value);
    });

    const out = document.getElementById("output");
    out.innerHTML = "";

    render("Balanced Route", findPath(GRAPH, from, to, "balanced", pricing), "#667eea");
    render("Most Direct Route", findPath(GRAPH, from, to, "direct", pricing), "#2ecc71");
    render("Cheapest Route", findPath(GRAPH, from, to, "cheap", pricing), "#f39c12");
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

    const getDisplayName = code => {
        const name = STATION_DATA.get(code);
        return name ? `${code} - ${name}` : code;
    };

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
        const equivalents = findEquivalentRoutesForSegment(seg)
            .filter(id => id !== seg.route);
        
        const operatorColor = OPERATOR_COLORS[seg.operator] || '#667eea';
    
        html += `
            <div class="route-step">
                <div class="step-icon"></div>
                <div class="step-details">
                    <div class="segment-main">
                        <span class="step-stations">
                            ${getDisplayName(seg.from)} → ${getDisplayName(seg.to)}
                        </span>
                        <span class="operator-badge operator-${seg.operator}" style="background: ${operatorColor}; color: white;" data-route="${seg.route}">${seg.route}</span>
                        ${equivalents.map(id => `<span class="operator-badge operator-${seg.operator}" style="background: ${operatorColor}; color: white;" data-route="${id}">${id}</span>`).join("")}
                        <span class="step-time">${seg.time || ""} min</span>
                    </div>
            
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
    
    html += `</div></div>`;
    out.innerHTML += html;
}

/* =======================
   SERVICE MAP POPUP
======================= */
document.getElementById("output").addEventListener("click", e => {
    if (e.target.classList.contains("operator-badge")) {
        const routeId = e.target.getAttribute("data-route");
        
        if (routeId) {
            showRouteDetails(routeId);
        }
        e.stopPropagation();
    }
});

document.addEventListener("click", e => {
    const popup = document.getElementById("route-details-popup");
    if (!popup) return;
    
    if (e.target.classList.contains("route-details-popup")) {
        popup.remove();
    }
});

function showRouteDetails(routeId) {
    console.log(`Showing details for route: ${routeId}`);
    
    const routeInfo = ROUTE_DATA.get(routeId);
    if (!routeInfo) {
        alert("Route not found");
        return;
    }

    const operatorColor = OPERATOR_COLORS[routeInfo.operatorCode] || '#667eea';

    // Remove existing popup
    let existing = document.getElementById("route-details-popup");
    if (existing) existing.remove();

    const container = document.createElement("div");
    container.id = "route-details-popup";
    container.className = "route-details-popup";
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 2rem;
        backdrop-filter: blur(4px);
    `;

    container.addEventListener("click", function(e) {
        if (e.target === container) {
            container.remove();
        }
    });

    const content = document.createElement("div");
    content.style.cssText = `
        background: white;
        border-radius: 16px;
        padding: 2rem;
        max-width: 800px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        position: relative;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.style.cssText = `
        position: absolute;
        top: 1rem;
        right: 1rem;
        z-index: 10001;
        background: #f7fafc;
        border: 2px solid #e2e8f0;
        border-radius: 50%;
        width: 2.5rem;
        height: 2.5rem;
        cursor: pointer;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    `;
    
    closeBtn.addEventListener("mouseover", () => {
        closeBtn.style.background = "#e2e8f0";
    });
    closeBtn.addEventListener("mouseout", () => {
        closeBtn.style.background = "#f7fafc";
    });
    
    closeBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        container.remove();
    });

    content.appendChild(closeBtn);

    // Route header
    const header = document.createElement("div");
    header.style.cssText = `
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 3px solid ${operatorColor};
    `;
    header.innerHTML = `
        <h2 style="margin: 0 0 0.5rem 0; font-size: 1.75rem; color: #2d3748;">${routeId}</h2>
        <div style="font-size: 1rem; color: ${operatorColor}; font-weight: 600;">${routeInfo.operator} (${routeInfo.operatorCode})</div>
    `;
    content.appendChild(header);

    // Compatible trains section
    const compatibleTrains = getCompatibleTrainsForRoute(routeId);

    if (compatibleTrains.length > 0) {
        const trainSection = document.createElement("div");
        trainSection.style.cssText = `
            margin-bottom: 1.5rem;
            padding: 1.25rem;
            background: #f8fafc;
            border-radius: 12px;
            border-left: 4px solid ${operatorColor};
        `;
        
        const trainTitle = document.createElement("h4");
        trainTitle.textContent = `Compatible Trains (${compatibleTrains.length})`;
        trainTitle.style.cssText = "margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 700; color: #2d3748;";
        trainSection.appendChild(trainTitle);
        
        const trainGrid = document.createElement("div");
        trainGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 0.75rem;
        `;
        
        compatibleTrains.forEach(train => {
            const trainCard = document.createElement("div");
            trainCard.style.cssText = `
                padding: 0.75rem;
                background: white;
                border: 2px solid ${operatorColor};
                border-radius: 8px;
                font-size: 0.85rem;
                transition: transform 0.2s, box-shadow 0.2s;
            `;
            
            trainCard.addEventListener("mouseover", () => {
                trainCard.style.transform = "translateY(-2px)";
                trainCard.style.boxShadow = `0 4px 12px ${operatorColor}40`;
            });
            trainCard.addEventListener("mouseout", () => {
                trainCard.style.transform = "translateY(0)";
                trainCard.style.boxShadow = "none";
            });
            
            trainCard.innerHTML = `
                <div style="font-weight: 700; color: ${operatorColor}; margin-bottom: 0.25rem;">${train.name}</div>
                <div style="font-size: 0.75rem; color: #718096;">
                    ${train.propulsion === 'D' ? 'Diesel' : train.propulsion === 'E' ? 'Electric' : '🔋 ' + train.propulsion} • ${train.size} cars
                </div>
            `;
            
            trainGrid.appendChild(trainCard);
        });
        
        trainSection.appendChild(trainGrid);
        content.appendChild(trainSection);
    } else {
        const noTrains = document.createElement("div");
        noTrains.style.cssText = `
            padding: 1rem;
            background: #fff5f5;
            border: 1px solid #feb2b2;
            border-radius: 8px;
            color: #c53030;
            text-align: center;
            margin-bottom: 1.5rem;
        `;
        noTrains.textContent = "No compatible trains found for this route";
        content.appendChild(noTrains);
    }
    // Create line container
    const lineContainer = document.createElement("div");
    lineContainer.className = "service-line";

    route.stations.forEach((station, idx) => {
        const isBranch = station.endsWith(">") || station.endsWith("<");

        const dotWrapper = document.createElement("div");
        dotWrapper.className = "station-wrapper";

        const dot = document.createElement("div");
        dot.className = "station-dot" + (isBranch ? " branch" : "");
        
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
    })
    container.appendChild(content);
    document.body.appendChild(container);

}
