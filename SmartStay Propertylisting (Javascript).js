import { SmartStayAPI } from './apiService.js';

class PropertyService {
    constructor() {
        this.properties = [];
        this.userLocation = null;
    }

    async loadProperties(criteria = {}) {
        try {
            // Backend performs filtering and returns only VERIFIED properties for public tenant search
            const queryParams = { ...criteria };
            if (criteria.verifiedOnly) {
                queryParams.verificationStatus = 'VERIFIED';
            }

            const response = await SmartStayAPI.getProperties(queryParams);
            let properties = response.data || [];

            // Apply calculated distance if user location is set
            if (this.userLocation) {
                properties = properties.map(property => ({
                    ...property,
                    distance: this.calculateDistance(
                        this.userLocation.latitude,
                        this.userLocation.longitude,
                        property.latitude,
                        property.longitude
                    )
                }));
            }

            this.properties = properties;
            return properties;
        } catch (error) {
            console.error('Unable to load properties from backend:', error);
            return [];
        }
    }

    setUserLocation(latitude, longitude) {
        this.userLocation = { latitude, longitude };
        this.properties = this.properties.map(property => ({
            ...property,
            distance: this.calculateDistance(
                latitude,
                longitude,
                property.latitude,
                property.longitude
            )
        }));
    }

    calculateDistance(latitude1, longitude1, latitude2, longitude2) {
        if (!latitude1 || !longitude1 || !latitude2 || !longitude2) return 1.5;
        const earthRadiusKm = 6371;
        const latitudeDifference = (latitude2 - latitude1) * Math.PI / 180;
        const longitudeDifference = (longitude2 - longitude1) * Math.PI / 180;
        const latitude1Radians = latitude1 * Math.PI / 180;
        const latitude2Radians = latitude2 * Math.PI / 180;
        const haversine = Math.sin(latitudeDifference / 2) ** 2 +
            Math.sin(longitudeDifference / 2) ** 2 *
            Math.cos(latitude1Radians) * Math.cos(latitude2Radians);

        return Math.round(earthRadiusKm * 2 * Math.atan2(
            Math.sqrt(haversine),
            Math.sqrt(1 - haversine)
        ) * 10) / 10;
    }

    calculateMatchScore(property, preferences) {
        let score = 0;
        let total = 0;

        if (preferences.propertyType && property.propertyType === preferences.propertyType) {
            score += 20;
        }
        total += 20;

        if (preferences.maxRent && property.rent <= preferences.maxRent) {
            score += 30;
        }
        total += 30;

        if (preferences.gender && (property.gender === preferences.gender || property.gender === 'Any')) {
            score += 20;
        }
        total += 20;

        if (preferences.amenities && preferences.amenities.length > 0) {
            const matchedAmenities = (property.amenities || []).filter(a => preferences.amenities.includes(a));
            score += (matchedAmenities.length / preferences.amenities.length) * 30;
        }
        total += 30;

        return Math.round((score / total) * 100);
    }
}

class LocationService {
    async geocode(address) {
        console.log(`Calling /api/location/geocode for: ${address}`);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    formattedAddress: address,
                    latitude: 28.65,
                    longitude: 77.45
                });
            }, 300);
        });
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser.'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }),
                error => reject(new Error(this.getGeolocationError(error))),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
            );
        });
    }

    getGeolocationError(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED: return 'Location permission was denied.';
            case error.POSITION_UNAVAILABLE: return 'Your location is currently unavailable.';
            case error.TIMEOUT: return 'The location request timed out.';
            default: return 'Unable to determine your location.';
        }
    }
}

class MapService {
    constructor() {
        this.map = null;
        this.markers = new Map();
        this.properties = [];
        this.activePropertyId = null;
        this.userMarker = null;
    }

    init() {
        const mapElement = document.getElementById('propertyMap');
        if (!mapElement) return;

        if (!window.google?.maps) {
            setTimeout(() => this.init(), 150);
            return;
        }

        this.map = new google.maps.Map(mapElement, {
            center: { lat: 28.65, lng: 77.45 },
            zoom: 11,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true
        });
    }

    renderProperties(properties) {
        if (!this.map) return;

        this.properties = properties.filter(property =>
            Number.isFinite(Number(property.latitude)) &&
            Number.isFinite(Number(property.longitude))
        );
        this.markers.forEach(marker => marker.setMap(null));
        this.markers.clear();

        if (this.properties.length === 0) return;

        const bounds = new google.maps.LatLngBounds();

        this.properties.forEach(property => {
            const marker = new google.maps.Marker({
                map: this.map,
                position: { lat: Number(property.latitude), lng: Number(property.longitude) },
                title: property.name
            });
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <strong>${property.name}</strong><br>
                    ${property.locality || ''}, ${property.city || ''}<br>
                    ₹${Number(property.rent).toLocaleString('en-IN')}/month
                `
            });

            marker.addListener('click', () => {
                infoWindow.open({ anchor: marker, map: this.map });
                this.highlightCard(property.id);
            });
            this.markers.set(property.id, marker);
            bounds.extend({ lat: Number(property.latitude), lng: Number(property.longitude) });
        });

        this.map.fitBounds(bounds, 30);
    }

    setUserLocation(latitude, longitude) {
        if (!this.map) return;

        if (this.userMarker) {
            this.userMarker.setPosition({ lat: latitude, lng: longitude });
        } else {
            this.userMarker = new google.maps.Marker({
                map: this.map,
                position: { lat: latitude, lng: longitude },
                title: 'You are here',
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#2563eb',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3
                }
            });
        }

        this.map.setCenter({ lat: latitude, lng: longitude });
        this.map.setZoom(12);
    }

    setActiveProperty(id) {
        this.activePropertyId = id;
        this.updateMapMarker(id);
        this.highlightCard(id);
    }

    updateMapMarker(id) {
        const marker = this.markers.get(id);
        const property = this.properties.find(item => String(item.id) === String(id));

        if (!this.map || !marker || !property) return;

        this.map.setCenter({ lat: Number(property.latitude), lng: Number(property.longitude) });
        this.map.setZoom(15);
        google.maps.event.trigger(marker, 'click');
    }

    highlightCard(id) {
        document.querySelectorAll('[data-property-id]').forEach(card => {
            card.classList.remove('ring-2', 'ring-primary');
        });

        const card = document.querySelector(`[data-property-id="${id}"]`);
        if (card) {
            card.classList.add('ring-2', 'ring-primary');
        }
    }
}

const propertyService = new PropertyService();
const locationService = new LocationService();
const mapService = new MapService();

// UI Controller
class PropertyUIController {
    constructor() {
        this.initEventListeners();
        this.render();
        this.setupMobileDrawer();
    }

    initEventListeners() {
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.handleSearch());

        const searchInput = document.getElementById('smartSearchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSearch();
            });
        }

        const myLocBtn = document.getElementById('useMyLocationBtn');
        if (myLocBtn) myLocBtn.addEventListener('click', () => this.handleMyLocation());

        const applyBtn = document.getElementById('applyFiltersBtn');
        if (applyBtn) applyBtn.addEventListener('click', () => this.handleFilterApply());

        const applyDrawerBtn = document.getElementById('applyFiltersDrawerBtn');
        if (applyDrawerBtn) applyDrawerBtn.addEventListener('click', () => this.handleFilterApply());

        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) clearBtn.addEventListener('click', () => this.resetFilters());

        const resetBtn = document.getElementById('resetFiltersBtn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetFilters());

        const sortSelect = document.getElementById('sortProperties');
        if (sortSelect) sortSelect.addEventListener('change', () => this.render());

        // Live cross-tab & storage event updates
        window.addEventListener('smartstay_properties_updated', () => {
            this.render();
        });
        window.addEventListener('storage', (event) => {
            if (event.key === 'smartstay_master_properties' || event.key === 'smartstay_properties') {
                this.render();
            }
        });
    }

    setupMobileDrawer() {
        const toggle = document.getElementById('mobileFilterToggle');
        const drawer = document.getElementById('filterDrawer');
        const content = document.getElementById('drawerContent');
        const close = document.getElementById('closeDrawerBtn');

        if (!toggle || !drawer || !content || !close) return;

        toggle.addEventListener('click', () => {
            drawer.classList.remove('hidden');
            setTimeout(() => {
                content.classList.remove('translate-x-full');
            }, 10);
            this.syncFiltersToDrawer();
        });

        close.addEventListener('click', () => {
            content.classList.add('translate-x-full');
            setTimeout(() => {
                drawer.classList.add('hidden');
            }, 300);
        });
    }

    syncFiltersToDrawer() {
        const sidebar = document.querySelector('#filterSidebar .bg-surface-white');
        const drawerFilters = document.getElementById('drawerFilters');
        if (!sidebar || !drawerFilters) return;

        drawerFilters.innerHTML = sidebar.innerHTML.replace(
            '<div class="flex justify-between items-center mb-6 border-b border-surface-variant pb-4">',
            ''
        ).replace(
            '<button id="applyFiltersBtn" class="w-full py-3 bg-primary-container text-on-primary rounded-xl font-label-bold text-label-bold hover:bg-primary transition-colors duration-200 mt-4 font-bold shadow-md">Apply Smart Filters</button>',
            ''
        );
    }

    async handleSearch() {
        const text = document.getElementById('smartSearchInput')?.value;
        if (!text) return;

        this.setLoading(true);
        try {
            await locationService.geocode(text);
            await this.render();
        } catch (e) {
            console.error(e);
        } finally {
            this.setLoading(false);
        }
    }

    async handleMyLocation() {
        this.setLoading(true);
        try {
            const location = await locationService.getCurrentPosition();
            propertyService.setUserLocation(location.latitude, location.longitude);
            const sortSelect = document.getElementById('sortProperties');
            if (sortSelect) sortSelect.value = 'Distance';
            await this.render();
            mapService.setUserLocation(location.latitude, location.longitude);
        } catch (error) {
            console.error(error);
            alert(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    handleFilterApply() {
        this.render();
        const drawer = document.getElementById('filterDrawer');
        if (drawer && !drawer.classList.contains('hidden')) {
            document.getElementById('drawerContent')?.classList.add('translate-x-full');
            setTimeout(() => drawer.classList.add('hidden'), 300);
        }
    }

    resetFilters() {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setVal('smartSearchInput', '');
        setVal('filterPropertyType', 'All');
        setVal('filterMinRent', '');
        setVal('filterMaxRent', '');
        setVal('filterDistance', 'Any');
        document.querySelectorAll('input[name="filterGender"]').forEach(i => i.checked = i.value === 'Any');
        setVal('filterSharing', 'Any');
        document.querySelectorAll('input[name="filterAmenity"]').forEach(i => i.checked = false);
        
        const vFilter = document.getElementById('filterVerified');
        if (vFilter) vFilter.checked = false;
        
        const aFilter = document.getElementById('filterAvailable');
        if (aFilter) aFilter.checked = false;

        this.render();
    }

    setLoading(isLoading) {
        const loader = document.getElementById('loadingState');
        const grid = document.getElementById('propertiesGrid');
        const emptyState = document.getElementById('emptyState');

        if (loader) loader.classList.toggle('hidden', !isLoading);
        if (grid) grid.classList.toggle('hidden', isLoading);
        if (emptyState) emptyState.classList.add('hidden');
    }

    getCriteria() {
        return {
            searchText: document.getElementById('smartSearchInput')?.value || '',
            propertyType: document.getElementById('filterPropertyType')?.value || 'All',
            minRent: parseInt(document.getElementById('filterMinRent')?.value) || null,
            maxRent: parseInt(document.getElementById('filterMaxRent')?.value) || null,
            maxDistance: document.getElementById('filterDistance')?.value || 'Any',
            gender: document.querySelector('input[name="filterGender"]:checked')?.value || 'Any',
            sharing: document.getElementById('filterSharing')?.value || 'Any',
            amenities: Array.from(document.querySelectorAll('input[name="filterAmenity"]:checked')).map(i => i.value),
            verifiedOnly: document.getElementById('filterVerified')?.checked || false,
            availableNow: document.getElementById('filterAvailable')?.checked || false,
            sortBy: document.getElementById('sortProperties')?.value || 'Newest',
        };
    }

    async render() {
        this.setLoading(true);
        const criteria = this.getCriteria();
        
        // Asynchronously request verified properties from backend
        const properties = await propertyService.loadProperties(criteria);
        this.setLoading(false);

        const grid = document.getElementById('propertiesGrid');
        const emptyState = document.getElementById('emptyState');
        if (!grid) return;

        mapService.renderProperties(properties);

        if (properties.length === 0) {
            grid.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');
        grid.innerHTML = '';

        properties.forEach(prop => {
            const matchScore = propertyService.calculateMatchScore(prop, criteria);
            const isVerified = prop.verification_status === 'VERIFIED' || prop.verified === true;

            const card = document.createElement('div');
            card.className = 'bg-surface-white rounded-xl card-shadow overflow-hidden group hover:shadow-lg transition-shadow duration-300 cursor-pointer border-2 border-transparent hover:border-primary';
            card.dataset.propertyId = prop.id;
            card.onclick = () => mapService.setActiveProperty(prop.id);

            card.innerHTML = `
                <div class="relative h-48 w-full overflow-hidden">
                    <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src="${prop.image || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop'}" alt="${prop.name}">
                    <div class="absolute top-3 right-3 bg-surface-white/80 glass-nav p-1.5 rounded-full cursor-pointer text-outline hover:text-status-critical transition-colors">
                        <span class="material-symbols-outlined text-[20px]">favorite</span>
                    </div>
                    <div class="absolute top-3 left-3 flex gap-2">
                        <div class="bg-white px-2 py-1 rounded text-label-bold font-bold text-primary shadow-sm text-[10px] uppercase tracking-wider">
                            ${prop.propertyType || 'PG'}
                        </div>
                        ${isVerified ? '<div class="bg-brand-accent-green text-white px-2 py-1 rounded text-label-bold font-bold shadow-sm text-[10px] uppercase tracking-wider">✓ Verified</div>' : ''}
                    </div>
                    ${matchScore > 80 ? `<div class="absolute bottom-3 right-3 bg-primary text-white px-3 py-1 rounded-full text-label-sm font-bold shadow-lg animate-pulse">
                        ${matchScore}% Match
                    </div>` : ''}
                </div>
                <div class="p-4">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-headline-sm text-[18px] font-semibold text-on-surface leading-tight truncate pr-2">${prop.name}</h3>
                        <span class="font-bold text-primary whitespace-nowrap">₹ ${Number(prop.rent).toLocaleString('en-IN')}<span class="text-label-sm text-on-surface-variant font-normal">/mo</span></span>
                    </div>
                    <p class="text-body-sm text-on-surface-variant mb-4 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[16px] text-outline">location_on</span>
                        ${prop.locality || ''}, ${prop.city || ''} <span class="mx-1">•</span> ${prop.distance || 0.8} km away
                    </p>
                    <div class="flex flex-wrap gap-2 mb-4">
                        ${(prop.amenities || ['Wi-Fi']).map(a => `<span class="px-2 py-0.5 bg-surface-container text-on-surface-variant rounded text-[10px] font-medium">${a}</span>`).join('')}
                    </div>
                    <div class="flex items-center justify-between border-t border-surface-variant pt-4">
                        <div class="flex items-center gap-3">
                            <div class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-outline text-[16px]">star</span>
                                <span class="text-label-sm font-bold text-on-surface">${prop.rating || 4.5}</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <span class="material-symbols-outlined text-outline text-[16px]">calendar_today</span>
                                <span class="text-label-sm text-on-surface-variant">${prop.submitted_date ? 'Verified' : 'Recently updated'}</span>
                            </div>
                        </div>
                        <button class="px-3 py-1.5 bg-primary text-white rounded-lg text-label-sm font-bold hover:bg-primary-container transition-colors">View Details</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    mapService.init();
    new PropertyUIController();
});

export { propertyService, locationService, mapService };
