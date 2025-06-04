// routes/users.js - Enhanced User Management Routes
const express = require('express');
const User = require('../models/User');
const Arch = require('../models/Arch');
const DailyQuestion = require('../models/DailyQuestion');
const Post = require('../models/Post');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('arches', 'name description members inviteCode')
      .select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user statistics
    const stats = await user.getResponseStats();
    const archParticipation = await user.getArchParticipation();
    
    res.json({
      ...user.toJSON(),
      stats,
      archParticipation
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, timezone, avatar } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email.toLowerCase();
    }
    
    // Update other fields
    if (name) user.name = name.trim();
    if (timezone) user.timezone = timezone;
    if (avatar !== undefined) user.avatar = avatar;
    
    await user.save();
    
    // Return user without password
    const updatedUser = await User.findById(req.userId).select('-password');
    
    console.log(`👤 User ${req.userId} updated profile`);
    
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user preferences
router.put('/preferences', auth, async (req, res) => {
  try {
    const { language, theme, digestFrequency } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update preferences
    if (language) user.preferences.language = language;
    if (theme && ['light', 'dark', 'auto'].includes(theme)) {
      user.preferences.theme = theme;
    }
    if (digestFrequency && ['daily', 'weekly', 'never'].includes(digestFrequency)) {
      user.preferences.digestFrequency = digestFrequency;
    }
    
    await user.save();
    
    console.log(`⚙️ User ${req.userId} updated preferences`);
    
    res.json({
      message: 'Preferences updated successfully',
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update notification settings
router.put('/notification-settings', auth, async (req, res) => {
  try {
    const { dailyQuestions, responses, posts, getTogethers, messages } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update notification settings
    if (typeof dailyQuestions === 'boolean') user.notificationSettings.dailyQuestions = dailyQuestions;
    if (typeof responses === 'boolean') user.notificationSettings.responses = responses;
    if (typeof posts === 'boolean') user.notificationSettings.posts = posts;
    if (typeof getTogethers === 'boolean') user.notificationSettings.getTogethers = getTogethers;
    if (typeof messages === 'boolean') user.notificationSettings.messages = messages;
    
    await user.save();
    
    console.log(`🔔 User ${req.userId} updated notification settings`);
    
    res.json({
      message: 'Notification settings updated',
      notificationSettings: user.notificationSettings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ message: error.message });
  }
});

// Change password
router.put('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    
    // Update password (will be hashed by pre-save middleware)
    user.password = newPassword;
    await user.save();
    
    console.log(`🔐 User ${req.userId} changed password`);
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: error.message });
  }
});

// Search users by name or email (within arch context)
router.get('/search', auth, async (req, res) => {
  try {
    const { query, archId, limit = 10 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }
    
    let searchQuery = {
      isActive: true,
      $or: [
        { name: { $regex: query.trim(), $options: 'i' } },
        { email: { $regex: query.trim(), $options: 'i' } }
      ]
    };
    
    // If archId provided, only search within that arch
    if (archId) {
      // Verify user is member of this arch
      const arch = await Arch.findById(archId);
      if (!arch) {
        return res.status(404).json({ message: 'Arch not found' });
      }
      
      const isMember = arch.members.some(member => member.user.equals(req.userId));
      if (!isMember) {
        return res.status(403).json({ message: 'You are not a member of this arch' });
      }
      
      const memberIds = arch.members.map(member => member.user);
      searchQuery._id = { $in: memberIds };
    }
    
    const users = await User.find(searchQuery)
      .select('name email avatar lastActive')
      .limit(parseInt(limit))
      .sort({ name: 1 });
    
    res.json(users);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user activity dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { archId } = req.query;
    
    // Get basic user info
    const user = await User.findById(userId).populate('arches', 'name');
    
    // Get today's questions
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let questionQuery = {
      asker: userId,
      date: { $gte: today, $lt: tomorrow }
    };
    
    if (archId) {
      questionQuery.arch = archId;
    }
    
    const todaysQuestions = await DailyQuestion.find(questionQuery)
      .populate('aboutUser', 'name avatar')
      .populate('arch', 'name');
    
    // Separate answered and unanswered
    const answeredQuestions = todaysQuestions.filter(q => 
      q.responses.some(r => r.user.equals(userId))
    );
    
    const unansweredQuestions = todaysQuestions.filter(q => 
      !q.responses.some(r => r.user.equals(userId)) && q.deadline > new Date()
    );
    
    // Get recent responses about this user (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    let aboutMeQuery = {
      aboutUser: userId,
      processed: true,
      date: { $gte: weekAgo },
      'responses.0': { $exists: true }
    };
    
    if (archId) {
      aboutMeQuery.arch = archId;
    }
    
    const responsesAboutUser = await DailyQuestion.find(aboutMeQuery)
      .populate('asker', 'name avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get 30-day stats
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    
    let statsQuery = {
      asker: userId,
      date: { $gte: monthAgo }
    };
    
    if (archId) {
      statsQuery.arch = archId;
    }
    
    const monthlyStats = await DailyQuestion.aggregate([
      { $match: statsQuery },
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
                          cond: { $eq: ['$this.user', userId] }
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
    
    const stats = monthlyStats[0] || { totalQuestions: 0, questionsAnswered: 0 };
    stats.responseRate = stats.totalQuestions > 0 ? 
      Math.round((stats.questionsAnswered / stats.totalQuestions) * 100) : 0;
    
    // Get upcoming deadlines
    const upcomingDeadlines = await DailyQuestion.find({
      asker: userId,
      deadline: { $gt: new Date() },
      processed: false
    }).populate('aboutUser', 'name')
      .populate('arch', 'name')
      .sort({ deadline: 1 })
      .limit(5);
    
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        arches: user.arches
      },
      today: {
        answered: answeredQuestions.length,
        unanswered: unansweredQuestions.length,
        total: todaysQuestions.length,
        questions: {
          answered: answeredQuestions,
          unanswered: unansweredQuestions
        }
      },
      recentResponsesAboutMe: responsesAboutUser,
      stats: {
        thirtyDayResponseRate: stats.responseRate,
        totalQuestionsAsked: stats.totalQuestions,
        totalQuestionsAnswered: stats.questionsAnswered
      },
      upcomingDeadlines: upcomingDeadlines.map(q => ({
        questionId: q._id,
        question: q.question,
        aboutUser: q.aboutUser,
        arch: q.arch,
        deadline: q.deadline,
        minutesLeft: Math.max(0, Math.floor((q.deadline - new Date()) / (1000 * 60)))
      }))
    });
  } catch (error) {
    console.error('Error fetching user dashboard:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's arch memberships with details
router.get('/arches', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'arches',
      populate: {
        path: 'members.user creator',
        select: 'name email avatar'
      }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add user's role in each arch
    const archesWithRole = user.arches.map(arch => {
      const userMember = arch.members.find(member => member.user._id.equals(req.userId));
      return {
        ...arch.toObject(),
        userRole: userMember ? userMember.role : 'member',
        joinedAt: userMember ? userMember.joinedAt : null
      };
    });
    
    res.json(archesWithRole);
  } catch (error) {
    console.error('Error fetching user arches:', error);
    res.status(500).json({ message: error.message });
  }
});

// Leave an arch
router.post('/leave-arch/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Check if user is a member
    const memberIndex = arch.members.findIndex(member => member.user.equals(req.userId));
    if (memberIndex === -1) {
      return res.status(400).json({ message: 'You are not a member of this arch' });
    }
    
    // Don't allow creator to leave if there are other members
    const userMember = arch.members[memberIndex];
    if (userMember.role === 'admin' && arch.creator.equals(req.userId) && arch.members.length > 1) {
      return res.status(400).json({ 
        message: 'You must transfer ownership or remove all other members before leaving' 
      });
    }
    
    // Remove user from arch
    arch.members.splice(memberIndex, 1);
    await arch.save();
    
    // Remove arch from user's arches
    await User.findByIdAndUpdate(req.userId, {
      $pull: { arches: archId }
    });
    
    console.log(`👋 User ${req.userId} left arch ${archId}`);
    
    res.json({ message: 'Successfully left the arch' });
  } catch (error) {
    console.error('Error leaving arch:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's activity summary
router.get('/activity', auth, async (req, res) => {
  try {
    const { days = 7, archId } = req.query;
    const userId = req.userId;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    let baseQuery = { date: { $gte: startDate } };
    if (archId) {
      baseQuery.arch = archId;
    }
    
    // Questions asked by user
    const questionsAsked = await DailyQuestion.countDocuments({
      ...baseQuery,
      asker: userId
    });
    
    // Questions answered by user
    const questionsAnswered = await DailyQuestion.countDocuments({
      ...baseQuery,
      'responses.user': userId
    });
    
    // Questions about user
    const questionsAboutUser = await DailyQuestion.countDocuments({
      ...baseQuery,
      aboutUser: userId
    });
    
    // Total responses received about user
    const responsesAboutUser = await DailyQuestion.aggregate([
      { $match: { ...baseQuery, aboutUser: userId } },
      { $unwind: '$responses' },
      { $match: { 'responses.passed': { $ne: true } } },
      { $count: 'total' }
    ]);
    
    // Posts created
    const postsCreated = await Post.countDocuments({
      author: userId,
      createdAt: { $gte: startDate }
    });
    
    // Messages sent
    const messagesSent = await Message.countDocuments({
      sender: userId,
      createdAt: { $gte: startDate },
      isActive: true
    });
    
    res.json({
      period: `${days} days`,
      questionsAsked,
      questionsAnswered,
      questionsAboutUser,
      responsesReceived: responsesAboutUser[0]?.total || 0,
      postsCreated,
      messagesSent,
      responseRate: questionsAsked > 0 ? 
        Math.round((questionsAnswered / questionsAsked) * 100) : 0
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get detailed user statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const { archId, days = 30 } = req.query;
    const userId = req.userId;
    
    const stats = await User.findById(userId).then(user => 
      user.getResponseStats(parseInt(days))
    );
    
    const archParticipation = await User.findById(userId).then(user =>
      user.getArchParticipation()
    );
    
    // Get streak information
    const streakInfo = await calculateUserStreak(userId, archId);
    
    res.json({
      responseStats: stats,
      archParticipation,
      streakInfo,
      period: `${days} days`
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete user account (soft delete)
router.delete('/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Password is required to delete account' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Incorrect password' });
    }
    
    // Soft delete - deactivate account
    user.isActive = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    user.pushToken = null;
    await user.save();
    
    console.log(`🗑️ User account ${req.userId} deactivated`);
    
    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to calculate user streak
async function calculateUserStreak(userId, archId = null) {
  try {
    let query = { asker: userId };
    if (archId) query.arch = archId;
    
    // Get last 30 days of questions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    query.date = { $gte: thirtyDaysAgo };
    
    const questions = await DailyQuestion.find(query)
      .sort({ date: -1 });
    
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    // Group by date and check consecutive days
    const questionsByDate = {};
    questions.forEach(q => {
      const dateKey = q.date.toISOString().split('T')[0];
      if (!questionsByDate[dateKey]) {
        questionsByDate[dateKey] = [];
      }
      questionsByDate[dateKey].push(q);
    });
    
    // Calculate streaks
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateKey = checkDate.toISOString().split('T')[0];
      
      const dayQuestions = questionsByDate[dateKey] || [];
      const answeredToday = dayQuestions.some(q => 
        q.responses.some(r => r.user.equals(userId))
      );
      
      if (answeredToday) {
        tempStreak++;
        if (i === 0) currentStreak = tempStreak; // Today's part of streak
      } else {
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
        tempStreak = 0;
        if (i === 0) currentStreak = 0; // Broke streak today
      }
    }
    
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
    
    return {
      currentStreak,
      longestStreak,
      lastActiveDate: questions.length > 0 ? questions[0].date : null
    };
  } catch (error) {
    console.error('Error calculating user streak:', error);
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null
    };
  }
}

module.exports = router;