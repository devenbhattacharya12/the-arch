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
  preferences: {
    language: { type: String, default: 'en' },
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
    digestFrequency: { type: String, enum: ['daily', 'weekly', 'never'], default: 'weekly' }
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ pushToken: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Update lastActive timestamp on save
userSchema.pre('save', function(next) {
  if (this.isModified() && !this.isModified('lastActive')) {
    this.lastActive = new Date();
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate verification token
userSchema.methods.generateVerificationToken = function() {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  this.verificationToken = token;
  return token;
};

// Generate password reset token
userSchema.methods.generateResetToken = function() {
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  this.resetPasswordToken = token;
  this.resetPasswordExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Clear reset token
userSchema.methods.clearResetToken = function() {
  this.resetPasswordToken = null;
  this.resetPasswordExpires = null;
};

// Check if user is admin of any arch
userSchema.methods.isArchAdmin = async function(archId) {
  const Arch = require('./Arch');
  const arch = await Arch.findById(archId);
  if (!arch) return false;
  
  const member = arch.members.find(m => m.user.equals(this._id));
  return member && member.role === 'admin';
};

// Get user's response statistics
userSchema.methods.getResponseStats = async function(days = 30) {
  const DailyQuestion = require('./DailyQuestion');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await DailyQuestion.aggregate([
    { 
      $match: { 
        asker: this._id,
        date: { $gte: startDate }
      } 
    },
    {
      $group: {
        _id: null,
        totalQuestions: { $sum: 1 },
        questionsAnswered: {
          $sum: {
            $cond: [
              { 
                $gt: [
                  { 
                    $size: {
                      $filter: {
                        input: '$responses',
                        cond: { $eq: ['$$this.user', this._id] }
                      }
                    }
                  }, 
                  0
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
  
  const result = stats[0] || { totalQuestions: 0, questionsAnswered: 0 };
  result.responseRate = result.totalQuestions > 0 ? 
    Math.round((result.questionsAnswered / result.totalQuestions) * 100) : 0;
  
  return result;
};

// Get user's arch participation summary
userSchema.methods.getArchParticipation = async function() {
  const Arch = require('./Arch');
  const DailyQuestion = require('./DailyQuestion');
  
  const arches = await Arch.find({ 
    'members.user': this._id,
    isActive: true 
  }).populate('members.user', 'name');
  
  const participation = await Promise.all(
    arches.map(async (arch) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayQuestions = await DailyQuestion.countDocuments({
        arch: arch._id,
        asker: this._id,
        date: { $gte: today }
      });
      
      const todayAnswered = await DailyQuestion.countDocuments({
        arch: arch._id,
        asker: this._id,
        date: { $gte: today },
        'responses.user': this._id
      });
      
      const userMember = arch.members.find(m => m.user._id.equals(this._id));
      
      return {
        archId: arch._id,
        archName: arch.name,
        role: userMember ? userMember.role : 'member',
        memberCount: arch.members.length,
        todayQuestions,
        todayAnswered,
        completionRate: todayQuestions > 0 ? Math.round((todayAnswered / todayQuestions) * 100) : 0
      };
    })
  );
  
  return participation;
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.verificationToken;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpires;
  return user;
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method to find users with push tokens
userSchema.statics.findWithPushTokens = function() {
  return this.find({ 
    pushToken: { $exists: true, $ne: null },
    isActive: true 
  });
};

// Virtual for full name (if you want to add firstName/lastName later)
userSchema.virtual('displayName').get(function() {
  return this.name || 'Anonymous User';
});

// Virtual for account age
userSchema.virtual('accountAge').get(function() {
  const now = new Date();
  const created = this.createdAt;
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

module.exports = mongoose.model('User', userSchema);