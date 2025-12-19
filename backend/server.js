import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import potholeRoutes from './routes/potholeRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, embedded systems, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    // Allow requests from allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development, allow all origins (for testing embedded systems)
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB (supports both local and MongoDB Atlas)
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pothole_detection';

mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  const dbType = mongoURI.includes('mongodb.net') || mongoURI.includes('mongodb+srv') 
    ? 'MongoDB Atlas (Cloud)' 
    : 'Local MongoDB';
  console.log(`✅ Connected to ${dbType}`);
  console.log(`   Database: ${mongoose.connection.name}`);
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error.message);
  console.error('   Make sure your MONGODB_URI is correct in .env file');
});

// Routes
app.use('/api/potholes', potholeRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Start server - listen on all interfaces (0.0.0.0) to accept external connections
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Accessible from external devices on: http://YOUR_IP:${PORT}`);
  
  console.log(`\n🌐 API Status: OPEN (No authentication required)`);
  console.log(`   Anyone on the same network can send data`);
  
  console.log(`\n📝 To send data from embedded system:`);
  console.log(`   POST http://YOUR_IP:${PORT}/api/potholes`);
  console.log(`   Content-Type: application/json`);
});

