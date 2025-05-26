// models/GetTogether.js
const mongoose = require('mongoose');

const getTogetherSchema = new mongoose.Schema({
  arch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arch',
    required: true
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['in-person', 'virtual'],
    required: true
  },
  scheduledFor: Date,
  location: String,
  virtualLink: String,
  invitees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending'
    },
    respondedAt: Date
  }],
  timeline: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['note', 'photo', 'video']
    },
    content: String,
    media: [{
      url: String,
      thumbnail: String
    }],
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['planning', 'active', 'completed'],
    default: 'planning'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GetTogether', getTogetherSchema);
