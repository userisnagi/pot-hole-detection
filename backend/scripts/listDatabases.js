import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const listDatabases = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pothole_detection');
    console.log('Connected to MongoDB\n');
    
    // List all databases
    const admin = mongoose.connection.db.admin();
    const dbList = await admin.listDatabases();
    
    console.log('Available databases:');
    dbList.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Get current database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`\nCurrent database: ${dbName}`);
    
    // List collections in current database
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\nCollections in '${dbName}':`);
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });
    
    // Check potholes collection specifically
    if (collections.some(col => col.name === 'potholes')) {
      const Pothole = mongoose.model('Pothole', new mongoose.Schema({}, { strict: false }), 'potholes');
      const count = await Pothole.countDocuments();
      console.log(`\n✓ Found 'potholes' collection with ${count} documents`);
      
      // Show sample document
      const sample = await Pothole.findOne();
      if (sample) {
        console.log('\nSample document:');
        console.log(JSON.stringify(sample, null, 2));
      }
    } else {
      console.log('\n✗ No "potholes" collection found');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

listDatabases();

