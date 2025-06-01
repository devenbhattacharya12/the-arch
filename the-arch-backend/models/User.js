// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  pushToken: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: null
  },
  arches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arch'
  }],
  timezone: {
    type: String,
    default: 'America/New_York'
  },
  notificationSettings: {
    dailyQuestions: { type: Boolean, default: true },
    responses: { type: Boolean, default: true },
    posts: { type: Boolean, default: true },
    getTogethers: { type: Boolean, default: true },
    messages: { type: Boolean, default: true }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
