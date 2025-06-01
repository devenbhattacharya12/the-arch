// routes/questions.js - Daily Questions API Routes
const express = require('express');
const DailyQuestion = require('../models/DailyQuestion');
const Arch = require('../models/Arch');
const User = require('../models/User');
const auth = require('../middleware/auth');
const moment = require('moment-timezone');

const router = express.Router();

// Get today's questions for the authenticated user
router.get('/today', auth, async (req, res) => {
  try {
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().add(1, 'day').startOf('day').toDate();
    
    // Find all questions for today where the user is the asker
    const questions = await DailyQuestion.find({
      asker: req.userId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('aboutUser', 'name email avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name email avatar');
    
    console.log(`📝 Found ${questions.length} questions for user ${req.userId} today`);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching today\'s questions:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get questions about the authenticated user (from other family members)
router.get('/about-me', auth, async (req, res) => {
  try {
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().add(1, 'day').startOf('day').toDate();
    
    // Find questions where this user is being asked about
    const questions = await DailyQuestion.find({
      aboutUser: req.userId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('asker', 'name email avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name email avatar');
    
    console.log(`👤 Found ${questions.length} questions about user ${req.userId} today`);
    res.json(questions);
  } catch (error) {
    console.error('Error fetching questions about user:', error);
    res.status(500).json({ message: error.message });
  }
});

// Submit a response to a daily question
router.post('/:questionId/respond', auth, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { response, sharedWithArch = false } = req.body;
    
    if (!response || response.trim().length === 0) {
      return res.status(400).json({ message: 'Response cannot be empty' });
    }
    
    const question = await DailyQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if user is authorized to respond (must be in the same arch)
    const arch = await Arch.findById(question.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'You are not authorized to respond to this question' });
    }
    
    // Check if user has already responded
    const existingResponse = question.responses.find(r => r.user.equals(req.userId));
    if (existingResponse) {
      // Update existing response
      existingResponse.response = response.trim();
      existingResponse.sharedWithArch = sharedWithArch;
      existingResponse.submittedAt = new Date();
    } else {
      // Add new response
      question.responses.push({
        user: req.userId,
        response: response.trim(),
        sharedWithArch,
        submittedAt: new Date()
      });
    }
    
    await question.save();
    
    console.log(`💬 User ${req.userId} responded to question ${questionId}`);
    
    // Populate the response data for return
    await question.populate('responses.user', 'name email avatar');
    
    res.json({
      message: 'Response submitted successfully',
      question
    });
  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ message: error.message });
  }
});

// Mark response as "passed" (skip this question)
router.post('/:questionId/pass', auth, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const question = await DailyQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if user is the asker
    if (!question.asker.equals(req.userId)) {
      return res.status(403).json({ message: 'You can only pass on your own questions' });
    }
    
    // Check if user has already responded or passed
    const existingResponse = question.responses.find(r => r.user.equals(req.userId));
    if (existingResponse) {
      existingResponse.passed = true;
      existingResponse.submittedAt = new Date();
    } else {
      question.responses.push({
        user: req.userId,
        response: '',
        passed: true,
        submittedAt: new Date()
      });
    }
    
    await question.save();
    
    console.log(`⏭️ User ${req.userId} passed on question ${questionId}`);
    res.json({ message: 'Question passed successfully' });
  } catch (error) {
    console.error('Error passing question:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all questions for a specific arch (for admin/debugging)
router.get('/arch/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const questions = await DailyQuestion.find({ arch: archId })
      .populate('asker', 'name email avatar')
      .populate('aboutUser', 'name email avatar')
      .populate('responses.user', 'name email avatar')
      .sort({ date: -1 });
    
    res.json(questions);
  } catch (error) {
    console.error('Error fetching arch questions:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get questions statistics for an arch
router.get('/arch/:archId/stats', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const today = moment().startOf('day').toDate();
    
    // Get today's questions count
    const todayQuestions = await DailyQuestion.countDocuments({
      arch: archId,
      date: { $gte: today }
    });
    
    // Get today's responses count
    const todayResponses = await DailyQuestion.aggregate([
      { $match: { arch: arch._id, date: { $gte: today } } },
      { $unwind: '$responses' },
      { $match: { 'responses.passed': { $ne: true } } },
      { $count: 'total' }
    ]);
    
    // Get completion rate for this week
    const weekStart = moment().startOf('week').toDate();
    const weekQuestions = await DailyQuestion.find({
      arch: archId,
      date: { $gte: weekStart }
    });
    
    let totalExpectedResponses = 0;
    let actualResponses = 0;
    
    weekQuestions.forEach(q => {
      totalExpectedResponses += arch.members.length;
      actualResponses += q.responses.filter(r => !r.passed).length;
    });
    
    const completionRate = totalExpectedResponses > 0 ? 
      Math.round((actualResponses / totalExpectedResponses) * 100) : 0;
    
    res.json({
      todayQuestions,
      todayResponses: todayResponses[0]?.total || 0,
      weeklyCompletionRate: completionRate,
      archMemberCount: arch.members.length
    });
  } catch (error) {
    console.error('Error fetching arch stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// TEMPORARY: Manual trigger for testing (remove in production)
router.post('/trigger-daily', auth, async (req, res) => {
  try {
    const { sendDailyQuestions } = require('../services/dailyQuestionService');
    await sendDailyQuestions();
    res.json({ message: 'Daily questions created successfully' });
  } catch (error) {
    console.error('Error triggering daily questions:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;