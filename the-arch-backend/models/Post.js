// models/Post.js
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  arch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arch',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },

  // ADD THIS: Post type to distinguish question responses from regular posts
  type: {
    type: String,
    enum: ['post', 'question-response'],
    default: 'post'
  },
  // ADD THIS: Metadata for question responses
  metadata: {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DailyQuestion'
    },
    responseId: String,
    originalQuestion: String,
    responseAuthor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    aboutUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  media: [{
    type: {
      type: String,
      enum: ['image', 'video']
    },
    url: String,
    thumbnail: String
  }],
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Post', postSchema);
