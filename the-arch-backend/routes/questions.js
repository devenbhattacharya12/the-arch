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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const questions = await DailyQuestion.find({
      asker: req.userId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('aboutUser', 'name avatar')
      .populate('arch', 'name');
    
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get questions for a specific arch
router.get('/arch/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { date } = req.query;
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this arch' });
    }
    
    let query = { arch: archId };
    
    if (date) {
      const queryDate = new Date(date);
      queryDate.setHours(0, 0, 0, 0);
      const nextDay = new Date(queryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      query.date = {
        $gte: queryDate,
        $lt: nextDay
      };
    }
    
    const questions = await DailyQuestion.find(query)
      .populate('asker', 'name avatar')
      .populate('aboutUser', 'name avatar')
      .populate('responses.user', 'name avatar')
      .sort({ createdAt: -1 });
    
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get processed questions where user is the subject (responses about them)
router.get('/about-me', auth, async (req, res) => {
  try {
    const { archId, limit = 10, skip = 0 } = req.query;
    
    let query = {
      aboutUser: req.userId,
      processed: true,
      'responses.0': { $exists: true } // Only questions with responses
    };
    
    if (archId) {
      query.arch = archId;
    }
    
    const questions = await DailyQuestion.find(query)
      .populate('asker', 'name avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get question by ID (for detailed view)
router.get('/:questionId', auth, async (req, res) => {
  try {
    const question = await DailyQuestion.findById(req.params.questionId)
      .populate('asker', 'name avatar')
      .populate('aboutUser', 'name avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name avatar');
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Verify user has access to this question
    const arch = await Arch.findById(question.arch._id);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(question);
  } catch (error) {
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
    
    // Check if deadline has passed
    if (new Date() > question.deadline) {
      return res.status(400).json({ message: 'Response deadline has passed' });
    }
    
    // Verify user is member of the arch
    const arch = await Arch.findById(question.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this arch' });
    }
    
    // Check if user already responded
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
    
    // Populate the response data for return
    await question.populate('responses.user', 'name avatar');
    
    // Emit real-time update to arch members
    const io = req.app.get('io');
    if (io) {
      io.to(question.arch.toString()).emit('question-response', {
        questionId: question._id,
        totalResponses: question.responses.length
      });
    }
    
    res.json({
      message: 'Response submitted successfully',
      question
    });
  } catch (error) {
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
    
    // Check if deadline has passed
    if (new Date() > question.deadline) {
      return res.status(400).json({ message: 'Response deadline has passed' });
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
    
    res.json({ message: 'Question passed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get response statistics for an arch
router.get('/stats/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this arch' });
    }
    
    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }
    
    // Get response statistics
    const stats = await DailyQuestion.aggregate([
      {
        $match: {
          arch: arch._id,
          ...dateQuery
        }
      },
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          totalResponses: { $sum: { $size: '$responses' } },
          averageResponsesPerQuestion: { $avg: { $size: '$responses' } },
          questionsWithResponses: {
            $sum: {
              $cond: [{ $gt: [{ $size: '$responses' }, 0] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    // Get individual member response rates
    const memberStats = await DailyQuestion.aggregate([
      {
        $match: {
          arch: arch._id,
          ...dateQuery
        }
      },
      { $unwind: '$responses' },
      {
        $group: {
          _id: '$responses.user',
          totalResponses: { $sum: 1 },
          passedCount: {
            $sum: { $cond: ['$responses.passed', 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $project: {
          user: { $arrayElemAt: ['$user', 0] },
          totalResponses: 1,
          passedCount: 1,
          actualResponses: { $subtract: ['$totalResponses', '$passedCount'] }
        }
      }
    ]);
    
    res.json({
      overall: stats[0] || {
        totalQuestions: 0,
        totalResponses: 0,
        averageResponsesPerQuestion: 0,
        questionsWithResponses: 0
      },
      memberStats
    });
  } catch (error) {
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
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;