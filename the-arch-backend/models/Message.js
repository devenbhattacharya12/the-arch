// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  arch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Arch',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'file']
    },
    url: String,
    filename: String
  }],
  readAt: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);

// services/dailyQuestionService.js
const DailyQuestion = require('../models/DailyQuestion');
const Arch = require('../models/Arch');
const User = require('../models/User');
const moment = require('moment-timezone');

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
    const arches = await Arch.find({ isActive: true }).populate('members.user');
    
    for (const arch of arches) {
      const activeMembers = arch.members.filter(member => member.user.isActive);
      
      if (activeMembers.length < 2) continue; // Need at least 2 people
      
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
      }
    }
    
    console.log('Daily questions sent successfully');
  } catch (error) {
    console.error('Error sending daily questions:', error);
  }
};

const processDailyResponses = async () => {
  try {
    const questions = await DailyQuestion.find({
      processed: false,
      deadline: { $lte: new Date() }
    }).populate('asker aboutUser responses.user');
    
    for (const question of questions) {
      // Mark as processed
      question.processed = true;
      await question.save();
      
      // Send responses to the person being asked about
      // This would trigger notifications/socket events
      console.log(`Processing responses for question about ${question.aboutUser.name}`);
    }
    
    console.log('Daily responses processed successfully');
  } catch (error) {
    console.error('Error processing daily responses:', error);
  }
};

module.exports = {
  sendDailyQuestions,
  processDailyResponses
};