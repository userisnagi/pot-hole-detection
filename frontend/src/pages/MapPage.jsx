import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { getPotholes } from '../services/api';
import geocodingService from '../services/geocoding';
import MapController from '../components/MapController';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons based on severity
const createSeverityIcon = (severity) => {
  const color = severity === 'severe' ? 'red' : severity === 'moderate' ? 'orange' : 'green';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const MapPage = ({ selectedLocation, selectedPothole, onLocationSelect, onClearLocation, onClearPothole }) => {
  const location = useLocation();
  const [potholes, setPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addressCache, setAddressCache] = useState({});
  const [mapCenter, setMapCenter] = useState([18.52, 73.87]);
  const [mapZoom, setMapZoom] = useState(12);
  const [filteredPotholes, setFilteredPotholes] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef(null);

  // Pune center coordinates (default)
  const defaultCenter = [18.52, 73.87];
  const defaultZoom = 12;
  
  // Auto-refresh interval (5 seconds)
  const REFRESH_INTERVAL = 5000;

  // Refresh data without showing loading state
  const refreshData = () => {
    fetchPotholes(true);
  };

  useEffect(() => {
    fetchPotholes();
    
    // Check for initial navigation state
    const initialPothole = selectedPothole || location.state?.pothole;
    if (initialPothole && initialPothole.latitude && initialPothole.longitude) {
      setMapCenter([initialPothole.latitude, initialPothole.longitude]);
      setMapZoom(18);
    }
    
    // Set up auto-refresh
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        refreshData();
      }, REFRESH_INTERVAL);
    }

    // Cleanup interval on unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const fetchPotholes = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const data = await getPotholes();
      
      // Only update if data actually changed (check by count or latest timestamp)
      const hasNewData = data.length !== potholes.length || 
        (data.length > 0 && potholes.length > 0 && 
         new Date(data[0].timestamp) > new Date(potholes[0]?.timestamp || 0));
      
      if (hasNewData || !isRefresh) {
        setPotholes(data);
        
        // Update filtered potholes if no location filter is active
        if (!selectedLocation) {
          setFilteredPotholes(data);
        } else {
          // Re-apply location filter with new data (use fresh data, not state)
          const filtered = data.filter(pothole => {
            const distance = calculateDistance(
              selectedLocation.lat,
              selectedLocation.lon,
              pothole.latitude,
              pothole.longitude
            );
            return distance <= 50;
          });
          setFilteredPotholes(filtered);
        }
      }
      
      setLastUpdate(new Date());
      setError(null);
      
      // Don't pre-fetch all addresses - only fetch when popup is opened
      // This prevents making 200+ API calls on page load
    } catch (err) {
      setError('Failed to load pothole data');
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Filter potholes by location (within radius)
  const filterPotholesByLocation = (centerLat, centerLon, radiusKm = 50) => {
    const filtered = potholes.filter(pothole => {
      const distance = calculateDistance(
        centerLat,
        centerLon,
        pothole.latitude,
        pothole.longitude
      );
      return distance <= radiusKm;
    });
    
    setFilteredPotholes(filtered);
    
    // Update map view
    setMapCenter([centerLat, centerLon]);
    setMapZoom(12);
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  // Handle selected pothole - zoom to it on map (priority over location search)
  useEffect(() => {
    // Check both prop and navigation state
    const potholeToNavigate = selectedPothole || location.state?.pothole;
    
    if (potholeToNavigate && potholeToNavigate.latitude && potholeToNavigate.longitude) {
      // Use exact coordinates from the pothole
      const lat = potholeToNavigate.latitude;
      const lon = potholeToNavigate.longitude;
      setMapCenter([lat, lon]);
      setMapZoom(18); // Zoom in very close to show exact location
      
      // Don't clear immediately - let user see the location
      // Clear the selected pothole after a longer delay so it can be selected again
      const timeoutId = setTimeout(() => {
        if (onClearPothole) {
          onClearPothole();
        }
      }, 5000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [selectedPothole, location.state, onClearPothole]);

  // Handle location search (only if no pothole is selected)
  useEffect(() => {
    // Don't override if we're navigating to a specific pothole
    const potholeToNavigate = selectedPothole || location.state?.pothole;
    if (potholeToNavigate) {
      return; // Skip location search effect if navigating to pothole
    }
    
    if (selectedLocation) {
      filterPotholesByLocation(selectedLocation.lat, selectedLocation.lon, 50);
    } else {
      setFilteredPotholes(potholes);
      // Only reset to default if no pothole navigation is happening
      if (!potholeToNavigate) {
        setMapCenter(defaultCenter);
        setMapZoom(defaultZoom);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, potholes, selectedPothole, location.state]);

  // Handle location search
  const handleLocationSelectInternal = (location) => {
    if (onLocationSelect) {
      onLocationSelect(location);
    }
  };

  // Clear location filter
  const handleClearLocationInternal = () => {
    if (onClearLocation) {
      onClearLocation();
    }
  };

  const fetchAddressForPothole = async (pothole) => {
    const key = `${pothole.latitude},${pothole.longitude}`;
    
    // Check if already cached in component state
    if (addressCache[key]) {
      return addressCache[key];
    }

    // Check if already loading
    if (addressCache[key] === 'loading') {
      return null;
    }

    // Mark as loading
    setAddressCache(prev => ({
      ...prev,
      [key]: 'loading'
    }));

    try {
      const address = await geocodingService.getAddress(
        pothole.latitude,
        pothole.longitude
      );
      
      setAddressCache(prev => ({
        ...prev,
        [key]: address
      }));
      
      return address;
    } catch (err) {
      // Set to null on error so we can retry later
      setAddressCache(prev => ({
        ...prev,
        [key]: null
      }));
      return null;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getAddressDisplay = (pothole) => {
    const key = `${pothole.latitude},${pothole.longitude}`;
    const address = addressCache[key];
    
    if (address === 'loading') {
      return 'Loading address...';
    }
    
    if (!address) {
      // Show coordinates as fallback while loading
      return `${pothole.latitude.toFixed(4)}, ${pothole.longitude.toFixed(4)}`;
    }

    const parts = [];
    if (address.road) parts.push(address.road);
    if (address.suburb) parts.push(address.suburb);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.postcode) parts.push(address.postcode);

    return parts.length > 0 ? parts.join(', ') : address.display_name;
  };

  // Fetch address when popup is opened
  const handlePopupOpen = (pothole) => {
    const key = `${pothole.latitude},${pothole.longitude}`;
    const cached = addressCache[key];
    
    // Only fetch if we don't have a valid address and it's not already loading
    if (cached !== 'loading' && !cached) {
      fetchAddressForPothole(pothole);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading pothole data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '100%', width: '100%' }}
      >
        <MapController center={mapCenter} zoom={mapZoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MarkerClusterGroup>
          {filteredPotholes.map((pothole) => (
            <Marker
              key={pothole._id}
              position={[pothole.latitude, pothole.longitude]}
              icon={createSeverityIcon(pothole.severity)}
              eventHandlers={{
                popupopen: () => handlePopupOpen(pothole)
              }}
            >
              <Popup>
                <div className="p-2 min-w-[250px]">
                  <h3 className="font-bold text-lg mb-2">
                    Pothole Event
                  </h3>
                  
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-semibold">Address:</span>{' '}
                      {getAddressDisplay(pothole)}
                    </p>
                    
                    <p>
                      <span className="font-semibold">Timestamp:</span>{' '}
                      {formatDate(pothole.timestamp)}
                    </p>
                    
                    <p>
                      <span className="font-semibold">Severity:</span>{' '}
                      <span className={`font-bold ${
                        pothole.severity === 'severe' ? 'text-red-600' :
                        pothole.severity === 'moderate' ? 'text-orange-600' :
                        'text-green-600'
                      }`}>
                        {pothole.severity.toUpperCase()}
                      </span>
                    </p>
                    
                    <p>
                      <span className="font-semibold">dValue:</span>{' '}
                      {pothole.dValue}
                    </p>
                    
                    <p>
                      <span className="font-semibold">Acceleration:</span>{' '}
                      X: {pothole.acceleration.x}, Y: {pothole.acceleration.y}, Z: {pothole.acceleration.z}
                    </p>
                    
                    <p>
                      <span className="font-semibold">Depth:</span>{' '}
                      {pothole.depth} cm
                    </p>
                    
                    <p>
                      <span className="font-semibold">Width:</span>{' '}
                      {pothole.width} cm
                    </p>
                    
                    <p>
                      <span className="font-semibold">Device ID:</span>{' '}
                      {pothole.device_id}
                    </p>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
};

export default MapPage;

