# Pothole Detection System

Pothole Detection System is a full-stack web application designed to detect and visualize potholes using sensor data from IoT devices. The project consists of a React-based frontend and a Node.js/Express backend with MongoDB as the database. It supports real-time pothole detection, interactive map visualization, severity analysis, and location-based filtering.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Frontend](#frontend)
- [Backend](#backend)
- [Folder Structure](#folder-structure)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Features](#features)
- [License](#license)

---

## Project Overview

Pothole Detection System is an IoT-enabled application where connected devices (ESP32 sensors) detect potholes and send data to the backend API. The application features interactive map visualization with color-coded severity markers, real-time auto-refresh, reverse geocoding for address lookup, dashboard analytics with charts, and location-based search and filtering capabilities.

---

## Tech Stack

### Frontend

- **React 18** - UI library for building interactive user interfaces
- **Vite** - Fast frontend build tool and development server
- **Tailwind CSS** - Utility-first CSS framework for styling
- **React Router DOM** - Client-side routing
- **Axios** - HTTP client for API requests
- **Leaflet & React-Leaflet** - Interactive maps and mapping components
- **Chart.js & React-Chartjs-2** - Data visualization and charting
- **Leaflet MarkerCluster** - Marker clustering for map performance

### Backend

- **Node.js & Express 4** - Server-side runtime and web framework
- **MongoDB & Mongoose** - NoSQL database and object modeling
- **CORS** - Cross-Origin Resource Sharing
- **dotenv** - Environment variable management

---

## Frontend

The frontend is built with React and uses Vite as the build tool. It features:

- Component-based architecture with reusable components such as Navbar, Footer, MapController, SearchBar, ErrorBoundary
- React Router for navigation between pages like Map Page and Dashboard
- Leaflet maps with interactive markers, clustering, and popups
- Real-time auto-refresh functionality (5 seconds for map, 10 seconds for dashboard)
- Reverse geocoding service with rate limiting and localStorage caching
- Tailwind CSS for responsive and modern styling
- Axios for communicating with the backend API
- Chart.js for data visualization and statistics

---

## Backend

The backend is an Express server that provides RESTful APIs for:

- Pothole event creation and management (CRUD operations)
- Statistics aggregation and analysis
- Data persistence with MongoDB
- CORS configuration for frontend communication
- Open API design (no authentication required) for IoT device integration

It uses MongoDB as the database with Mongoose for schema modeling. The backend accepts sensor data from IoT devices (ESP32) and stores pothole detections with GPS coordinates, severity levels, sensor readings, and device information.

---

## Folder Structure

```
/
├── frontend/              # React frontend source code
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components (Navbar, Footer, MapController, SearchBar, ErrorBoundary)
│   │   ├── pages/         # React pages for routing (MapPage, Dashboard)
│   │   ├── services/      # API client and geocoding service
│   │   ├── App.jsx        # Main app component
│   │   ├── main.jsx       # Entry point
│   │   └── index.css      # Global styles
│   ├── package.json       # Frontend dependencies and scripts
│   ├── vite.config.js     # Vite configuration
│   └── tailwind.config.js # Tailwind CSS configuration
│
├── backend/               # Express backend source code
│   ├── middleware/        # Express middlewares (auth)
│   ├── models/            # Mongoose models (Pothole)
│   ├── routes/            # Express route definitions (potholeRoutes)
│   ├── scripts/           # Utility scripts (checkDatabase, generateApiKey, listDatabases)
│   ├── server.js          # Backend entry point
│   ├── seedData.js        # Database seeder script
│   └── package.json       # Backend dependencies and scripts
│
└── README.md              # Project documentation (this file)
```

---

## Getting Started

### Prerequisites

- Node.js (v16 or higher recommended)
- MongoDB instance (local or cloud)
- npm or yarn package manager

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd "pot hole detection"
```

2. Setup Backend:

```bash
cd backend
npm install
```

3. Setup Frontend:

```bash
cd ../frontend
npm install
```

### Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/pothole_detection
```

**Note:** If `.env` file is not present, the server will use default values (PORT=5000, MONGODB_URI=mongodb://127.0.0.1:27017/pothole_detection)

### Running the Application

1. **Start MongoDB:**

Make sure MongoDB is running on your system:

```bash
# On Windows (if installed as service, it should start automatically)
# Or start manually:
mongod

# On macOS/Linux
sudo systemctl start mongod
# or
mongod
```

2. **Seed the Database (Optional):**

From the `backend` directory:

```bash
npm run seed
```

This will create 100 sample pothole events (30 severe, 40 moderate, 30 low) located around Pune, India.

3. **Start the Backend Server:**

```bash
cd backend
npm start
```

The backend will run on `http://localhost:5000`

4. **Start the Frontend Development Server:**

```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:3000` and will communicate with the backend API running on `http://localhost:5000`.

---

## Scripts

### Frontend (frontend)

- `npm run dev` - Start development server
- `npm run build` - Build production assets
- `npm run preview` - Preview production build

### Backend (backend)

- `npm start` - Start server
- `npm run dev` - Start server with watch mode (auto-restart on changes)
- `npm run seed` - Seed database with sample pothole data

---

## API Endpoints

### POST /api/potholes
Create a new pothole event.

**Request Body:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "latitude": 18.52,
  "longitude": 73.87,
  "dValue": 7.5,
  "severity": "moderate",
  "acceleration": {
    "x": 0.5,
    "y": -0.3,
    "z": 9.8
  },
  "vibration_pattern": [1.2, 2.3, 1.8, 2.1],
  "depth": 12.5,
  "width": 25.0,
  "device_id": "car08_esp32",
  "event_id": "event_unique_12345",
  "flagged": false
}
```

### GET /api/potholes
Get all pothole events sorted by timestamp (newest first).

**Response:**
```json
[
  {
    "_id": "...",
    "timestamp": "2024-01-15T10:30:00Z",
    "latitude": 18.52,
    "longitude": 73.87,
    "severity": "moderate",
    ...
  }
]
```

### GET /api/potholes/stats
Get pothole statistics.

**Response:**
```json
{
  "total": 100,
  "bySeverity": {
    "low": 30,
    "moderate": 40,
    "severe": 30
  }
}
```

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "message": "Server is running"
}
```

---

## Features

- **Interactive Map Visualization**: View all pothole detections on an interactive map with marker clustering for better performance
- **Severity Color Coding**: Visual severity indication with color-coded markers (green=low, orange=moderate, red=severe)
- **Reverse Geocoding**: Automatic address lookup using Nominatim OpenStreetMap API with rate limiting and localStorage caching
- **Real-time Updates**: Auto-refresh functionality (5 seconds for map, 10 seconds for dashboard) to show new detections
- **Dashboard Analytics**: Statistics dashboard with total counts, severity breakdown, and interactive bar charts
- **Location-based Filtering**: Search and filter potholes by location within a 50km radius
- **Area Grouping**: Group severe and moderate potholes by geographic area with expandable sections
- **Search Functionality**: Search potholes by area name, coordinates, device ID, severity, or date
- **Marker Clustering**: Groups nearby markers for better map performance and user experience
- **Open API Design**: No authentication required, allowing easy integration with IoT devices on the same network

---

## License

This project is for educational purposes.

---

This README provides a comprehensive overview of the Pothole Detection System project, its tech stack, structure, and instructions to get started with development and deployment.
