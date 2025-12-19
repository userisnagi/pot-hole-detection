import mongoose from 'mongoose';
import Pothole from '../models/Pothole.js';
import dotenv from 'dotenv';

dotenv.config();

const checkDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pothole_detection');
    console.log('Connected to MongoDB');
    
    const count = await Pothole.countDocuments();
    console.log(`\nTotal pothole records in database: ${count}`);
    
    const severities = await Pothole.aggregate([
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);
    
    console.log('\nRecords by severity:');
    severities.forEach(s => console.log(`  ${s._id}: ${s.count}`));
    
    const devices = await Pothole.distinct('device_id');
    console.log(`\nUnique devices: ${devices.length}`);
    devices.forEach(device => console.log(`  - ${device}`));
    
    const sample = await Pothole.findOne().sort({ timestamp: -1 });
    if (sample) {
      console.log(`\nLatest record:`);
      console.log(`  Event ID: ${sample.event_id}`);
      console.log(`  Timestamp: ${sample.timestamp}`);
      console.log(`  Location: (${sample.latitude}, ${sample.longitude})`);
      console.log(`  Severity: ${sample.severity}`);
    }
    
    await mongoose.connection.close();
    console.log('\nConnection closed');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

checkDatabase();

