// routes/dashboard.js - Centralized Dashboard Data API
const express = require('express');
const DailyQuestion = require('../models/DailyQuestion');
const Arch = require('../models/Arch');
const User = require('../models/User');
const Post = require('../models/Post');
const auth = require('../middleware/auth');
const moment = require('moment-timezone');

const router = express.Router();

// Get complete dashboard data for authenticated user
router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().add(1, 'day').startOf('day').toDate();
    
    // Get user's arches
    const user = await User.findById(userId).populate('arches');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get today's pending questions for this user
    const todaysQuestions = await DailyQuestion.find({
      asker: userId,
      date: {
        $gte: today,
        $lt: tomorrow
      }
    }).populate('aboutUser', 'name avatar')
      .populate('arch', 'name');

    // Separate answered and unanswered questions
    const answeredQuestions = todaysQuestions.filter(q => 
      q.responses.some(r => r.user.equals(userId))
    );
    
    const unansweredQuestions = todaysQuestions.filter(q => 
      !q.responses.some(r => r.user.equals(userId)) && q.deadline > new Date()
    );

    // Get recent responses about this user (last 7 days)
    const weekAgo = moment().subtract(7, 'days').startOf('day').toDate();
    const responsesAboutUser = await DailyQuestion.find({
      aboutUser: userId,
      processed: true,
      date: { $gte: weekAgo },
      'responses.0': { $exists: true }
    }).populate('asker', 'name avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get response statistics for last 30 days
    const monthAgo = moment().subtract(30, 'days').startOf('day').toDate();
    const responseStats = await DailyQuestion.aggregate([
      {
        $match: {
          asker: userId,
          date: { $gte: monthAgo }
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

    const stats = responseStats[0] || { totalQuestions: 0, questionsAnswered: 0 };
    stats.responseRate = stats.totalQuestions > 0 ? 
      Math.round((stats.questionsAnswered / stats.totalQuestions) * 100) : 0;

    // Get arch activity summary
    const archActivity = await Promise.all(
      user.arches.map(async (arch) => {
        const archQuestions = await DailyQuestion.find({
          arch: arch._id,
          date: {
            $gte: today,
            $lt: tomorrow
          }
        }).populate('responses.user', 'name');

        const totalMembers = arch.members.length;
        const totalQuestions = archQuestions.length;
        const totalResponses = archQuestions.reduce((sum, q) => sum + q.responses.length, 0);
        const completionRate = totalQuestions > 0 ? 
          Math.round((archQuestions.filter(q => q.responses.length > 0).length / totalQuestions) * 100) : 0;

        return {
          archId: arch._id,
          archName: arch.name,
          totalMembers,
          totalQuestions,
          totalResponses,
          completionRate,
          averageResponsesPerQuestion: totalQuestions > 0 ? 
            Math.round((totalResponses / totalQuestions) * 10) / 10 : 0
        };
      })
    );

    // Get upcoming deadlines
    const upcomingDeadlines = await DailyQuestion.find({
      asker: userId,
      deadline: { $gt: new Date() },
      processed: false
    }).populate('aboutUser', 'name')
      .populate('arch', 'name')
      .sort({ deadline: 1 })
      .limit(5);

    // Get recent family activity (posts from user's arches)
    const archIds = user.arches.map(arch => arch._id);
    const recentPosts = await Post.find({
      arch: { $in: archIds },
      isActive: true
    }).populate('author', 'name avatar')
      .populate('arch', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const response = {
      user: {
        id: user._id,
        name: user.name,
        avatar: user.avatar
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
      archActivity,
      upcomingDeadlines: upcomingDeadlines.map(q => ({
        questionId: q._id,
        question: q.question,
        aboutUser: q.aboutUser,
        arch: q.arch,
        deadline: q.deadline,
        minutesLeft: Math.max(0, Math.floor((q.deadline - new Date()) / (1000 * 60)))
      })),
      recentActivity: recentPosts.map(post => ({
        type: 'post',
        id: post._id,
        content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
        author: post.author,
        arch: post.arch,
        createdAt: post.createdAt,
        likesCount: post.likes.length,
        commentsCount: post.comments.length
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get weekly summary for user
router.get('/weekly-summary', auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { archId } = req.query;
    
    const weekStart = moment().startOf('week').toDate();
    const weekEnd = moment().endOf('week').toDate();
    
    let query = {
      asker: userId,
      date: {
        $gte: weekStart,
        $lte: weekEnd
      }
    };
    
    if (archId) {
      query.arch = archId;
    }

    const weeklyQuestions = await DailyQuestion.find(query)
      .populate('aboutUser', 'name avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name avatar')
      .sort({ date: 1 });

    // Group by day
    const dailyBreakdown = {};
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    weeklyQuestions.forEach(question => {
      const dayName = daysOfWeek[moment(question.date).day()];
      if (!dailyBreakdown[dayName]) {
        dailyBreakdown[dayName] = {
          questions: [],
          answered: 0,
          totalResponses: 0
        };
      }
      
      dailyBreakdown[dayName].questions.push(question);
      if (question.responses.some(r => r.user.equals(userId))) {
        dailyBreakdown[dayName].answered++;
      }
      dailyBreakdown[dayName].totalResponses += question.responses.length;
    });

    // Get responses about user this week
    const responsesAboutUser = await DailyQuestion.find({
      aboutUser: userId,
      date: {
        $gte: weekStart,
        $lte: weekEnd
      },
      processed: true,
      'responses.0': { $exists: true }
    }).populate('asker', 'name avatar')
      .populate('arch', 'name')
      .populate('responses.user', 'name avatar')
      .sort({ date: 1 });

    res.json({
      weekStart,
      weekEnd,
      dailyBreakdown,
      responsesAboutMe: responsesAboutUser,
      summary: {
        totalQuestions: weeklyQuestions.length,
        questionsAnswered: weeklyQuestions.filter(q => 
          q.responses.some(r => r.user.equals(userId))
        ).length,
        totalResponsesReceived: responsesAboutUser.reduce((sum, q) => 
          sum + q.responses.filter(r => !r.passed).length, 0
        )
      }
    });
  } catch (error) {
    console.error('Weekly summary error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get arch insights for admin users
router.get('/arch-insights/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { days = 30 } = req.query;
    
    // Verify user is admin of this arch
    const arch = await Arch.findById(archId).populate('members.user');
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const userMember = arch.members.find(member => member.user._id.equals(req.userId));
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const startDate = moment().subtract(parseInt(days), 'days').startOf('day').toDate();
    
    // Get questions for this period
    const questions = await DailyQuestion.find({
      arch: archId,
      date: { $gte: startDate }
    }).populate('asker aboutUser responses.user');
    
    // Calculate member participation
    const memberStats = arch.members.map(member => {
      const memberQuestions = questions.filter(q => q.asker.equals(member.user._id));
      const memberResponses = questions.filter(q => 
        q.responses.some(r => r.user.equals(member.user._id))
      );
      
      return {
        user: {
          id: member.user._id,
          name: member.user.name,
          avatar: member.user.avatar
        },
        questionsAsked: memberQuestions.length,
        questionsAnswered: memberResponses.length,
        responseRate: memberQuestions.length > 0 ? 
          Math.round((memberResponses.length / memberQuestions.length) * 100) : 0,
        totalResponsesGiven: questions.reduce((sum, q) => {
          return sum + q.responses.filter(r => r.user.equals(member.user._id)).length;
        }, 0),
        totalResponsesReceived: questions.reduce((sum, q) => {
          if (q.aboutUser.equals(member.user._id)) {
            return sum + q.responses.filter(r => !r.passed).length;
          }
          return sum;
        }, 0)
      };
    });
    
    // Overall arch stats
    const totalQuestions = questions.length;
    const totalResponses = questions.reduce((sum, q) => sum + q.responses.length, 0);
    const averageResponsesPerQuestion = totalQuestions > 0 ? totalResponses / totalQuestions : 0;
    const completionRate = totalQuestions > 0 ? 
      (questions.filter(q => q.responses.length > 0).length / totalQuestions) * 100 : 0;
    
    res.json({
      archName: arch.name,
      period: `${days} days`,
      memberCount: arch.members.length,
      overallStats: {
        totalQuestions,
        totalResponses,
        averageResponsesPerQuestion: Math.round(averageResponsesPerQuestion * 10) / 10,
        completionRate: Math.round(completionRate),
        questionsPerDay: Math.round((totalQuestions / parseInt(days)) * 10) / 10
      },
      memberStats: memberStats.sort((a, b) => b.responseRate - a.responseRate),
      dailyActivity: this.getDailyActivityChart(questions, parseInt(days))
    });
  } catch (error) {
    console.error('Arch insights error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to get daily activity chart data
function getDailyActivityChart(questions, days) {
  const chartData = [];
  const startDate = moment().subtract(days, 'days');
  
  for (let i = 0; i < days; i++) {
    const date = moment(startDate).add(i, 'days');
    const dayQuestions = questions.filter(q => 
      moment(q.date).isSame(date, 'day')
    );
    
    chartData.push({
      date: date.format('YYYY-MM-DD'),
      questions: dayQuestions.length,
      responses: dayQuestions.reduce((sum, q) => sum + q.responses.length, 0)
    });
  }
  
  return chartData;
}

module.exports = router;