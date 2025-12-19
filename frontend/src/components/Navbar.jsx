import { Link, useLocation } from 'react-router-dom';
import SearchBar from './SearchBar';

const Navbar = ({ onLocationSelect, onClearLocation, selectedLocation }) => {
  const location = useLocation();

  return (
    <nav className="bg-blue-600 text-white shadow-lg relative z-[2000]">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold whitespace-nowrap">
            Pothole Detection System
          </Link>
          
          <div className="flex-1 max-w-2xl mx-4">
            <SearchBar 
              onLocationSelect={onLocationSelect}
              onClear={onClearLocation}
            />
          </div>
          
          <div className="flex space-x-4">
            <Link
              to="/"
              className={`px-4 py-2 rounded transition ${
                location.pathname === '/'
                  ? 'bg-blue-700'
                  : 'hover:bg-blue-700'
              }`}
            >
              Map
            </Link>
            <Link
              to="/dashboard"
              className={`px-4 py-2 rounded transition ${
                location.pathname === '/dashboard'
                  ? 'bg-blue-700'
                  : 'hover:bg-blue-700'
              }`}
            >
              Dashboard
            </Link>
          </div>
        </div>
        {selectedLocation && (
          <div className="mt-2 text-sm text-blue-100">
            Showing potholes near: <strong>{selectedLocation.name}</strong>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

