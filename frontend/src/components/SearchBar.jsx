import { useState, useEffect, useRef } from 'react';

const SearchBar = ({ onLocationSelect, onClear }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout
    searchTimeoutRef.current = setTimeout(() => {
      searchAddresses(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const searchAddresses = async (query) => {
    setIsLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PotholeApp/1.0'
        },
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      // Format suggestions
      const formatted = data.map(item => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        city: item.address?.city || item.address?.town || item.address?.village || item.address?.county || '',
        state: item.address?.state || item.address?.region || '',
        country: item.address?.country || ''
      }));

      setSuggestions(formatted);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Search error:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (suggestion) => {
    setSearchQuery(suggestion.display_name);
    setShowSuggestions(false);
    if (onLocationSelect) {
      onLocationSelect({
        lat: suggestion.lat,
        lon: suggestion.lon,
        name: suggestion.display_name,
        city: suggestion.city,
        state: suggestion.state
      });
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    if (onClear) {
      onClear();
    }
  };

  return (
    <div className="relative w-full z-[2000]" ref={suggestionsRef}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a location (e.g., Pune, Warangal)..."
          className="flex-1 h-10 px-4 pr-12 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-white text-gray-900 placeholder-gray-500"
        />
        <button
          type="button"
          onClick={searchQuery ? handleClear : () => {
            if (searchQuery.trim().length >= 3) {
              searchAddresses(searchQuery);
            }
          }}
          className="h-10 bg-black text-white px-4 rounded-r-lg hover:bg-gray-800 transition-colors flex items-center justify-center min-w-[48px]"
          title={searchQuery ? "Clear search" : "Search"}
        >
          {isLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
          ) : searchQuery ? (
            <span className="text-white text-lg font-bold">×</span>
          ) : (
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-[2000] w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSelect(suggestion)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors"
            >
              <div className="font-medium text-gray-900">{suggestion.display_name}</div>
              {(suggestion.city || suggestion.state) && (
                <div className="text-sm text-gray-500">
                  {[suggestion.city, suggestion.state].filter(Boolean).join(', ')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;

