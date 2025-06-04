const DailyQuestion = require('../models/DailyQuestion');
const Arch = require('../models/Arch');
const User = require('../models/User');
const moment = require('moment-timezone');
const { sendSimpleNotification, sendToArchMembers } = require('./simpleNotifications');

const questions = [
  "What's something you admire about {name} lately?",
  "How has {name} made you smile recently?",
  "What's one way {name} has supported you this week?",
  "What do you hope {name} knows about how much they mean to the family?",
  "What's a favorite memory you have with {name}?",
  "How has {name} grown or changed in a positive way recently?",
  "What's something {name} does that makes you proud?",
  "What would you like to thank {name} for?",
  "What's a quality of {name}'s that you really appreciate?",
  "How does {name} make family gatherings better?",
  "What's something you've learned from {name}?",
  "What's your favorite thing about {name}'s personality?",
  "What's a way {name} has helped you this month?",
  "How does {name} show love to the family?",
  "What's something {name} does that always makes you laugh?",
  "What do you appreciate most about {name}'s friendship?",
  "How has {name} been there for you during tough times?",
  "What's a special tradition or routine you share with {name}?",
  "What's something unique about {name} that you treasure?",
  "How does {name} inspire you to be better?"
];

const sendDailyQuestions = async (io = null) => {
  try {
    console.log('🌅 Starting daily question distribution...');
    const arches = await Arch.find({ isActive: true }).populate('members.user');
    let totalQuestionsSent = 0;
    
    for (const arch of arches) {
      const activeMembers = arch.members.filter(member => 
        member.user && member.user.isActive && 
        member.user.notificationSettings && 
        member.user.notificationSettings.dailyQuestions
      );
      
      if (activeMembers.length < 2) {
        console.log(`Skipping arch ${arch.name} - not enough active members`);
        continue;
      }
      
      // Check if questions already sent today for this arch
      const today = moment().tz(arch.settings.timezone).startOf('day').toDate();
      const tomorrow = moment(today).add(1, 'day').toDate();
      
      const existingQuestions = await DailyQuestion.countDocuments({
        arch: arch._id,
        date: {
          $gte: today,
          $lt: tomorrow
        }
      });
      
      if (existingQuestions > 0) {
        console.log(`Questions already sent today for arch ${arch.name}`);
        continue;
      }
      
      // Create questions for each member
      const questionsForArch = [];
      
      for (const member of activeMembers) {
        const otherMembers = activeMembers.filter(m => !m.user._id.equals(member.user._id));
        
        // Randomly select someone to ask about
        const aboutUser = otherMembers[Math.floor(Math.random() * otherMembers.length)];
        
        // Select a random question template
        const questionTemplate = questions[Math.floor(Math.random() * questions.length)];
        const question = questionTemplate.replace('{name}', aboutUser.user.name);
        
        // Set deadline based on arch settings
        const deadline = moment().tz(arch.settings.timezone)
          .hour(parseInt(arch.settings.responseDeadline.split(':')[0]))
          .minute(parseInt(arch.settings.responseDeadline.split(':')[1]))
          .second(0)
          .millisecond(0)
          .toDate();
        
        const dailyQuestion = new DailyQuestion({
          arch: arch._id,
          date: today,
          asker: member.user._id,
          aboutUser: aboutUser.user._id,
          question,
          deadline,
          responses: []
        });
        
        questionsForArch.push(dailyQuestion);
      }
      
      // Save all questions for this arch
      if (questionsForArch.length > 0) {
        await DailyQuestion.insertMany(questionsForArch);
        totalQuestionsSent += questionsForArch.length;
        
        console.log(`Sent ${questionsForArch.length} questions to arch: ${arch.name}`);
        
        // Send push notifications to all arch members
        for (const member of activeMembers) {
          const memberQuestion = questionsForArch.find(q => q.asker.equals(member.user._id));
          if (memberQuestion) {
            const aboutUser = activeMembers.find(m => m.user._id.equals(memberQuestion.aboutUser));
            await sendSimpleNotification(
              member.user._id,
              '🌅 Good morning!',
              `New question about ${aboutUser.user.name}`,
              {
                type: 'dailyQuestions',
                archId: arch._id.toString(),
                questionId: memberQuestion._id.toString()
              }
            );
          }
        }
        
        // Emit real-time notification to arch members if io is available
        if (io) {
          io.to(`arch-${arch._id.toString()}`).emit('daily-questions-available', {
            archId: arch._id,
            archName: arch.name,
            questionCount: questionsForArch.length,
            deadline: questionsForArch[0].deadline
          });
        }
      }
    }
    
    console.log(`Daily questions sent successfully. Total: ${totalQuestionsSent} questions across ${arches.length} arches`);
    return { success: true, totalQuestionsSent, archesProcessed: arches.length };
    
  } catch (error) {
    console.error('Error sending daily questions:', error);
    return { success: false, error: error.message };
  }
};

const processDailyResponses = async (io = null) => {
  try {
    console.log('📝 Processing daily responses...');
    
    const questions = await DailyQuestion.find({
      processed: false,
      deadline: { $lte: new Date() }
    }).populate('asker aboutUser responses.user arch');
    
    let processedCount = 0;
    const notifications = [];
    
    for (const question of questions) {
      // Mark as processed
      question.processed = true;
      await question.save();
      processedCount++;
      
      // Only send notifications if there are actual responses (not just passes)
      const actualResponses = question.responses.filter(r => !r.passed && r.response);
      
      if (actualResponses.length > 0) {
        // Send notification to the person being asked about
        await sendSimpleNotification(
          question.aboutUser._id,
          '💝 Family shared about you!',
          `${actualResponses.length} loving response${actualResponses.length > 1 ? 's' : ''} about you`,
          {
            type: 'responses',
            questionId: question._id.toString(),
            archId: question.arch._id.toString()
          }
        );
        
        // Prepare notification data
        const notification = {
          type: 'daily-responses-ready',
          recipientId: question.aboutUser._id,
          archId: question.arch._id,
          archName: question.arch.name,
          question: question.question,
          responseCount: actualResponses.length,
          askerName: question.asker.name,
          questionId: question._id,
          createdAt: new Date()
        };
        
        notifications.push(notification);
        
        // Emit real-time notification if io is available
        if (io) {
          io.to(`user-${question.aboutUser._id.toString()}`).emit('responses-compiled', notification);
          
          // Also notify the arch about the compiled responses
          io.to(`arch-${question.arch._id.toString()}`).emit('arch-responses-ready', {
            aboutUser: question.aboutUser.name,
            question: question.question,
            responseCount: actualResponses.length
          });
        }
        
        console.log(`Processed responses for question about ${question.aboutUser.name}: ${actualResponses.length} responses`);
      } else {
        console.log(`No responses to process for question about ${question.aboutUser.name}`);
      }
    }
    
    console.log(`Daily responses processed successfully. Processed: ${processedCount} questions, Notifications: ${notifications.length}`);
    return { 
      success: true, 
      processedCount, 
      notificationCount: notifications.length,
      notifications 
    };
    
  } catch (error) {
    console.error('Error processing daily responses:', error);
    return { success: false, error: error.message };
  }
};

// Send reminder notifications for unanswered questions
const sendQuestionReminders = async (io = null) => {
  try {
    console.log('⏰ Sending question reminders...');
    const now = new Date();
    
    // Find questions that expire in the next 4 hours and have no responses from their asker
    const pendingQuestions = await DailyQuestion.find({
      deadline: { 
        $gt: now,
        $lt: new Date(now.getTime() + 4 * 60 * 60 * 1000) // Next 4 hours
      },
      processed: false
    }).populate('asker arch');
    
    let remindersSent = 0;
    
    for (const question of pendingQuestions) {
      const hasUserResponse = question.responses.some(r => r.user.equals(question.asker));
      
      if (!hasUserResponse) {
        // Send reminder notification
        const minutesLeft = Math.floor((question.deadline - now) / (1000 * 60));
        
        await sendSimpleNotification(
          question.asker._id,
          '⏰ Question reminder',
          `Don't forget to answer today's question! ${minutesLeft} minutes left.`,
          {
            type: 'dailyQuestions',
            questionId: question._id.toString(),
            archId: question.arch._id.toString()
          }
        );
        
        // Send real-time reminder if io available
        if (io) {
          io.to(`user-${question.asker._id}`).emit('question-reminder', {
            questionId: question._id,
            question: question.question,
            archName: question.arch.name,
            deadline: question.deadline,
            minutesLeft
          });
        }
        
        remindersSent++;
      }
    }
    
    console.log(`Sent ${remindersSent} question reminders`);
    return { success: true, remindersSent };
    
  } catch (error) {
    console.error('Error sending question reminders:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to get questions that need responses for a user
const getPendingQuestionsForUser = async (userId) => {
  try {
    const now = new Date();
    const questions = await DailyQuestion.find({
      asker: userId,
      deadline: { $gt: now },
      'responses.user': { $ne: userId }
    }).populate('aboutUser', 'name avatar')
      .populate('arch', 'name')
      .sort({ deadline: 1 });
    
    return questions;
  } catch (error) {
    console.error('Error getting pending questions:', error);
    return [];
  }
};

// Helper function to get response statistics for a user
const getUserResponseStats = async (userId, archId = null, days = 30) => {
  try {
    const startDate = moment().subtract(days, 'days').startOf('day').toDate();
    
    let query = {
      asker: userId,
      date: { $gte: startDate }
    };
    
    if (archId) {
      query.arch = archId;
    }
    
    const stats = await DailyQuestion.aggregate([
      { $match: query },
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
      (result.questionsAnswered / result.totalQuestions * 100).toFixed(1) : 0;
    
    return result;
  } catch (error) {
    console.error('Error getting user response stats:', error);
    return null;
  }
};

module.exports = {
  sendDailyQuestions,
  processDailyResponses,
  getPendingQuestionsForUser,
  getUserResponseStats,
  sendQuestionReminders,
  questions // Export questions array for potential customization
};