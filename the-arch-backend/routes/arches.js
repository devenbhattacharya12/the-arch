// routes/arches.js - Enhanced Arch Management Routes
const express = require('express');
const Arch = require('../models/Arch');
const User = require('../models/User');
const DailyQuestion = require('../models/DailyQuestion');
const Post = require('../models/Post');
const Message = require('../models/Message');
const GetTogether = require('../models/GetTogether');
const auth = require('../middleware/auth');
const { generateInviteCode } = require('../utils/helpers');
const { sendToArchMembers } = require('../services/simpleNotifications');

const router = express.Router();

// Create new arch
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, settings = {} } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Arch name is required' });
    }
    
    const arch = new Arch({
      name: name.trim(),
      description: description?.trim() || '',
      creator: req.userId,
      inviteCode: generateInviteCode(),
      members: [{
        user: req.userId,
        role: 'admin'
      }],
      settings: {
        questionTime: settings.questionTime || '06:00',
        responseDeadline: settings.responseDeadline || '17:00',
        timezone: settings.timezone || 'America/New_York'
      }
    });
    
    await arch.save();
    
    // Add arch to user's arches
    await User.findByIdAndUpdate(req.userId, {
      $push: { arches: arch._id }
    });
    
    await arch.populate('members.user creator');
    
    console.log(`🏠 User ${req.userId} created arch "${name}"`);
    
    res.status(201).json(arch);
  } catch (error) {
    console.error('Error creating arch:', error);
    res.status(500).json({ message: error.message });
  }
});

// Join arch by invite code
router.post('/join', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({ message: 'Invite code is required' });
    }
    
    const arch = await Arch.findOne({ 
      inviteCode: inviteCode.toUpperCase(), 
      isActive: true 
    });
    
    if (!arch) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }
    
    // Check if user is already a member
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (isMember) {
      return res.status(400).json({ message: 'You are already a member of this arch' });
    }
    
    // Add user to arch
    arch.members.push({ user: req.userId });
    await arch.save();
    
    // Add arch to user's arches
    await User.findByIdAndUpdate(req.userId, {
      $push: { arches: arch._id }
    });
    
    await arch.populate('members.user creator');
    
    // Notify existing members
    const newMember = await User.findById(req.userId);
    await sendToArchMembers(
      arch._id,
      '👋 New family member!',
      `${newMember.name} joined the arch`,
      req.userId,
      {
        type: 'member_joined',
        archId: arch._id.toString(),
        memberId: req.userId
      }
    );
    
    console.log(`🎉 User ${req.userId} joined arch "${arch.name}"`);
    
    res.json(arch);
  } catch (error) {
    console.error('Error joining arch:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user's arches
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'arches',
      populate: {
        path: 'members.user creator',
        select: 'name email avatar lastActive'
      }
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add additional stats for each arch
    const archesWithStats = await Promise.all(
      user.arches.map(async (arch) => {
        const userMember = arch.members.find(m => m.user._id.equals(req.userId));
        
        // Get recent activity count
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const [recentQuestions, recentPosts, recentMessages] = await Promise.all([
          DailyQuestion.countDocuments({
            arch: arch._id,
            date: { $gte: weekAgo }
          }),
          Post.countDocuments({
            arch: arch._id,
            createdAt: { $gte: weekAgo },
            isActive: true
          }),
          Message.countDocuments({
            arch: arch._id,
            createdAt: { $gte: weekAgo },
            isActive: true
          })
        ]);
        
        return {
          ...arch.toObject(),
          userRole: userMember ? userMember.role : 'member',
          joinedAt: userMember ? userMember.joinedAt : null,
          recentActivity: {
            questions: recentQuestions,
            posts: recentPosts,
            messages: recentMessages
          }
        };
      })
    );
    
    res.json(archesWithStats);
  } catch (error) {
    console.error('Error fetching arches:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get specific arch details
router.get('/:archId', auth, async (req, res) => {
  try {
    const arch = await Arch.findById(req.params.archId)
      .populate('members.user creator', 'name email avatar lastActive createdAt');
    
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Verify user is member
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    // Get arch statistics
    const [totalQuestions, totalPosts, totalMessages, totalEvents] = await Promise.all([
      DailyQuestion.countDocuments({ arch: arch._id }),
      Post.countDocuments({ arch: arch._id, isActive: true }),
      Message.countDocuments({ arch: arch._id, isActive: true }),
      GetTogether.countDocuments({ arch: arch._id })
    ]);
    
    const userMember = arch.members.find(m => m.user._id.equals(req.userId));
    
    res.json({
      ...arch.toObject(),
      userRole: userMember ? userMember.role : 'member',
      stats: {
        totalQuestions,
        totalPosts,
        totalMessages,
        totalEvents,
        memberCount: arch.members.length
      }
    });
  } catch (error) {
    console.error('Error fetching arch details:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update arch settings (admin only)
router.put('/:archId', auth, async (req, res) => {
  try {
    const { name, description, settings } = req.body;
    
    const arch = await Arch.findById(req.params.archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Check if user is admin
    const userMember = arch.members.find(member => member.user.equals(req.userId));
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    // Update fields
    if (name) arch.name = name.trim();
    if (description !== undefined) arch.description = description.trim();
    
    if (settings) {
      if (settings.questionTime) arch.settings.questionTime = settings.questionTime;
      if (settings.responseDeadline) arch.settings.responseDeadline = settings.responseDeadline;
      if (settings.timezone) arch.settings.timezone = settings.timezone;
    }
    
    await arch.save();
    await arch.populate('members.user creator');
    
    // Notify members of changes
    const admin = await User.findById(req.userId);
    await sendToArchMembers(
      arch._id,
      '⚙️ Arch settings updated',
      `${admin.name} updated the arch settings`,
      req.userId,
      {
        type: 'arch_updated',
        archId: arch._id.toString()
      }
    );
    
    console.log(`⚙️ Arch ${req.params.archId} updated by admin ${req.userId}`);
    
    res.json(arch);
  } catch (error) {
    console.error('Error updating arch:', error);
    res.status(500).json({ message: error.message });
  }
});

// Change member role (admin only)
router.put('/:archId/members/:userId/role', auth, async (req, res) => {
  try {
    const { archId, userId } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ message: 'Role must be admin or member' });
    }
    
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Check if current user is admin
    const currentUserMember = arch.members.find(member => member.user.equals(req.userId));
    if (!currentUserMember || currentUserMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    // Can't change creator's role
    if (arch.creator.equals(userId)) {
      return res.status(400).json({ message: 'Cannot change creator role' });
    }
    
    // Find target member
    const targetMember = arch.members.find(member => member.user.equals(userId));
    if (!targetMember) {
      return res.status(404).json({ message: 'User is not a member of this arch' });
    }
    
    const oldRole = targetMember.role;
    targetMember.role = role;
    await arch.save();
    
    // Notify arch members
    const [admin, targetUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(userId)
    ]);
    
    await sendToArchMembers(
      archId,
      '👑 Role updated',
      `${admin.name} changed ${targetUser.name}'s role to ${role}`,
      req.userId,
      {
        type: 'role_changed',
        archId,
        targetUserId: userId,
        newRole: role
      }
    );
    
    console.log(`👑 User ${userId} role changed from ${oldRole} to ${role} in arch ${archId}`);
    
    res.json({ 
      message: 'Role updated successfully',
      member: targetMember 
    });
  } catch (error) {
    console.error('Error changing member role:', error);
    res.status(500).json({ message: error.message });
  }
});

// Remove member from arch (admin only)
router.delete('/:archId/members/:userId', auth, async (req, res) => {
  try {
    const { archId, userId } = req.params;
    
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Check if current user is admin
    const currentUserMember = arch.members.find(member => member.user.equals(req.userId));
    if (!currentUserMember || currentUserMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    // Can't remove creator
    if (arch.creator.equals(userId)) {
      return res.status(400).json({ message: 'Cannot remove arch creator' });
    }
    
    // Can't remove yourself
    if (req.userId === userId) {
      return res.status(400).json({ message: 'Use leave arch endpoint to remove yourself' });
    }
    
    // Find and remove member
    const memberIndex = arch.members.findIndex(member => member.user.equals(userId));
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'User is not a member of this arch' });
    }
    
    arch.members.splice(memberIndex, 1);
    await arch.save();
    
    // Remove arch from user's arches
    await User.findByIdAndUpdate(userId, {
      $pull: { arches: archId }
    });
    
    // Notify removed user and remaining members
    const [admin, removedUser] = await Promise.all([
      User.findById(req.userId),
      User.findById(userId)
    ]);
    
    // Notify removed user
    await sendToArchMembers(
      archId,
      '👋 Removed from arch',
      `You were removed from ${arch.name} by ${admin.name}`,
      null, // Don't exclude anyone
      {
        type: 'member_removed',
        archId,
        removedUserId: userId
      }
    );
    
    console.log(`🚪 User ${userId} removed from arch ${archId} by admin ${req.userId}`);
    
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: error.message });
  }
});

// Regenerate invite code (admin only)
router.post('/:archId/regenerate-invite', auth, async (req, res) => {
  try {
    const arch = await Arch.findById(req.params.archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Check if user is admin
    const userMember = arch.members.find(member => member.user.equals(req.userId));
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const oldCode = arch.inviteCode;
    arch.inviteCode = generateInviteCode();
    await arch.save();
    
    console.log(`🔄 Invite code regenerated for arch ${req.params.archId}: ${oldCode} -> ${arch.inviteCode}`);
    
    res.json({ 
      message: 'Invite code regenerated successfully',
      inviteCode: arch.inviteCode 
    });
  } catch (error) {
    console.error('Error regenerating invite code:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete arch (creator only)
router.delete('/:archId', auth, async (req, res) => {
  try {
    const arch = await Arch.findById(req.params.archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Only creator can delete
    if (!arch.creator.equals(req.userId)) {
      return res.status(403).json({ message: 'Only the arch creator can delete this arch' });
    }
    
    // Notify all members before deletion
    const creator = await User.findById(req.userId);
    await sendToArchMembers(
      arch._id,
      '🗑️ Arch deleted',
      `${creator.name} deleted the arch "${arch.name}"`,
      null, // Don't exclude anyone
      {
        type: 'arch_deleted',
        archName: arch.name
      }
    );
    
    // Remove arch from all members' arch lists
    await User.updateMany(
      { arches: arch._id },
      { $pull: { arches: arch._id } }
    );
    
    // Soft delete the arch
    arch.isActive = false;
    await arch.save();
    
    console.log(`🗑️ Arch ${req.params.archId} deleted by creator ${req.userId}`);
    
    res.json({ message: 'Arch deleted successfully' });
  } catch (error) {
    console.error('Error deleting arch:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get arch activity feed (recent activity across all content types)
router.get('/:archId/activity', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { limit = 20, days = 7 } = req.query;
    
    // Verify user is member
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get recent activities
    const [recentPosts, recentQuestions, recentEvents] = await Promise.all([
      Post.find({
        arch: archId,
        createdAt: { $gte: startDate },
        isActive: true
      })
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit)),
      
      DailyQuestion.find({
        arch: archId,
        date: { $gte: startDate },
        processed: true,
        'responses.0': { $exists: true }
      })
      .populate('asker aboutUser', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit)),
      
      GetTogether.find({
        arch: archId,
        createdAt: { $gte: startDate }
      })
      .populate('creator', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
    ]);
    
    // Combine and sort all activities
    const allActivities = [
      ...recentPosts.map(post => ({
        type: 'post',
        id: post._id,
        content: post.content,
        author: post.author,
        createdAt: post.createdAt,
        likesCount: post.likes.length,
        commentsCount: post.comments.length
      })),
      ...recentQuestions.map(q => ({
        type: 'question_responses',
        id: q._id,
        question: q.question,
        aboutUser: q.aboutUser,
        asker: q.asker,
        createdAt: q.createdAt,
        responseCount: q.responses.filter(r => !r.passed).length
      })),
      ...recentEvents.map(event => ({
        type: 'event',
        id: event._id,
        title: event.title,
        creator: event.creator,
        createdAt: event.createdAt,
        scheduledFor: event.scheduledFor,
        attendeeCount: event.invitees.filter(inv => inv.status === 'accepted').length
      }))
    ];
    
    // Sort by creation date and limit
    allActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const limitedActivities = allActivities.slice(0, parseInt(limit));
    
    res.json({
      activities: limitedActivities,
      period: `${days} days`,
      totalCount: allActivities.length
    });
  } catch (error) {
    console.error('Error fetching arch activity:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get arch statistics (for admins)
router.get('/:archId/stats', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { days = 30 } = req.query;
    
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    // Check if user is admin
    const userMember = arch.members.find(member => member.user.equals(req.userId));
    if (!userMember || userMember.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get comprehensive stats
    const [
      totalQuestions,
      totalPosts,
      totalMessages,
      totalEvents,
      activeUsers,
      recentQuestions,
      recentPosts,
      recentMessages
    ] = await Promise.all([
      DailyQuestion.countDocuments({ arch: archId }),
      Post.countDocuments({ arch: archId, isActive: true }),
      Message.countDocuments({ arch: archId, isActive: true }),
      GetTogether.countDocuments({ arch: archId }),
      User.countDocuments({ 
        arches: archId, 
        isActive: true,
        lastActive: { $gte: startDate }
      }),
      DailyQuestion.countDocuments({ 
        arch: archId, 
        date: { $gte: startDate } 
      }),
      Post.countDocuments({ 
        arch: archId, 
        createdAt: { $gte: startDate },
        isActive: true 
      }),
      Message.countDocuments({ 
        arch: archId, 
        createdAt: { $gte: startDate },
        isActive: true 
      })
    ]);
    
    // Calculate engagement rate
    const totalMembers = arch.members.length;
    const engagementRate = totalMembers > 0 ? 
      Math.round((activeUsers / totalMembers) * 100) : 0;
    
    res.json({
      period: `${days} days`,
      overview: {
        totalMembers,
        activeUsers,
        engagementRate,
        totalQuestions,
        totalPosts,
        totalMessages,
        totalEvents
      },
      recent: {
        questions: recentQuestions,
        posts: recentPosts,
        messages: recentMessages
      },
      growth: {
        questionsPerDay: Math.round((recentQuestions / parseInt(days)) * 10) / 10,
        postsPerDay: Math.round((recentPosts / parseInt(days)) * 10) / 10,
        messagesPerDay: Math.round((recentMessages / parseInt(days)) * 10) / 10
      }
    });
  } catch (error) {
    console.error('Error fetching arch stats:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;