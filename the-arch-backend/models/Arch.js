// models/Arch.js
const mongoose = require('mongoose');

const archSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    }
  }],
  inviteCode: {
    type: String,
    unique: true,
    required: true
  },
  settings: {
    questionTime: {
      type: String,
      default: '06:00' // 6 AM
    },
    responseDeadline: {
      type: String,
      default: '17:00' // 5 PM
    },
    timezone: {
      type: String,
      default: 'America/New_York'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Arch', archSchema);