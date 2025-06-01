// services/pushNotificationService.js - Backend Push Notification System
const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

class PushNotificationService {
  constructor() {
    this.expo = expo;
  }

  // Send notification to a single user
  async sendToUser(userId, notification) {
    try {
      const User = require('../models/User');
      const user = await User.findById(userId);
      
      if (!user || !user.pushToken) {
        console.log(`📱 No push token for user ${userId}`);
        return false;
      }

      return await this.sendNotification(user.pushToken, notification);
    } catch (error) {
      console.error('❌ Error sending notification to user:', error);
      return false;
    }
  }

  // Send notification to multiple users
  async sendToUsers(userIds, notification) {
    try {
      const User = require('../models/User');
      const users = await User.find({ 
        _id: { $in: userIds },
        pushToken: { $exists: true, $ne: null }
      });

      const pushTokens = users.map(user => user.pushToken);
      return await this.sendBulkNotifications(pushTokens, notification);
    } catch (error) {
      console.error('❌ Error sending bulk notifications:', error);
      return false;
    }
  }

  // Send notification to all members of an arch
  async sendToArch(archId, notification, excludeUserId = null) {
    try {
      const Arch = require('../models/Arch');
      const arch = await Arch.findById(archId).populate('members.user');
      
      if (!arch) {
        console.log(`❌ Arch ${archId} not found`);
        return false;
      }

      let userIds = arch.members.map(member => member.user._id);
      
      // Exclude specific user (e.g., don't notify the person who created the post)
      if (excludeUserId) {
        userIds = userIds.filter(id => !id.equals(excludeUserId));
      }

      return await this.sendToUsers(userIds, notification);
    } catch (error) {
      console.error('❌ Error sending arch notifications:', error);
      return false;
    }
  }

  // Core notification sending function
  async sendNotification(pushToken, notification) {
    try {
      // Check that the push token is valid
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`❌ Invalid push token: ${pushToken}`);
        return false;
      }

      const message = {
        to: pushToken,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        priority: 'high',
        channelId: 'default',
      };

      const ticket = await this.expo.sendPushNotificationsAsync([message]);
      console.log('✅ Push notification sent:', ticket);
      
      return true;
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      return false;
    }
  }

  // Send notifications in bulk
  async sendBulkNotifications(pushTokens, notification) {
    try {
      // Filter valid push tokens
      const validTokens = pushTokens.filter(token => 
        token && Expo.isExpoPushToken(token)
      );

      if (validTokens.length === 0) {
        console.log('📱 No valid push tokens found');
        return false;
      }

      const messages = validTokens.map(token => ({
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        priority: 'high',
        channelId: 'default',
      }));

      // Send notifications in chunks (Expo recommends max 100 per request)
      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets = [];
      
      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('❌ Error sending notification chunk:', error);
        }
      }

      console.log(`✅ Sent ${tickets.length} push notifications`);
      return true;
    } catch (error) {
      console.error('❌ Error sending bulk notifications:', error);
      return false;
    }
  }

  // Notification templates for different events
  getNotificationTemplate(type, data = {}) {
    const templates = {
      daily_question: {
        title: '🌅 Good morning!',
        body: 'Your daily questions are ready to answer',
        data: { type: 'daily_question', archId: data.archId }
      },
      
      response_shared: {
        title: '💝 Someone shared about you!',
        body: `${data.authorName} shared something beautiful about you`,
        data: { type: 'response_shared', questionId: data.questionId, archId: data.archId }
      },
      
      new_post: {
        title: '📱 New family post',
        body: `${data.authorName} shared a new update`,
        data: { type: 'new_post', postId: data.postId, archId: data.archId }
      },
      
      comment: {
        title: '💬 New comment',
        body: `${data.authorName} commented on your post`,
        data: { type: 'comment', postId: data.postId, archId: data.archId }
      },
      
      like: {
        title: '❤️ Someone liked your post',
        body: `${data.authorName} liked your post`,
        data: { type: 'like', postId: data.postId, archId: data.archId }
      },
      
      event_reminder: {
        title: '🎉 Event reminder',
        body: `${data.eventName} is ${data.timeUntil}`,
        data: { type: 'event', eventId: data.eventId, archId: data.archId }
      }
    };

    return templates[type] || {
      title: 'The Arch',
      body: 'You have a new notification',
      data: { type: 'general' }
    };
  }

  // Helper methods for specific notification types
  async notifyDailyQuestions(archId) {
    const notification = this.getNotificationTemplate('daily_question', { archId });
    return await this.sendToArch(archId, notification);
  }

  async notifyResponseShared(questionId, aboutUserId, authorName) {
    const DailyQuestion = require('../models/DailyQuestion');
    const question = await DailyQuestion.findById(questionId);
    
    const notification = this.getNotificationTemplate('response_shared', { 
      authorName, 
      questionId,
      archId: question.arch 
    });
    
    return await this.sendToUser(aboutUserId, notification);
  }

  async notifyNewPost(postId, archId, authorId, authorName) {
    const notification = this.getNotificationTemplate('new_post', { 
      authorName, 
      postId,
      archId 
    });
    
    return await this.sendToArch(archId, notification, authorId);
  }

  async notifyComment(postId, archId, postAuthorId, commenterName) {
    const notification = this.getNotificationTemplate('comment', { 
      authorName: commenterName, 
      postId,
      archId 
    });
    
    return await this.sendToUser(postAuthorId, notification);
  }

  async notifyLike(postId, archId, postAuthorId, likerName) {
    const notification = this.getNotificationTemplate('like', { 
      authorName: likerName, 
      postId,
      archId 
    });
    
    return await this.sendToUser(postAuthorId, notification);
  }
}

module.exports = new PushNotificationService();