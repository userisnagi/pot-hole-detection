import mongoose from 'mongoose';

const potholeSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  dValue: {
    type: Number,
    required: true
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'moderate', 'severe'],
    index: true
  },
  acceleration: {
    x: {
      type: Number,
      required: true
    },
    y: {
      type: Number,
      required: true
    },
    z: {
      type: Number,
      required: true
    }
  },
  vibration_pattern: {
    type: [Number],
    default: []
  },
  depth: {
    type: Number,
    required: true
  },
  width: {
    type: Number,
    required: true
  },
  device_id: {
    type: String,
    required: true,
    index: true
  },
  event_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  flagged: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for geospatial queries (if needed in future)
potholeSchema.index({ latitude: 1, longitude: 1 });

const Pothole = mongoose.model('Pothole', potholeSchema);

export default Pothole;

