let map;
let markers = [];
let places = [];
let autocomplete;
let activeInfoWindow = null; // Track the currently open info window
let directionsService;
let directionsRenderer;
let optimizedRoute = [];
let currentTransportMode = 'DRIVING'; // Default transport mode

// Initialize the map
function initMap() {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("Map container not found!");
        return;
    }
    console.log("Map container found:", mapDiv);

    console.log("Initializing map...");
    map = new google.maps.Map(mapDiv, {
        zoom: 12,
        center: { lat: 0, lng: 0 }
    });
    console.log("Map created:", map);

    // Get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setCenter(pos);
                addMarker(pos, 'Your Location');
            },
            () => {
                handleLocationError(true);
            }
        );
    } else {
        handleLocationError(false);
    }

    // Initialize the autocomplete feature
    const input = document.getElementById('place-input');
    autocomplete = new google.maps.places.Autocomplete(input, {
        types: ['geocode', 'establishment']
    });

    // Bind the autocomplete to the map's bounds
    autocomplete.bindTo('bounds', map);

    // Handle place selection
    autocomplete.addListener('place_changed', function() {
        const place = autocomplete.getPlace();

        if (!place.geometry) {
            alert('No details available for this place');
            return;
        }

        const coordinates = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
        };

        // Gather place details
        const details = {
            address: place.formatted_address,
            phone: place.formatted_phone_number,
            rating: place.rating,
            website: place.website
        };

        addMarker(coordinates, place.name, details);
        savePlace(coordinates, place.name, details);
        input.value = '';
    });

    // Initialize directions services
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true // We'll keep our custom markers
    });

    // Add transport mode controls
    addTransportControls();
}

// Handle geolocation errors
function handleLocationError(browserHasGeolocation) {
    alert(
        browserHasGeolocation
            ? 'Error: The Geolocation service failed.'
            : 'Error: Your browser doesn\'t support geolocation.'
    );
}

// Add a new place
function addPlace() {
    const input = document.getElementById('place-input');
    const address = input.value;

    if (!address) {
        alert('Please enter an address or Google Maps URL');
        return;
    }

    // Check if it's a Google Maps list URL
    if (address.includes('maps.app.goo.gl/') || address.includes('goo.gl/maps/')) {
        handleGoogleMapsList(address).then(success => {
            if (success) {
                input.value = '';
            } else {
                alert('Could not process the Google Maps list. Please try a different format.');
            }
        });
        return;
    }

    // If it's a Google Maps URL, use the existing logic
    if (address.includes('google.com/maps')) {
        const coordinates = extractCoordinatesFromUrl(address);
        if (coordinates) {
            addMarker(coordinates, address);
            savePlace(coordinates, address);
            input.value = '';
            return;
        }
    }

    // Otherwise, let the autocomplete handle it
    // This will trigger the place_changed event above
}

// Extract coordinates from Google Maps URL
function extractCoordinatesFromUrl(url) {
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = url.match(regex);
    if (match) {
        return {
            lat: parseFloat(match[1]),
            lng: parseFloat(match[2])
        };
    }
    return null;
}

// Add marker to the map
function addMarker(position, title, details = {}) {
    const marker = new google.maps.Marker({
        position: position,
        map: map,
        title: title,
        animation: google.maps.Animation.DROP
    });

    // Create InfoWindow content
    const contentString = `
        <div class="info-window">
            <h3>${title}</h3>
            ${details.address ? `<p><i class="fas fa-map-marker-alt"></i> ${details.address}</p>` : ''}
            ${details.phone ? `<p><i class="fas fa-phone"></i> ${details.phone}</p>` : ''}
            ${details.rating ? `<p><i class="fas fa-star"></i> ${details.rating} / 5</p>` : ''}
            ${details.website ? `<p><a href="${details.website}" target="_blank">Visit Website</a></p>` : ''}
        </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
        content: contentString,
        maxWidth: 300
    });

    // Add hover listeners
    marker.addListener('mouseover', () => {
        if (activeInfoWindow) {
            activeInfoWindow.close();
        }
        infoWindow.open(map, marker);
        activeInfoWindow = infoWindow;
    });

    marker.addListener('mouseout', () => {
        setTimeout(() => {
            if (!infoWindow.getMap() || infoWindow.getMap() === null) return;
            infoWindow.close();
        }, 1000);
    });

    markers.push(marker);
    map.panTo(position);
}

// Save place to the list
function savePlace(coordinates, address, details = {}) {
    places.push({ coordinates, address, details });
    updatePlacesList();
    
    // Recalculate route if we have at least 2 places
    if (places.length >= 2) {
        calculateOptimalRoute(currentTransportMode);
    }
}

// Update the places list in the UI
function updatePlacesList() {
    const placesList = document.getElementById('places');
    placesList.innerHTML = '';
    
    places.forEach((place, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div>
                <i class="fas fa-map-marker-alt" style="color: #4CAF50; margin-right: 10px;"></i>
                ${place.address}
            </div>
            <button class="delete-btn" onclick="deletePlace(${index})">
                <i class="fas fa-trash-alt"></i>
            </button>
        `;
        placesList.appendChild(li);
    });
}

// Delete a place
function deletePlace(index) {
    markers[index + 1].setMap(null); // +1 because first marker is user's location
    markers.splice(index + 1, 1);
    places.splice(index, 1);
    updatePlacesList();

    // Clear existing route if less than 2 places
    if (places.length < 2) {
        directionsRenderer.setDirections({ routes: [] });
        const existingRouteInfo = document.querySelector('.route-info');
        if (existingRouteInfo) {
            existingRouteInfo.remove();
        }
    } else {
        // Recalculate route with remaining places
        calculateOptimalRoute(currentTransportMode);
    }
}

// Add some CSS for the InfoWindow
const style = document.createElement('style');
style.textContent = `
    .info-window {
        padding: 8px;
        font-family: 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .info-window h3 {
        margin: 0 0 8px 0;
        color: #2c3e50;
        font-size: 16px;
    }
    .info-window p {
        margin: 4px 0;
        color: #666;
        font-size: 14px;
    }
    .info-window i {
        margin-right: 8px;
        color: #4CAF50;
    }
    .info-window a {
        color: #4CAF50;
        text-decoration: none;
    }
    .info-window a:hover {
        text-decoration: underline;
    }
`;
document.head.appendChild(style);

// Add transport mode controls
function addTransportControls() {
    const transportControls = document.createElement('div');
    transportControls.className = 'transport-controls';
    transportControls.innerHTML = `
        <button onclick="calculateOptimalRoute('DRIVING')" class="transport-btn active" data-mode="DRIVING">
            <i class="fas fa-car"></i> Drive
        </button>
        <button onclick="calculateOptimalRoute('TRANSIT')" class="transport-btn" data-mode="TRANSIT">
            <i class="fas fa-bus"></i> Transit
        </button>
        <button onclick="calculateOptimalRoute('WALKING')" class="transport-btn" data-mode="WALKING">
            <i class="fas fa-walking"></i> Walk
        </button>
    `;
    map.controls[google.maps.ControlPosition.TOP_RIGHT].push(transportControls);
}

// Calculate optimal route
async function calculateOptimalRoute(mode) {
    if (places.length < 2) {
        alert('Please add at least 2 places to calculate a route');
        return;
    }

    currentTransportMode = mode; // Store the current mode
    
    // Update active state of transport buttons
    document.querySelectorAll('.transport-btn').forEach(btn => {
        if (btn.getAttribute('data-mode') === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Show loading indicator
    showLoading(true);

    try {
        // Get optimal order of waypoints
        const optimizedOrder = await findOptimalOrder(places, mode);
        
        // Create waypoints array from optimized order
        const waypoints = optimizedOrder.slice(1, -1).map(index => ({
            location: new google.maps.LatLng(
                places[index].coordinates.lat,
                places[index].coordinates.lng
            ),
            stopover: true
        }));

        // Create request for directions
        const request = {
            origin: new google.maps.LatLng(
                places[optimizedOrder[0]].coordinates.lat,
                places[optimizedOrder[0]].coordinates.lng
            ),
            destination: new google.maps.LatLng(
                places[optimizedOrder[optimizedOrder.length - 1]].coordinates.lat,
                places[optimizedOrder[optimizedOrder.length - 1]].coordinates.lng
            ),
            waypoints: waypoints,
            travelMode: google.maps.TravelMode[mode],
            optimizeWaypoints: true
        };

        // Add transit-specific options
        if (mode === 'TRANSIT') {
            request.transitOptions = {
                departureTime: new Date(), // Use current time
                modes: ['BUS', 'RAIL', 'SUBWAY', 'TRAIN', 'TRAM'],
                routingPreference: 'FEWER_TRANSFERS'
            };
        }

        // For transit mode, we need to calculate routes between each pair of points
        if (mode === 'TRANSIT') {
            const legs = [];
            for (let i = 0; i < optimizedOrder.length - 1; i++) {
                const legRequest = {
                    origin: new google.maps.LatLng(
                        places[optimizedOrder[i]].coordinates.lat,
                        places[optimizedOrder[i]].coordinates.lng
                    ),
                    destination: new google.maps.LatLng(
                        places[optimizedOrder[i + 1]].coordinates.lat,
                        places[optimizedOrder[i + 1]].coordinates.lng
                    ),
                    travelMode: google.maps.TravelMode.TRANSIT,
                    transitOptions: request.transitOptions
                };

                try {
                    const result = await new Promise((resolve, reject) => {
                        directionsService.route(legRequest, (result, status) => {
                            if (status === 'OK') resolve(result);
                            else reject(status);
                        });
                    });
                    legs.push(result);
                } catch (error) {
                    // If transit fails, try walking as fallback
                    legRequest.travelMode = google.maps.TravelMode.WALKING;
                    const result = await new Promise((resolve, reject) => {
                        directionsService.route(legRequest, (result, status) => {
                            if (status === 'OK') resolve(result);
                            else reject(status);
                        });
                    });
                    legs.push(result);
                }
            }

            // Combine all legs and display
            const combinedResult = legs[0]; // Start with first leg
            for (let i = 1; i < legs.length; i++) {
                combinedResult.routes[0].legs.push(legs[i].routes[0].legs[0]);
            }
            directionsRenderer.setDirections(combinedResult);
            displayRouteInfo(combinedResult, optimizedOrder, mode);
            showLoading(false);
        } else {
            // Handle non-transit modes as before
            directionsService.route(request, (result, status) => {
                if (status === 'OK') {
                    directionsRenderer.setDirections(result);
                    displayRouteInfo(result, optimizedOrder, mode);
                } else {
                    alert('Could not calculate route: ' + status);
                }
                showLoading(false);
            });
        }
    } catch (error) {
        console.error('Error calculating route:', error);
        alert('Error calculating route. Some locations might not be accessible by transit.');
        showLoading(false);
    }
}

// Find optimal order of waypoints
async function findOptimalOrder(places, mode) {
    // For small number of places, try all permutations
    if (places.length <= 10) {
        return findOptimalOrderBruteForce(places, mode);
    }
    // For larger numbers, use a simple nearest neighbor approach
    return findOptimalOrderGreedy(places);
}

// Brute force approach for small number of places
async function findOptimalOrderBruteForce(places, mode) {
    const indices = Array.from({ length: places.length }, (_, i) => i);
    let bestOrder = indices;
    let shortestTime = Infinity;

    // Generate all possible permutations
    const permutations = getPermutations(indices);

    for (const order of permutations) {
        const time = await estimateRouteTime(order, places, mode);
        if (time < shortestTime) {
            shortestTime = time;
            bestOrder = order;
        }
    }

    return bestOrder;
}

// Greedy approach for larger number of places
function findOptimalOrderGreedy(places) {
    const indices = Array.from({ length: places.length }, (_, i) => i);
    const order = [0]; // Start with first place
    const remaining = indices.slice(1);

    while (remaining.length > 0) {
        const current = order[order.length - 1];
        let nearest = remaining[0];
        let minDist = getDistance(
            places[current].coordinates,
            places[remaining[0]].coordinates
        );

        for (let i = 1; i < remaining.length; i++) {
            const dist = getDistance(
                places[current].coordinates,
                places[remaining[i]].coordinates
            );
            if (dist < minDist) {
                minDist = dist;
                nearest = remaining[i];
            }
        }

        order.push(nearest);
        remaining.splice(remaining.indexOf(nearest), 1);
    }

    return order;
}

// Helper function to calculate distance between two points
function getDistance(point1, point2) {
    return google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(point1.lat, point1.lng),
        new google.maps.LatLng(point2.lat, point2.lng)
    );
}

// Helper function to estimate route time
function estimateRouteTime(order, places, mode) {
    return new Promise((resolve) => {
        const request = {
            origin: new google.maps.LatLng(
                places[order[0]].coordinates.lat,
                places[order[0]].coordinates.lng
            ),
            destination: new google.maps.LatLng(
                places[order[order.length - 1]].coordinates.lat,
                places[order[order.length - 1]].coordinates.lng
            ),
            waypoints: order.slice(1, -1).map(index => ({
                location: new google.maps.LatLng(
                    places[index].coordinates.lat,
                    places[index].coordinates.lng
                ),
                stopover: true
            })),
            travelMode: google.maps.TravelMode[mode]
        };

        directionsService.route(request, (result, status) => {
            if (status === 'OK') {
                const totalTime = result.routes[0].legs.reduce(
                    (sum, leg) => sum + leg.duration.value,
                    0
                );
                resolve(totalTime);
            } else {
                resolve(Infinity);
            }
        });
    });
}

// Display route information
function displayRouteInfo(result, order, mode) {
    const route = result.routes[0];
    let totalDistance = 0;
    let totalDuration = 0;
    let transitInfo = [];

    // Calculate totals
    route.legs.forEach(leg => {
        totalDistance += leg.distance.value;
        totalDuration += leg.duration.value;

        // Collect transit-specific information
        if (mode === 'TRANSIT' && leg.steps) {
            leg.steps.forEach(step => {
                if (step.travel_mode === 'TRANSIT') {
                    transitInfo.push({
                        line: step.transit?.line?.short_name || step.transit?.line?.name,
                        vehicle: step.transit?.line?.vehicle?.name || 'Transit',
                        departure: step.transit?.departure_time?.text,
                        arrival: step.transit?.arrival_time?.text
                    });
                }
            });
        }
    });

    // Create route summary
    const routeInfo = document.createElement('div');
    routeInfo.className = 'route-info';

    // Create export links
    const { googleUrl, appleUrl } = createExportLinks(route, order);

    // Add export buttons to the route info
    routeInfo.innerHTML = `
        <h3>Route Summary</h3>
        <div class="export-buttons">
            <a href="${googleUrl}" target="_blank" class="export-btn google" title="Open in Google Maps">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
            </a>
            <a href="${appleUrl}" target="_blank" class="export-btn apple" title="Open in Apple Maps">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512">
                    <path fill="#000000" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                </svg>
            </a>
        </div>
        <p><i class="fas fa-clock"></i> Total Time: ${formatDuration(totalDuration)}</p>
        <p><i class="fas fa-road"></i> Total Distance: ${(totalDistance / 1000).toFixed(1)} km</p>
        ${mode === 'TRANSIT' && transitInfo.length > 0 ? `
            <div class="transit-details">
                <h4><i class="fas fa-bus"></i> Transit Details:</h4>
                ${transitInfo.map(info => `
                    <div class="transit-step">
                        <p><i class="fas ${info.vehicle.toLowerCase().includes('bus') ? 'fa-bus' : 'fa-train'}"></i>
                           ${info.line} ${info.vehicle}</p>
                        <p class="transit-time">
                            <span><i class="fas fa-clock"></i> ${info.departure}</span> → 
                            <span>${info.arrival}</span>
                        </p>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        <div class="route-stops">
            <h4>Stops:</h4>
            <ol>
                ${order.map(index => `<li>${places[index].address}</li>`).join('')}
            </ol>
        </div>
    `;

    // Update the places list with the route info
    const placesList = document.querySelector('.places-list');
    const existingRouteInfo = document.querySelector('.route-info');
    if (existingRouteInfo) {
        placesList.removeChild(existingRouteInfo);
    }
    placesList.appendChild(routeInfo);
}

// Helper function to format duration
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours ? hours + 'h ' : ''}${minutes}min`;
}

// Helper function to generate permutations
function* getPermutations(arr) {
    if (arr.length <= 1) yield arr;
    else {
        for (let i = 0; i < arr.length; i++) {
            const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
            for (const p of getPermutations(rest)) {
                yield [arr[i], ...p];
            }
        }
    }
}

// Loading indicator
function showLoading(show) {
    let loader = document.querySelector('.loader');
    if (!loader && show) {
        loader = document.createElement('div');
        loader.className = 'loader';
        loader.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating optimal route...';
        document.body.appendChild(loader);
    } else if (loader && !show) {
        loader.remove();
    }
}

// Modify the createExportLinks function
function createExportLinks(route, order) {
    const origin = places[order[0]];
    const destination = places[order[order.length - 1]];
    const waypoints = order.slice(1, -1).map(index => places[index]);
    
    // Create Google Maps URL
    let googleUrl = `https://www.google.com/maps/dir/?api=1`;
    googleUrl += `&origin=${origin.coordinates.lat},${origin.coordinates.lng}`;
    googleUrl += `&destination=${destination.coordinates.lat},${destination.coordinates.lng}`;
    
    if (waypoints.length > 0) {
        const waypointStr = waypoints
            .map(wp => `${wp.coordinates.lat},${wp.coordinates.lng}`)
            .join('|');
        googleUrl += `&waypoints=${waypointStr}`;
    }
    
    googleUrl += `&travelmode=${currentTransportMode.toLowerCase()}`;

    // Create Apple Maps URL with the correct format
    let appleUrl = 'maps://';
    
    // For walking mode in Apple Maps
    if (currentTransportMode === 'WALKING') {
        const allPoints = [origin, ...waypoints, { coordinates: destination.coordinates }];
        const directions = allPoints.map((point, index) => {
            if (index === 0) {
                return `?saddr=${point.coordinates.lat},${point.coordinates.lng}`;
            } else {
                return `&daddr=${point.coordinates.lat},${point.coordinates.lng}`;
            }
        }).join('');
        appleUrl += directions;
    } else {
        // For driving and transit
        appleUrl += `?saddr=${origin.coordinates.lat},${origin.coordinates.lng}`;
        
        // Chain all destinations including waypoints
        const allDestinations = [...waypoints, { coordinates: destination.coordinates }];
        const destinationsStr = allDestinations
            .map(wp => `${wp.coordinates.lat},${wp.coordinates.lng}`)
            .join('+to:');
        
        appleUrl += `&daddr=${destinationsStr}`;
    }

    // Add transport mode
    const appleTravelMode = currentTransportMode === 'DRIVING' ? 'd' : 
                           currentTransportMode === 'WALKING' ? 'w' : 't';
    appleUrl += `&dirflg=${appleTravelMode}`;

    // Create a fallback URL for desktop browsers
    const appleFallbackUrl = appleUrl.replace('maps://', 'http://maps.apple.com/');

    // Check if the user is on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    return { 
        googleUrl, 
        appleUrl: isIOS ? appleUrl : appleFallbackUrl 
    };
}

// Add clearAllPlaces function
function clearAllPlaces() {
    // Remove all markers except the first one (user's location)
    for (let i = markers.length - 1; i > 0; i--) {
        markers[i].setMap(null);
    }
    markers = [markers[0]]; // Keep only user's location marker
    
    // Clear places array
    places = [];
    
    // Clear the places list
    updatePlacesList();
    
    // Clear the route
    if (directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
    }
    
    // Remove route info
    const existingRouteInfo = document.querySelector('.route-info');
    if (existingRouteInfo) {
        existingRouteInfo.remove();
    }
}

// Update the handleGoogleMapsList function
async function handleGoogleMapsList(url) {
    try {
        // Extract place_id from the URL if available
        const placeIdMatch = url.match(/place\/([^\/]+)/);
        if (placeIdMatch) {
            const placeId = placeIdMatch[1];
            const placesService = new google.maps.places.PlacesService(map);
            
            const result = await new Promise((resolve, reject) => {
                placesService.getDetails({
                    placeId: placeId,
                    fields: ['name', 'geometry', 'formatted_address', 'rating', 'website', 'formatted_phone_number']
                }, (place, status) => {
                    if (status === 'OK') {
                        resolve(place);
                    } else {
                        reject(status);
                    }
                });
            });

            const coordinates = {
                lat: result.geometry.location.lat(),
                lng: result.geometry.location.lng()
            };

            const details = {
                address: result.formatted_address,
                phone: result.formatted_phone_number,
                rating: result.rating,
                website: result.website
            };

            addMarker(coordinates, result.name, details);
            savePlace(coordinates, result.name, details);
            return true;
        }

        // Fallback to coordinates extraction if no place_id
        const coordinates = extractCoordinatesFromUrl(url);
        if (coordinates) {
            const geocoder = new google.maps.Geocoder();
            const result = await new Promise((resolve, reject) => {
                geocoder.geocode({ location: coordinates }, (results, status) => {
                    if (status === 'OK') {
                        resolve(results[0]);
                    } else {
                        reject(status);
                    }
                });
            });

            addMarker(coordinates, result.formatted_address);
            savePlace(coordinates, result.formatted_address);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error handling Google Maps URL:', error);
        return false;
    }
} 