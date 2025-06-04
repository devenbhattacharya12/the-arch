const express = require('express');
const User = require('../models/User');
const Arch = require('../models/Arch');
const DailyQuestion = require('../models/DailyQuestion');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('arches', 'name description members')
      .select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
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
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }
    
    // Update other fields
    if (name) user.name = name;
    if (timezone) user.timezone = timezone;
    if (avatar) user.avatar = avatar;
    
    await user.save();
    
    // Return user without password
    const updatedUser = await User.findById(req.userId).select('-password');
    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
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
    
    res.json({
      message: 'Notification settings updated',
      notificationSettings: user.notificationSettings
    });
  } catch (error) {
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
    
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
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
                          cond: { $eq: ['$$this.user', userId] }
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
        userRole: userMember ? userMember.role : 'member'
      };
    });
    
    res.json(archesWithRole);
  } catch (error) {
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
    
    res.json({ message: 'Successfully left the arch' });
  } catch (error) {
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
    
    res.json({
      period: `${days} days`,
      questionsAsked,
      questionsAnswered,
      questionsAboutUser,
      responsesReceived: responsesAboutUser[0]?.total || 0,
      responseRate: questionsAsked > 0 ? 
        Math.round((questionsAnswered / questionsAsked) * 100) : 0
    });
  } catch (error) {
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
    await user.save();
    
    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;