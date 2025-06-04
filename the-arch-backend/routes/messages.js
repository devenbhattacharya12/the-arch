// routes/messages.js - Complete Private Messaging Routes
const express = require('express');
const Message = require('../models/Message');
const Arch = require('../models/Arch');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendSimpleNotification } = require('../services/simpleNotifications');

const router = express.Router();

// Get conversation history between two users within an arch
router.get('/conversation/:archId/:userId', auth, async (req, res) => {
  try {
    const { archId, userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    // Verify both users are members of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const currentUserIsMember = arch.members.some(member => member.user.equals(req.userId));
    const otherUserIsMember = arch.members.some(member => member.user.equals(userId));
    
    if (!currentUserIsMember || !otherUserIsMember) {
      return res.status(403).json({ message: 'Both users must be members of this arch' });
    }
    
    const skip = (page - 1) * limit;
    
    // Get messages between these two users in this arch
    const messages = await Message.find({
      arch: archId,
      $or: [
        { sender: req.userId, recipient: userId },
        { sender: userId, recipient: req.userId }
      ],
      isActive: true
    })
    .populate('sender', 'name avatar')
    .populate('recipient', 'name avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    // Mark messages from other user as read
    await Message.updateMany({
      arch: archId,
      sender: userId,
      recipient: req.userId,
      readAt: null,
      isActive: true
    }, {
      readAt: new Date()
    });
    
    res.json({
      messages: messages.reverse(), // Return in chronological order
      hasMore: messages.length === parseInt(limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get all conversations for a user within an arch
router.get('/conversations/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId).populate('members.user', 'name avatar email');
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    // Get latest message with each arch member
    const conversations = await Promise.all(
      arch.members
        .filter(member => !member.user._id.equals(req.userId))
        .map(async (member) => {
          const latestMessage = await Message.findOne({
            arch: archId,
            $or: [
              { sender: req.userId, recipient: member.user._id },
              { sender: member.user._id, recipient: req.userId }
            ],
            isActive: true
          })
          .populate('sender', 'name')
          .sort({ createdAt: -1 });
          
          // Count unread messages from this user
          const unreadCount = await Message.countDocuments({
            arch: archId,
            sender: member.user._id,
            recipient: req.userId,
            readAt: null,
            isActive: true
          });
          
          return {
            user: member.user,
            latestMessage,
            unreadCount,
            lastActivity: latestMessage ? latestMessage.createdAt : null
          };
        })
    );
    
    // Sort by latest activity
    conversations.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });
    
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: error.message });
  }
});

// Send a new message
router.post('/', auth, async (req, res) => {
  try {
    const { archId, recipientId, content, media = [] } = req.body;
    
    if (!archId || !recipientId || !content?.trim()) {
      return res.status(400).json({ 
        message: 'Arch ID, recipient ID, and content are required' 
      });
    }
    
    if (recipientId === req.userId) {
      return res.status(400).json({ message: 'Cannot send message to yourself' });
    }
    
    // Verify both users are members of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const senderIsMember = arch.members.some(member => member.user.equals(req.userId));
    const recipientIsMember = arch.members.some(member => member.user.equals(recipientId));
    
    if (!senderIsMember || !recipientIsMember) {
      return res.status(403).json({ message: 'Both users must be members of this arch' });
    }
    
    const message = new Message({
      arch: archId,
      sender: req.userId,
      recipient: recipientId,
      content: content.trim(),
      media
    });
    
    await message.save();
    await message.populate('sender recipient', 'name avatar');
    
    // Send push notification to recipient
    const sender = await User.findById(req.userId);
    await sendSimpleNotification(
      recipientId,
      `💬 Message from ${sender.name}`,
      content.length > 50 ? content.substring(0, 50) + '...' : content,
      {
        type: 'message',
        messageId: message._id.toString(),
        senderId: req.userId,
        archId: archId
      }
    );
    
    // Emit real-time message
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${recipientId}`).emit('new-message', {
        message,
        archId,
        senderName: sender.name
      });
    }
    
    console.log(`💬 Message sent from ${req.userId} to ${recipientId} in arch ${archId}`);
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: error.message });
  }
});

// Mark message as read
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Only recipient can mark as read
    if (!message.recipient.equals(req.userId)) {
      return res.status(403).json({ message: 'You can only mark your own messages as read' });
    }
    
    if (!message.readAt) {
      message.readAt = new Date();
      await message.save();
    }
    
    res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ message: error.message });
  }
});

// Mark all messages from a user as read
router.put('/read-all/:archId/:senderId', auth, async (req, res) => {
  try {
    const { archId, senderId } = req.params;
    
    const result = await Message.updateMany({
      arch: archId,
      sender: senderId,
      recipient: req.userId,
      readAt: null,
      isActive: true
    }, {
      readAt: new Date()
    });
    
    console.log(`📖 Marked ${result.modifiedCount} messages as read`);
    
    res.json({ 
      message: 'Messages marked as read',
      count: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a message (soft delete)
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }
    
    // Only sender can delete their own messages
    if (!message.sender.equals(req.userId)) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }
    
    message.isActive = false;
    await message.save();
    
    console.log(`🗑️ Message ${req.params.messageId} deleted by user ${req.userId}`);
    
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get message statistics for an arch (for admins)
router.get('/stats/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { days = 30 } = req.query;
    
    // Verify user is admin of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const userMember = arch.members.find(member => member.user.equals(req.userId));
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const stats = await Message.aggregate([
      {
        $match: {
          arch: arch._id,
          createdAt: { $gte: startDate },
          isActive: true
        }
      },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          uniqueSenders: { $addToSet: '$sender' },
          uniqueRecipients: { $addToSet: '$recipient' },
          messagesWithMedia: {
            $sum: {
              $cond: [
                { $gt: [{ $size: '$media' }, 0] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);
    
    const result = stats[0] || {
      totalMessages: 0,
      uniqueSenders: [],
      uniqueRecipients: [],
      messagesWithMedia: 0
    };
    
    result.activeUsers = new Set([
      ...result.uniqueSenders,
      ...result.uniqueRecipients
    ]).size;
    
    delete result.uniqueSenders;
    delete result.uniqueRecipients;
    
    res.json({
      period: `${days} days`,
      ...result
    });
  } catch (error) {
    console.error('Error fetching message stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// Search messages (within an arch conversation)
router.get('/search/:archId/:userId', auth, async (req, res) => {
  try {
    const { archId, userId } = req.params;
    const { query, limit = 20 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const messages = await Message.find({
      arch: archId,
      $or: [
        { sender: req.userId, recipient: userId },
        { sender: userId, recipient: req.userId }
      ],
      content: { $regex: query.trim(), $options: 'i' },
      isActive: true
    })
    .populate('sender', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
    
    res.json({
      query: query.trim(),
      results: messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;