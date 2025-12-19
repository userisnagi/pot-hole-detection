import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { getPotholes, getPotholeStats } from '../services/api';
import geocodingService from '../services/geocoding';
import SearchBar from '../components/SearchBar';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard = ({ selectedLocation, onLocationSelect, onClearLocation, onPotholeSelect }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [potholes, setPotholes] = useState([]);
  const [filteredPotholes, setFilteredPotholes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationStats, setLocationStats] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [severeModeratePotholes, setSevereModeratePotholes] = useState([]);
  const [areaGroups, setAreaGroups] = useState([]);
  const [expandedAreas, setExpandedAreas] = useState(new Set());
  const [areaNames, setAreaNames] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredAreaGroups, setFilteredAreaGroups] = useState([]);
  const refreshIntervalRef = useRef(null);

  // Auto-refresh interval (10 seconds for dashboard - less frequent than map)
  const REFRESH_INTERVAL = 10000;

  // Refresh data without showing loading state
  const refreshData = () => {
    fetchData(true);
  };

  useEffect(() => {
    fetchData();
    
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

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      
      // Fetch stats and potholes in parallel
      const [statsData, potholesData] = await Promise.all([
        getPotholeStats(),
        getPotholes()
      ]);
      
      // Only update if data changed
      const hasNewData = statsData.total !== stats?.total || 
        potholesData.length !== potholes.length;
      
      if (hasNewData || !isRefresh) {
        setStats(statsData);
        setPotholes(potholesData);
        
        // Update filtered potholes if no location filter is active
        if (!selectedLocation) {
          setFilteredPotholes(potholesData);
        } else {
          // Re-apply location filter with new data
          await filterPotholesByLocation(selectedLocation, 50);
        }
      }
      
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Group potholes by area and fetch area names
  const processAreaGroups = async (potholesData) => {
    // Group potholes by rounded coordinates (to group nearby potholes)
    const locationGroups = {};
    potholesData.forEach(pothole => {
      // Round to 3 decimal places (~100m precision) to group nearby potholes
      const key = `${pothole.latitude.toFixed(3)},${pothole.longitude.toFixed(3)}`;
      if (!locationGroups[key]) {
        locationGroups[key] = {
          lat: pothole.latitude,
          lon: pothole.longitude,
          potholes: []
        };
      }
      locationGroups[key].potholes.push(pothole);
    });

    // Fetch area names for each group
    const groupsWithNames = [];
    const newAreaNames = { ...areaNames };

    for (const [key, group] of Object.entries(locationGroups)) {
      try {
        const address = await geocodingService.getAddress(group.lat, group.lon);
        const areaName = address.road || address.suburb || address.city || 
                        address.display_name || `${group.lat.toFixed(4)}, ${group.lon.toFixed(4)}`;
        
        newAreaNames[key] = areaName;
        
        groupsWithNames.push({
          key,
          areaName,
          lat: group.lat,
          lon: group.lon,
          potholes: group.potholes,
          count: group.potholes.length,
          severe: group.potholes.filter(p => p.severity === 'severe').length,
          moderate: group.potholes.filter(p => p.severity === 'moderate').length
        });
      } catch (err) {
        // Use coordinates as fallback
        const areaName = `${group.lat.toFixed(4)}, ${group.lon.toFixed(4)}`;
        newAreaNames[key] = areaName;
        
        groupsWithNames.push({
          key,
          areaName,
          lat: group.lat,
          lon: group.lon,
          potholes: group.potholes,
          count: group.potholes.length,
          severe: group.potholes.filter(p => p.severity === 'severe').length,
          moderate: group.potholes.filter(p => p.severity === 'moderate').length
        });
      }
    }

    // Sort by total count (descending)
    groupsWithNames.sort((a, b) => b.count - a.count);
    
    setAreaGroups(groupsWithNames);
    setAreaNames(newAreaNames);
  };

  // Calculate distance between two coordinates
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Filter potholes by location
  const filterPotholesByLocation = async (location, radiusKm = 50) => {
    const filtered = potholes.filter(pothole => {
      const distance = calculateDistance(
        location.lat,
        location.lon,
        pothole.latitude,
        pothole.longitude
      );
      return distance <= radiusKm;
    });

    setFilteredPotholes(filtered);
    
    // Calculate stats for filtered potholes
    const filteredStats = {
      total: filtered.length,
      bySeverity: {
        low: filtered.filter(p => p.severity === 'low').length,
        moderate: filtered.filter(p => p.severity === 'moderate').length,
        severe: filtered.filter(p => p.severity === 'severe').length
      }
    };
    
    setLocationStats(filteredStats);
  };

  // Filter area groups based on search query
  const filterAreaGroups = (groups, query) => {
    if (!query.trim()) {
      return groups;
    }

    const lowerQuery = query.toLowerCase().trim();
    
    return groups.filter(area => {
      // Search in area name
      if (area.areaName.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      
      // Search in coordinates
      const coordString = `${area.lat.toFixed(4)}, ${area.lon.toFixed(4)}`;
      if (coordString.includes(lowerQuery)) {
        return true;
      }
      
      // Search in pothole details within this area
      const matchingPotholes = area.potholes.filter(pothole => {
        // Search in device ID
        if (pothole.device_id?.toLowerCase().includes(lowerQuery)) {
          return true;
        }
        
        // Search in severity
        if (pothole.severity?.toLowerCase().includes(lowerQuery)) {
          return true;
        }
        
        // Search in coordinates
        const potholeCoord = `${pothole.latitude.toFixed(4)}, ${pothole.longitude.toFixed(4)}`;
        if (potholeCoord.includes(lowerQuery)) {
          return true;
        }
        
        // Search in timestamp
        const dateStr = new Date(pothole.timestamp).toLocaleString().toLowerCase();
        if (dateStr.includes(lowerQuery)) {
          return true;
        }
        
        return false;
      });
      
      // If any pothole in this area matches, include the area
      return matchingPotholes.length > 0;
    });
  };

  // Filter severe and moderate potholes and group by area
  useEffect(() => {
    const severeModerate = filteredPotholes.filter(p => 
      p.severity === 'severe' || p.severity === 'moderate'
    );
    setSevereModeratePotholes(severeModerate);
    
    // Process area groups
    if (severeModerate.length > 0) {
      processAreaGroups(severeModerate);
    } else {
      setAreaGroups([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredPotholes]);

  // Filter area groups when search query or areaGroups changes
  useEffect(() => {
    const filtered = filterAreaGroups(areaGroups, searchQuery);
    setFilteredAreaGroups(filtered);
  }, [searchQuery, areaGroups]);

  // Handle location search
  useEffect(() => {
    if (selectedLocation) {
      filterPotholesByLocation(selectedLocation, 50);
    } else {
      setFilteredPotholes(potholes);
      setLocationStats(null);
    }
  }, [selectedLocation, potholes]);

  // Handle pothole click - navigate to map with exact coordinates
  const handlePotholeClick = (pothole) => {
    if (onPotholeSelect) {
      onPotholeSelect(pothole);
    }
    // Navigate to map page - MapPage will handle zooming to exact coordinates
    navigate('/', { state: { pothole: pothole } });
  };

  // Handle area click - navigate to map with exact pothole coordinates
  const handleAreaClick = (area) => {
    // Use the first pothole in the area for navigation to exact coordinates
    const firstPothole = area.potholes[0];
    if (firstPothole) {
      // Select the pothole to trigger map navigation
      if (onPotholeSelect) {
        onPotholeSelect(firstPothole);
      }
      // Navigate to map page with state - MapPage will handle zooming to exact coordinates
      navigate('/', { state: { pothole: firstPothole } });
    }
  };

  // Toggle area expansion
  const toggleArea = (areaKey) => {
    setExpandedAreas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(areaKey)) {
        newSet.delete(areaKey);
      } else {
        newSet.add(areaKey);
      }
      return newSet;
    });
  };

  // Handle location search
  const handleLocationSelectInternal = (location) => {
    if (onLocationSelect) {
      onLocationSelect(location);
    }
  };

  // Clear location filter
  const handleClearLocationInternal = async () => {
    if (onClearLocation) {
      onClearLocation();
    }
  };

  // Use location stats if available, otherwise use global stats
  const displayStats = locationStats || stats;

  // Chart data for severity distribution
  const chartData = displayStats ? {
    labels: ['Low', 'Moderate', 'Severe'],
    datasets: [
      {
        label: 'Number of Potholes',
        data: [
          displayStats.bySeverity.low,
          displayStats.bySeverity.moderate,
          displayStats.bySeverity.severe
        ],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',  // green
          'rgba(249, 115, 22, 0.8)', // orange
          'rgba(239, 68, 68, 0.8)'   // red
        ],
        borderColor: [
          'rgba(34, 197, 94, 1)',
          'rgba(249, 115, 22, 1)',
          'rgba(239, 68, 68, 1)'
        ],
        borderWidth: 1,
      },
    ],
  } : null;

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Pothole Severity Distribution',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading dashboard...</div>
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
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="w-80">
          <SearchBar 
            onLocationSelect={handleLocationSelectInternal}
            onClear={handleClearLocationInternal}
          />
        </div>
      </div>

      {selectedLocation && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded">
          <p className="text-sm text-gray-700">
            <strong>Filtered by location:</strong> {selectedLocation.name}
            {selectedLocation.city && `, ${selectedLocation.city}`}
            {selectedLocation.state && `, ${selectedLocation.state}`}
            {' '}(Showing potholes within 50km)
          </p>
          <button
            onClick={handleClearLocationInternal}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Clear filter
          </button>
        </div>
      )}
      
      {/* Total Potholes Card */}
      <div className="bg-blue-500 text-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-2">
          {selectedLocation ? 'Filtered' : 'Total'} Potholes
        </h2>
        <p className="text-4xl font-bold">{displayStats?.total || 0}</p>
      </div>

      {/* Severity Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-green-500 text-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold mb-2">Low Severity</h3>
          <p className="text-3xl font-bold">{displayStats?.bySeverity.low || 0}</p>
        </div>
        
        <div className="bg-orange-500 text-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold mb-2">Moderate Severity</h3>
          <p className="text-3xl font-bold">{displayStats?.bySeverity.moderate || 0}</p>
        </div>
        
        <div className="bg-red-500 text-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold mb-2">Severe Severity</h3>
          <p className="text-3xl font-bold">{displayStats?.bySeverity.severe || 0}</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        {chartData && (
          <div style={{ maxHeight: '400px' }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        )}
      </div>

      {/* Severe and Moderate Potholes by Area */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            Severe & Moderate Potholes by Area
            {selectedLocation && <span className="text-lg font-normal text-gray-600 ml-2">(Filtered by location)</span>}
          </h2>
        </div>
        
        {/* Search Input */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by area name, coordinates, device ID, severity, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-sm text-gray-600">
              Showing {filteredAreaGroups.length} of {areaGroups.length} areas
            </p>
          )}
        </div>

        {(searchQuery ? filteredAreaGroups : areaGroups).length > 0 ? (
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {(searchQuery ? filteredAreaGroups : areaGroups).map((area) => {
              const isExpanded = expandedAreas.has(area.key);
              return (
                <div key={area.key} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Area Header */}
                  <div className="w-full p-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => toggleArea(area.key)}
                    >
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900">{area.areaName}</h3>
                        <span className="text-sm text-gray-500">
                          ({area.lat.toFixed(4)}, {area.lon.toFixed(4)})
                        </span>
                        {isExpanded && (
                          <svg 
                            className="w-4 h-4 text-gray-500" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600">
                          Total: <strong className="text-gray-900">{area.count}</strong>
                        </span>
                        <span className="text-red-600">
                          Severe: <strong>{area.severe}</strong>
                        </span>
                        <span className="text-orange-600">
                          Moderate: <strong>{area.moderate}</strong>
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAreaClick(area);
                      }}
                      className="ml-4 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                      title="Navigate to this location on map"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded Potholes List */}
                  {isExpanded && (
                    <div className="bg-white border-t border-gray-200">
                      <div className="p-4 space-y-3">
                        {area.potholes
                          .filter((pothole) => {
                            // If search query exists, filter potholes
                            if (!searchQuery.trim()) {
                              return true;
                            }
                            const lowerQuery = searchQuery.toLowerCase().trim();
                            return (
                              pothole.device_id?.toLowerCase().includes(lowerQuery) ||
                              pothole.severity?.toLowerCase().includes(lowerQuery) ||
                              `${pothole.latitude.toFixed(4)}, ${pothole.longitude.toFixed(4)}`.includes(lowerQuery) ||
                              new Date(pothole.timestamp).toLocaleString().toLowerCase().includes(lowerQuery)
                            );
                          })
                          .sort((a, b) => {
                            // Sort by severity (severe first) then by timestamp (newest first)
                            if (a.severity === 'severe' && b.severity !== 'severe') return -1;
                            if (a.severity !== 'severe' && b.severity === 'severe') return 1;
                            return new Date(b.timestamp) - new Date(a.timestamp);
                          })
                          .map((pothole) => (
                            <div
                              key={pothole._id}
                              className="p-4 bg-gray-50 rounded-lg border-l-4 border-transparent hover:border-blue-500 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                                      pothole.severity === 'severe' 
                                        ? 'bg-red-100 text-red-700' 
                                        : 'bg-orange-100 text-orange-700'
                                    }`}>
                                      {pothole.severity.toUpperCase()}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                      {new Date(pothole.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="text-gray-700">
                                    <p className="text-sm text-gray-600 mb-1">
                                      Depth: {pothole.depth} cm | Width: {pothole.width} cm | dValue: {pothole.dValue}
                                    </p>
                                    <p className="text-xs text-gray-500">Device: {pothole.device_id}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePotholeClick(pothole);
                                  }}
                                  className="ml-4 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                                  title="Navigate to this location on map"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : severeModeratePotholes.length === 0 ? (
          <p className="text-gray-500">No severe or moderate potholes found.</p>
        ) : (
          <p className="text-gray-500">Loading area data...</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

