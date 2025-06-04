// services/simpleNotifications.js
const User = require('../models/User');
const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

const sendSimpleNotification = async (userId, title, body, data = {}) => {
  try {
    console.log(`📱 Attempting to send notification to user ${userId}`);
    
    const user = await User.findById(userId);
    
    if (!user) {
      console.log(`❌ User ${userId} not found`);
      return false;
    }
    
    if (!user.pushToken) {
      console.log(`📱 No push token for user ${userId}`);
      return false;
    }
    
    // Check notification preferences - map notification types correctly
    const notificationType = data.type;
    if (notificationType) {
      // Map notification types to user settings
      const settingsMap = {
        'dailyQuestions': 'dailyQuestions',
        'daily_question': 'dailyQuestions',
        'responses': 'responses',
        'response_shared': 'responses',
        'posts': 'posts',
        'new_post': 'posts',
        'comment': 'posts',
        'like': 'posts',
        'getTogethers': 'getTogethers',
        'event': 'getTogethers',
        'messages': 'messages',
        'message': 'messages',
        'test': 'posts' // Map test notifications to posts setting
      };
      
      const userSettingKey = settingsMap[notificationType];
      if (userSettingKey && !user.notificationSettings[userSettingKey]) {
        console.log(`User ${userId} has disabled ${userSettingKey} notifications`);
        return false;
      }
    }
    
    // Check that the push token is valid
    if (!Expo.isExpoPushToken(user.pushToken)) {
      console.error(`❌ Invalid push token for user ${userId}: ${user.pushToken}`);
      // Remove invalid token
      user.pushToken = null;
      await user.save();
      return false;
    }

    const message = {
      to: user.pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
      channelId: 'default'
    };

    console.log(`📤 Sending notification: ${title} - ${body}`);
    const ticket = await expo.sendPushNotificationsAsync([message]);
    
    // Handle ticket errors
    if (ticket[0] && ticket[0].status === 'error') {
      console.error('Push notification error:', ticket[0]);
      // If the token is invalid, remove it
      if (ticket[0].details && ticket[0].details.error === 'DeviceNotRegistered') {
        user.pushToken = null;
        await user.save();
      }
      return false;
    }
    
    console.log('✅ Push notification sent:', ticket[0]);
    return true;
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return false;
  }
};

// Send notification to multiple users
const sendToMultipleUsers = async (userIds, title, body, data = {}) => {
  const results = [];
  
  for (const userId of userIds) {
    const result = await sendSimpleNotification(userId, title, body, data);
    results.push({ userId, success: result });
  }
  
  return results;
};

// Send notification to all arch members except one user
const sendToArchMembers = async (archId, title, body, excludeUserId = null, data = {}) => {
  try {
    const Arch = require('../models/Arch');
    const arch = await Arch.findById(archId).populate('members.user');
    
    if (!arch) {
      console.log(`❌ Arch ${archId} not found`);
      return false;
    }

    let userIds = arch.members
      .filter(member => member.user && member.user.isActive)
      .map(member => member.user._id);
    
    // Exclude specific user (e.g., don't notify the person who created the post)
    if (excludeUserId) {
      userIds = userIds.filter(id => !id.equals(excludeUserId));
    }

    console.log(`📤 Sending notifications to ${userIds.length} arch members`);
    return await sendToMultipleUsers(userIds, title, body, data);
  } catch (error) {
    console.error('❌ Error sending arch notifications:', error);
    return false;
  }
};

module.exports = {
  sendSimpleNotification,
  sendToMultipleUsers,
  sendToArchMembers
};