const express = require('express');
const DailyQuestion = require('../models/DailyQuestion');
const Arch = require('../models/Arch');
const auth = require('../middleware/auth');

const router = express.Router();

// Submit a response to a daily question
router.post('/:questionId', auth, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { response, passed = false, sharedWithArch = false } = req.body;
    
    if (!response && !passed) {
      return res.status(400).json({ message: 'Response text is required unless passing' });
    }
    
    const question = await DailyQuestion.findById(questionId)
      .populate('arch');
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if deadline has passed
    if (new Date() > question.deadline) {
      return res.status(400).json({ message: 'Response deadline has passed' });
    }
    
    // Verify user is member of the arch
    const arch = await Arch.findById(question.arch._id);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this arch' });
    }
    
    // Check if user already responded
    const existingResponse = question.responses.find(r => r.user.equals(req.userId));
    if (existingResponse) {
      return res.status(400).json({ message: 'You have already responded to this question' });
    }
    
    // Add the response
    const newResponse = {
      user: req.userId,
      response: passed ? null : response,
      passed,
      sharedWithArch,
      submittedAt: new Date()
    };
    
    question.responses.push(newResponse);
    await question.save();
    
    // Populate the response for return
    await question.populate('responses.user', 'name avatar');
    
    // Emit real-time update to arch members
    const io = req.app.get('io');
    if (io) {
      io.to(question.arch._id.toString()).emit('question-response', {
        questionId: question._id,
        response: newResponse,
        totalResponses: question.responses.length
      });
    }
    
    res.status(201).json({
      message: 'Response submitted successfully',
      response: newResponse,
      question: question
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a response (before deadline)
router.put('/:questionId/response', auth, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { response, passed = false, sharedWithArch = false } = req.body;
    
    const question = await DailyQuestion.findById(questionId);
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if deadline has passed
    if (new Date() > question.deadline) {
      return res.status(400).json({ message: 'Response deadline has passed' });
    }
    
    // Find user's response
    const userResponse = question.responses.find(r => r.user.equals(req.userId));
    if (!userResponse) {
      return res.status(404).json({ message: 'No response found to update' });
    }
    
    // Update the response
    userResponse.response = passed ? null : response;
    userResponse.passed = passed;
    userResponse.sharedWithArch = sharedWithArch;
    userResponse.submittedAt = new Date();
    
    await question.save();
    await question.populate('responses.user', 'name avatar');
    
    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(question.arch.toString()).emit('question-response-updated', {
        questionId: question._id,
        response: userResponse
      });
    }
    
    res.json({
      message: 'Response updated successfully',
      response: userResponse,
      question: question
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a response (before deadline)
router.delete('/:questionId/response', auth, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const question = await DailyQuestion.findById(questionId);
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Check if deadline has passed
    if (new Date() > question.deadline) {
      return res.status(400).json({ message: 'Response deadline has passed' });
    }
    
    // Find and remove user's response
    const responseIndex = question.responses.findIndex(r => r.user.equals(req.userId));
    if (responseIndex === -1) {
      return res.status(404).json({ message: 'No response found to delete' });
    }
    
    question.responses.splice(responseIndex, 1);
    await question.save();
    
    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(question.arch.toString()).emit('question-response-deleted', {
        questionId: question._id,
        userId: req.userId,
        totalResponses: question.responses.length
      });
    }
    
    res.json({ message: 'Response deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get responses for a specific question (for admins or after processing)
router.get('/question/:questionId', auth, async (req, res) => {
  try {
    const { questionId } = req.params;
    
    const question = await DailyQuestion.findById(questionId)
      .populate('responses.user', 'name avatar')
      .populate('arch', 'name');
    
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }
    
    // Verify user has access to this question
    const arch = await Arch.findById(question.arch._id);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Only show responses if question is processed or user is the subject
    if (!question.processed && !question.aboutUser.equals(req.userId)) {
      return res.status(403).json({ message: 'Responses not yet available' });
    }
    
    res.json({
      question: question.question,
      aboutUser: question.aboutUser,
      responses: question.responses.filter(r => !r.passed && r.response),
      totalResponses: question.responses.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user's response history
router.get('/user/history', auth, async (req, res) => {
  try {
    const { archId, limit = 20, skip = 0 } = req.query;
    
    let matchQuery = {
      'responses.user': req.userId
    };
    
    if (archId) {
      matchQuery.arch = archId;
    }
    
    const userResponses = await DailyQuestion.aggregate([
      { $match: matchQuery },
      { $unwind: '$responses' },
      { $match: { 'responses.user': req.userId } },
      {
        $lookup: {
          from: 'users',
          localField: 'aboutUser',
          foreignField: '_id',
          as: 'aboutUser'
        }
      },
      {
        $lookup: {
          from: 'arches',
          localField: 'arch',
          foreignField: '_id',
          as: 'arch'
        }
      },
      {
        $project: {
          question: 1,
          aboutUser: { $arrayElemAt: ['$aboutUser', 0] },
          arch: { $arrayElemAt: ['$arch', 0] },
          response: '$responses.response',
          passed: '$responses.passed',
          sharedWithArch: '$responses.sharedWithArch',
          submittedAt: '$responses.submittedAt',
          date: 1
        }
      },
      { $sort: { submittedAt: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) }
    ]);
    
    res.json(userResponses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Share a response with the arch (make it visible in feed)
router.post('/:responseId/share', auth, async (req, res) => {
  try {
    const { responseId } = req.params;
    
    console.log('🔍 Share request received:', {
      responseId,
      userId: req.userId
    });
    
    // Find the question containing this response
    const question = await DailyQuestion.findOne({
      'responses._id': responseId
    }).populate('aboutUser', 'name email')
      .populate('responses.user', 'name');
    
    console.log('📋 Question found:', {
      questionId: question?._id,
      aboutUser: question?.aboutUser?.name,
      aboutUserId: question?.aboutUser?._id,
      responsesCount: question?.responses?.length
    });
    
    if (!question) {
      console.log('❌ Question not found');
      return res.status(404).json({ message: 'Response not found' });
    }
    
    const response = question.responses.id(responseId);
    console.log('💬 Response found:', {
      responseExists: !!response,
      responseUser: response?.user?.name,
      responseUserId: response?.user?._id,
      responseText: response?.response
    });
    
    if (!response) {
      console.log('❌ Response not found in question');
      return res.status(404).json({ message: 'Response not found' });
    }
    
    console.log('🔐 Authorization check:', {
      aboutUserId: question.aboutUser._id.toString(),
      currentUserId: req.userId.toString(),
      isAuthorized: question.aboutUser._id.equals(req.userId)
    });
    
    // Check if user is the person the question is ABOUT
    if (!question.aboutUser._id.equals(req.userId)) {
      console.log('❌ Authorization failed');
      return res.status(403).json({ message: 'Only the person this response is about can share it to the family feed' });
    }
    
    // Check if already shared
    if (response.sharedWithArch) {
      console.log('⚠️ Already shared');
      return res.status(400).json({ message: 'Response already shared to family feed' });
    }
    
    console.log('✅ Updating share status...');
    
    // Update the share status
    response.sharedWithArch = true;
    await question.save();
    
    console.log('✅ Share status updated successfully');
    
    res.json({ 
      message: 'Response shared to family feed successfully',
      response: response
    });
  } catch (error) {
    console.error('❌ Share error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get response statistics for a user
router.get('/user/stats', auth, async (req, res) => {
  try {
    const { archId, days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    let matchQuery = {
      asker: req.userId,
      date: { $gte: startDate }
    };
    
    if (archId) {
      matchQuery.arch = archId;
    }
    
    const stats = await DailyQuestion.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalQuestions: { $sum: 1 },
          questionsAnswered: {
            $sum: {
              $cond: [
                { $gt: [{ $size: '$responses' }, 0] },
                1,
                0
              ]
            }
          },
          totalResponses: { $sum: { $size: '$responses' } }
        }
      }
    ]);
    
    const result = stats[0] || {
      totalQuestions: 0,
      questionsAnswered: 0,
      totalResponses: 0
    };
    
    result.responseRate = result.totalQuestions > 0 ? 
      Math.round((result.questionsAnswered / result.totalQuestions) * 100) : 0;
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;