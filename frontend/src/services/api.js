import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Get all potholes
export const getPotholes = async () => {
  const response = await api.get('/potholes');
  return response.data;
};

// Create a new pothole
export const createPothole = async (potholeData) => {
  const response = await api.post('/potholes', potholeData);
  return response.data;
};

// Get pothole statistics
export const getPotholeStats = async () => {
  const response = await api.get('/potholes/stats');
  return response.data;
};

export default api;

