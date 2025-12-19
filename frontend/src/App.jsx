import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import MapPage from './pages/MapPage';
import Dashboard from './pages/Dashboard';
import Footer from './components/Footer';

function App() {
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedPothole, setSelectedPothole] = useState(null);

  const handleLocationSelect = (location) => {
    setSelectedLocation(location);
  };

  const handleClearLocation = () => {
    setSelectedLocation(null);
  };

  const handlePotholeSelect = (pothole) => {
    setSelectedPothole(pothole);
  };

  const handleClearPothole = () => {
    setSelectedPothole(null);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar 
        onLocationSelect={handleLocationSelect}
        onClearLocation={handleClearLocation}
        selectedLocation={selectedLocation}
      />
      <main className="flex-grow">
        <Routes>
          <Route 
            path="/" 
            element={
              <MapPage 
                selectedLocation={selectedLocation}
                selectedPothole={selectedPothole}
                onLocationSelect={handleLocationSelect}
                onClearLocation={handleClearLocation}
                onClearPothole={handleClearPothole}
              />
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <Dashboard 
                selectedLocation={selectedLocation}
                onLocationSelect={handleLocationSelect}
                onClearLocation={handleClearLocation}
                onPotholeSelect={handlePotholeSelect}
              />
            } 
          />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;

