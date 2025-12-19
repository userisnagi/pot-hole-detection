// Rate-limited reverse geocoding service using Nominatim API

class GeocodingService {
  constructor() {
    this.requestQueue = [];
    this.isProcessing = false;
    this.cache = this.loadCache();
    this.rateLimitDelay = 1200; // 1.2 seconds between requests (Nominatim allows 1 req/sec)
    this.pendingRequests = new Map(); // Track pending requests to avoid duplicates
  }

  // Load cache from localStorage
  loadCache() {
    try {
      // Check if localStorage is available (may be blocked by Brave Shields)
      if (typeof Storage === 'undefined' || !localStorage) {
        console.warn('localStorage not available - caching disabled');
        return {};
      }
      const cached = localStorage.getItem('geocoding_cache');
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.warn('Failed to load geocoding cache:', error.message);
      return {};
    }
  }

  // Save cache to localStorage
  saveCache() {
    try {
      // Check if localStorage is available
      if (typeof Storage === 'undefined' || !localStorage) {
        return; // Silently fail if localStorage not available
      }
      localStorage.setItem('geocoding_cache', JSON.stringify(this.cache));
    } catch (error) {
      // localStorage might be full, unavailable, or blocked (Brave Shields)
      console.warn('Failed to save geocoding cache:', error.message);
    }
  }

  // Generate cache key from coordinates
  getCacheKey(lat, lon) {
    // Round to 4 decimal places (~11 meters precision) for cache key
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  // Process the request queue
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const { lat, lon, resolve, reject } = this.requestQueue.shift();

      try {
        const result = await this.fetchAddress(lat, lon);
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Wait before next request (rate limiting)
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
      }
    }

    this.isProcessing = false;
  }

  // Fetch address from Nominatim API
  async fetchAddress(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'PotholeApp/1.0'
        },
        // Add mode for better CORS handling
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.statusText}`);
      }

      const data = await response.json();
    
      // Extract address components
      const address = data.address || {};
      const result = {
        display_name: data.display_name || 'Unknown location',
        road: address.road || '',
        suburb: address.suburb || address.neighbourhood || '',
        city: address.city || address.town || address.village || '',
        state: address.state || '',
        postcode: address.postcode || ''
      };

      // Cache the result
      const cacheKey = this.getCacheKey(lat, lon);
      this.cache[cacheKey] = result;
      this.saveCache();

      return result;
    } catch (error) {
      // Handle network errors, CORS issues, or Brave Shields blocking
      console.error('Geocoding API error:', error.message);
      throw new Error(`Failed to fetch address: ${error.message}`);
    }
  }

  // Get address for coordinates (with caching and rate limiting)
  async getAddress(lat, lon) {
    return new Promise((resolve, reject) => {
      // Check cache first
      const cacheKey = this.getCacheKey(lat, lon);
      if (this.cache[cacheKey]) {
        resolve(this.cache[cacheKey]);
        return;
      }

      // Check if there's already a pending request for these coordinates
      if (this.pendingRequests.has(cacheKey)) {
        // Wait for the existing request
        this.pendingRequests.get(cacheKey).then(resolve).catch(reject);
        return;
      }

      // Create new pending request
      const requestPromise = new Promise((innerResolve, innerReject) => {
        this.requestQueue.push({ 
          lat, 
          lon, 
          resolve: (result) => {
            this.pendingRequests.delete(cacheKey);
            innerResolve(result);
          }, 
          reject: (error) => {
            this.pendingRequests.delete(cacheKey);
            innerReject(error);
          }
        });
        this.processQueue();
      });

      this.pendingRequests.set(cacheKey, requestPromise);
      requestPromise.then(resolve).catch(reject);
    });
  }

  // Clear cache
  clearCache() {
    this.cache = {};
    this.saveCache();
  }
}

// Export singleton instance
const geocodingService = new GeocodingService();
export default geocodingService;

