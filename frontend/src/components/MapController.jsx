import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

// Component to control map view from parent
const MapController = ({ center, zoom }) => {
  const map = useMap();
  const prevCenterRef = useRef(null);
  const prevZoomRef = useRef(null);

  useEffect(() => {
    if (center && zoom) {
      const centerKey = `${center[0]},${center[1]}`;
      const prevCenterKey = prevCenterRef.current ? `${prevCenterRef.current[0]},${prevCenterRef.current[1]}` : null;
      
      // Only update if center or zoom actually changed
      if (centerKey !== prevCenterKey || zoom !== prevZoomRef.current) {
        map.setView(center, zoom, {
          animate: true,
          duration: 1.5
        });
        prevCenterRef.current = center;
        prevZoomRef.current = zoom;
      }
    }
  }, [center, zoom, map]);

  return null;
};

export default MapController;

