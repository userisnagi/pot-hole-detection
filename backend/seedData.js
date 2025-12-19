import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Pothole from './models/Pothole.js';

dotenv.config();

// Generate random number between min and max
const random = (min, max) => Math.random() * (max - min) + min;

// Generate random integer between min and max (inclusive)
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Generate random array of numbers for vibration pattern
const generateVibrationPattern = () => {
  const length = randomInt(5, 15);
  return Array.from({ length }, () => random(0, 10));
};

// Generate sample pothole data
const generatePothole = (severity, index) => {
  // Pune coordinates: 18.46-18.57 N, 73.81-73.93 E
  const lat = random(18.46, 18.57);
  const lon = random(73.81, 73.93);
  
  // Device IDs
  const devices = ['car08_esp32', 'car12_esp32', 'car15_esp32'];
  const device_id = devices[randomInt(0, 2)];
  
  // Generate values based on severity
  let dValue, depth, width;
  if (severity === 'severe') {
    dValue = random(8, 12);
    depth = random(15, 25);
    width = random(30, 50);
  } else if (severity === 'moderate') {
    dValue = random(5, 8);
    depth = random(8, 15);
    width = random(20, 30);
  } else {
    dValue = random(2, 5);
    depth = random(3, 8);
    width = random(10, 20);
  }
  
  // Generate acceleration values
  const acceleration = {
    x: random(-2, 2),
    y: random(-2, 2),
    z: random(9, 11) // gravity + variation
  };
  
  // Generate timestamp within last 30 days
  const daysAgo = randomInt(0, 30);
  const hoursAgo = randomInt(0, 23);
  const minutesAgo = randomInt(0, 59);
  const timestamp = new Date();
  timestamp.setDate(timestamp.getDate() - daysAgo);
  timestamp.setHours(timestamp.getHours() - hoursAgo);
  timestamp.setMinutes(timestamp.getMinutes() - minutesAgo);
  
  return {
    timestamp,
    latitude: lat,
    longitude: lon,
    dValue: parseFloat(dValue.toFixed(2)),
    severity,
    acceleration: {
      x: parseFloat(acceleration.x.toFixed(2)),
      y: parseFloat(acceleration.y.toFixed(2)),
      z: parseFloat(acceleration.z.toFixed(2))
    },
    vibration_pattern: generateVibrationPattern().map(v => parseFloat(v.toFixed(2))),
    depth: parseFloat(depth.toFixed(2)),
    width: parseFloat(width.toFixed(2)),
    device_id,
    event_id: `event_${severity}_${index}_${Date.now()}_${randomInt(1000, 9999)}`,
    flagged: Math.random() > 0.8 // 20% flagged
  };
};

// Seed database
const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pothole_detection');
    console.log('Connected to MongoDB');
    
    // Clear existing data
    await Pothole.deleteMany({});
    console.log('Cleared existing pothole data');
    
    // Generate potholes
    const potholes = [];
    
    // 30 severe
    for (let i = 1; i <= 30; i++) {
      potholes.push(generatePothole('severe', i));
    }
    
    // 40 moderate
    for (let i = 1; i <= 40; i++) {
      potholes.push(generatePothole('moderate', i));
    }
    
    // 30 low
    for (let i = 1; i <= 30; i++) {
      potholes.push(generatePothole('low', i));
    }
    
    // Insert into database
    await Pothole.insertMany(potholes);
    console.log(`Successfully seeded ${potholes.length} pothole events`);
    console.log('  - 30 severe');
    console.log('  - 40 moderate');
    console.log('  - 30 low');
    
    // Close connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();

