import express from 'express';
import Pothole from '../models/Pothole.js';

const router = express.Router();

// POST /api/potholes - Create a new pothole event (no authentication required)
router.post('/', async (req, res) => {
  try {
    const pothole = new Pothole(req.body);
    const savedPothole = await pothole.save();
    res.status(201).json(savedPothole);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Event ID already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// GET /api/potholes - Get all pothole events
router.get('/', async (req, res) => {
  try {
    const potholes = await Pothole.find().sort({ timestamp: -1 });
    res.json(potholes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/potholes/stats - Get statistics about potholes
router.get('/stats', async (req, res) => {
  try {
    const total = await Pothole.countDocuments();
    
    const severityCounts = await Pothole.aggregate([
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      total,
      bySeverity: {
        low: 0,
        moderate: 0,
        severe: 0
      }
    };

    severityCounts.forEach(item => {
      stats.bySeverity[item._id] = item.count;
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

