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
  "What's your favorite thing about {name}'s personality?"
];

const sendDailyQuestions = async () => {
  try {
    console.log('🌅 Starting daily question distribution...');
    const arches = await Arch.find({ isActive: true }).populate('members.user');
    
    for (const arch of arches) {
      const activeMembers = arch.members.filter(member => member.user.isActive);
      
      if (activeMembers.length < 2) {
        console.log(`⏭️ Skipping arch ${arch.name} - only ${activeMembers.length} members`);
        continue;
      }
      
      console.log(`📝 Creating questions for arch: ${arch.name} (${activeMembers.length} members)`);
      
      // Create questions for each member
      for (const member of activeMembers) {
        const otherMembers = activeMembers.filter(m => !m.user._id.equals(member.user._id));
        const aboutUser = otherMembers[Math.floor(Math.random() * otherMembers.length)];
        
        const questionTemplate = questions[Math.floor(Math.random() * questions.length)];
        const question = questionTemplate.replace('{name}', aboutUser.user.name);
        
        const deadline = moment().tz(arch.settings.timezone)
          .hour(17).minute(0).second(0).millisecond(0).toDate();
        
        await DailyQuestion.create({
          arch: arch._id,
          date: new Date(),
          asker: member.user._id,
          aboutUser: aboutUser.user._id,
          question,
          deadline,
          responses: []
        });
        
        // Send push notification
        await sendSimpleNotification(
          member.user._id,
          '🌅 Good morning!',
          `New question about ${aboutUser.user.name}`,
          {
            type: 'daily_question',
            archId: arch._id.toString()
          }
        );
        
        console.log(`✅ Question sent to ${member.user.name} about ${aboutUser.user.name}`);
      }
    }
    
    console.log('✅ Daily questions sent successfully');
  } catch (error) {
    console.error('❌ Error sending daily questions:', error);
  }
};

const processDailyResponses = async () => {
  try {
    console.log('📝 Processing daily responses...');
    
    const questions = await DailyQuestion.find({
      processed: false,
      deadline: { $lte: new Date() }
    }).populate('asker aboutUser responses.user arch');
    
    for (const question of questions) {
      // Mark as processed
      question.processed = true;
      await question.save();
      
      // Get responses that have content (not passed)
      const validResponses = question.responses.filter(response => 
        !response.passed && response.response && response.response.trim().length > 0
      );
      
      if (validResponses.length > 0) {
        // Send notification to the person being asked about
        await sendSimpleNotification(
          question.aboutUser._id,
          '💝 Someone shared about you!',
          `${validResponses.length} family member${validResponses.length > 1 ? 's' : ''} shared something about you`,
          {
            type: 'response_shared',
            questionId: question._id.toString(),
            archId: question.arch._id.toString()
          }
        );
        
        console.log(`📬 Notified ${question.aboutUser.name} about ${validResponses.length} responses`);
      }
      
      console.log(`✅ Processed responses for question about ${question.aboutUser.name}`);
    }
    
    console.log('✅ Daily responses processed successfully');
  } catch (error) {
    console.error('❌ Error processing daily responses:', error);
  }
};

module.exports = {
  sendDailyQuestions,
  processDailyResponses
};