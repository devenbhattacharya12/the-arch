// models/DailyQuestion.js
const mongoose = require('mongoose');

const dailyQuestionSchema = new mongoose.Schema({
  arch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arch',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  asker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  aboutUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  question: {
    type: String,
    required: true
  },
  responses: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    response: String,
    submittedAt: {
      type: Date,
      default: Date.now
    },
    passed: {
      type: Boolean,
      default: false
    },
    sharedWithArch: {
      type: Boolean,
      default: false
    }
  }],
  deadline: {
    type: Date,
    required: true
  },
  processed: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DailyQuestion', dailyQuestionSchema);
