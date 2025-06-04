// routes/gettogethers.js - Complete Get-Together Routes
const express = require('express');
const GetTogether = require('../models/GetTogether');
const Arch = require('../models/Arch');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendToArchMembers } = require('../services/simpleNotifications');

const router = express.Router();

// Get all get-togethers for user's arches
router.get('/', auth, async (req, res) => {
  try {
    const { archId, status, upcoming } = req.query;
    
    // Get user's arches
    const user = await User.findById(req.userId).populate('arches');
    const archIds = archId ? [archId] : user.arches.map(arch => arch._id);
    
    let query = {
      arch: { $in: archIds }
    };
    
    if (status) {
      query.status = status;
    }
    
    if (upcoming === 'true') {
      query.scheduledFor = { $gte: new Date() };
    }
    
    const getTogethers = await GetTogether.find(query)
      .populate('creator', 'name email avatar')
      .populate('arch', 'name')
      .populate('invitees.user', 'name email avatar')
      .populate('timeline.user', 'name avatar')
      .sort({ scheduledFor: 1 });
    
    res.json(getTogethers);
  } catch (error) {
    console.error('Error fetching get-togethers:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get specific get-together by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const getTogether = await GetTogether.findById(req.params.id)
      .populate('creator', 'name email avatar')
      .populate('arch', 'name members')
      .populate('invitees.user', 'name email avatar')
      .populate('timeline.user', 'name avatar');
    
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }
    
    // Verify user is member of the arch
    const arch = await Arch.findById(getTogether.arch._id);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(getTogether);
  } catch (error) {
    console.error('Error fetching get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create new get-together
router.post('/', auth, async (req, res) => {
  try {
    const {
      archId,
      title,
      description,
      type,
      scheduledFor,
      location,
      virtualLink,
      inviteAllMembers = true,
      specificInvitees = []
    } = req.body;
    
    if (!archId || !title || !type || !scheduledFor) {
      return res.status(400).json({ 
        message: 'Arch ID, title, type, and scheduled time are required' 
      });
    }
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId).populate('members.user');
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    // Validate type-specific requirements
    if (type === 'in-person' && !location) {
      return res.status(400).json({ message: 'Location is required for in-person events' });
    }
    
    if (type === 'virtual' && !virtualLink) {
      return res.status(400).json({ message: 'Virtual link is required for virtual events' });
    }
    
    // Create invitee list
    let invitees = [];
    if (inviteAllMembers) {
      // Invite all arch members except creator
      invitees = arch.members
        .filter(member => !member.user._id.equals(req.userId))
        .map(member => ({
          user: member.user._id,
          status: 'pending'
        }));
    } else {
      // Invite specific users
      invitees = specificInvitees.map(userId => ({
        user: userId,
        status: 'pending'
      }));
    }
    
    const getTogether = new GetTogether({
      arch: archId,
      creator: req.userId,
      title,
      description,
      type,
      scheduledFor: new Date(scheduledFor),
      location,
      virtualLink,
      invitees,
      status: 'planning'
    });
    
    await getTogether.save();
    await getTogether.populate('creator arch invitees.user');
    
    // Send notifications to invitees
    const inviteeIds = invitees.map(inv => inv.user);
    const creator = await User.findById(req.userId);
    
    await sendToArchMembers(
      archId,
      '🎉 New event invitation',
      `${creator.name} invited you to "${title}"`,
      req.userId,
      {
        type: 'event_invitation',
        eventId: getTogether._id.toString(),
        archId: archId
      }
    );
    
    // Emit real-time notification
    const io = req.app.get('io');
    if (io) {
      io.to(archId).emit('new-event', {
        event: getTogether,
        creatorName: creator.name
      });
    }
    
    console.log(`🎉 User ${req.userId} created event "${title}" in arch ${archId}`);
    
    res.status(201).json(getTogether);
  } catch (error) {
    console.error('Error creating get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update get-together
router.put('/:id', auth, async (req, res) => {
  try {
    const getTogether = await GetTogether.findById(req.params.id);
    
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }
    
    // Only creator can update
    if (!getTogether.creator.equals(req.userId)) {
      return res.status(403).json({ message: 'Only the creator can update this event' });
    }
    
    const {
      title,
      description,
      type,
      scheduledFor,
      location,
      virtualLink,
      status
    } = req.body;
    
    // Update fields
    if (title) getTogether.title = title;
    if (description !== undefined) getTogether.description = description;
    if (type) getTogether.type = type;
    if (scheduledFor) getTogether.scheduledFor = new Date(scheduledFor);
    if (location !== undefined) getTogether.location = location;
    if (virtualLink !== undefined) getTogether.virtualLink = virtualLink;
    if (status) getTogether.status = status;
    
    await getTogether.save();
    await getTogether.populate('creator arch invitees.user');
    
    // Notify attendees of changes
    const creator = await User.findById(req.userId);
    await sendToArchMembers(
      getTogether.arch._id,
      '📅 Event updated',
      `${creator.name} updated the event "${getTogether.title}"`,
      req.userId,
      {
        type: 'event_updated',
        eventId: getTogether._id.toString(),
        archId: getTogether.arch._id.toString()
      }
    );
    
    console.log(`📅 Event ${req.params.id} updated by user ${req.userId}`);
    
    res.json(getTogether);
  } catch (error) {
    console.error('Error updating get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete get-together
router.delete('/:id', auth, async (req, res) => {
  try {
    const getTogether = await GetTogether.findById(req.params.id);
    
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }
    
    // Only creator or arch admin can delete
    const arch = await Arch.findById(getTogether.arch);
    const userMember = arch.members.find(member => member.user.equals(req.userId));
    const isCreator = getTogether.creator.equals(req.userId);
    const isArchAdmin = userMember && userMember.role === 'admin';
    
    if (!isCreator && !isArchAdmin) {
      return res.status(403).json({ 
        message: 'Only the creator or arch admin can delete this event' 
      });
    }
    
    await GetTogether.findByIdAndDelete(req.params.id);
    
    // Notify attendees
    const user = await User.findById(req.userId);
    await sendToArchMembers(
      getTogether.arch,
      '❌ Event cancelled',
      `${user.name} cancelled the event "${getTogether.title}"`,
      req.userId,
      {
        type: 'event_cancelled',
        eventTitle: getTogether.title,
        archId: getTogether.arch.toString()
      }
    );
    
    console.log(`❌ Event ${req.params.id} deleted by user ${req.userId}`);
    
    res.json({ message: 'Get-together deleted successfully' });
  } catch (error) {
    console.error('Error deleting get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// RSVP to get-together
router.post('/:id/rsvp', auth, async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'declined'
    
    if (!['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ message: 'Status must be "accepted" or "declined"' });
    }
    
    const getTogether = await GetTogether.findById(req.params.id)
      .populate('creator', 'name');
    
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }
    
    // Find user's invitation
    const inviteeIndex = getTogether.invitees.findIndex(
      inv => inv.user.equals(req.userId)
    );
    
    if (inviteeIndex === -1) {
      return res.status(400).json({ message: 'You are not invited to this event' });
    }
    
    // Update RSVP status
    getTogether.invitees[inviteeIndex].status = status;
    getTogether.invitees[inviteeIndex].respondedAt = new Date();
    
    await getTogether.save();
    
    // Notify creator
    const user = await User.findById(req.userId);
    const statusText = status === 'accepted' ? 'accepted' : 'declined';
    
    await sendToArchMembers(
      getTogether.arch,
      `🎉 RSVP Update`,
      `${user.name} ${statusText} your event "${getTogether.title}"`,
      req.userId,
      {
        type: 'event_rsvp',
        eventId: getTogether._id.toString(),
        status: status,
        archId: getTogether.arch.toString()
      }
    );
    
    console.log(`📋 User ${req.userId} ${statusText} event ${req.params.id}`);
    
    res.json({ 
      message: `RSVP updated to ${status}`,
      rsvpStatus: status 
    });
  } catch (error) {
    console.error('Error updating RSVP:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add timeline entry (during or after event)
router.post('/:id/timeline', auth, async (req, res) => {
  try {
    const { type, content, media = [] } = req.body;
    
    if (!type || !content) {
      return res.status(400).json({ message: 'Type and content are required' });
    }
    
    if (!['note', 'photo', 'video'].includes(type)) {
      return res.status(400).json({ message: 'Type must be note, photo, or video' });
    }
    
    const getTogether = await GetTogether.findById(req.params.id);
    
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }
    
    // Verify user is invited or creator
    const isCreator = getTogether.creator.equals(req.userId);
    const isInvited = getTogether.invitees.some(inv => 
      inv.user.equals(req.userId) && inv.status === 'accepted'
    );
    
    if (!isCreator && !isInvited) {
      return res.status(403).json({ 
        message: 'Only attendees can add to the timeline' 
      });
    }
    
    const timelineEntry = {
      user: req.userId,
      type,
      content,
      media,
      timestamp: new Date()
    };
    
    getTogether.timeline.push(timelineEntry);
    await getTogether.save();
    
    await getTogether.populate('timeline.user', 'name avatar');
    
    // Get the newly added entry
    const newEntry = getTogether.timeline[getTogether.timeline.length - 1];
    
    console.log(`📸 User ${req.userId} added timeline entry to event ${req.params.id}`);
    
    res.status(201).json({
      message: 'Timeline entry added successfully',
      entry: newEntry
    });
  } catch (error) {
    console.error('Error adding timeline entry:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get event statistics (for creator)
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const getTogether = await GetTogether.findById(req.params.id)
      .populate('invitees.user', 'name email');
    
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }
    
    // Only creator can view detailed stats
    if (!getTogether.creator.equals(req.userId)) {
      return res.status(403).json({ message: 'Only the creator can view event statistics' });
    }
    
    const stats = {
      totalInvited: getTogether.invitees.length,
      accepted: getTogether.invitees.filter(inv => inv.status === 'accepted').length,
      declined: getTogether.invitees.filter(inv => inv.status === 'declined').length,
      pending: getTogether.invitees.filter(inv => inv.status === 'pending').length,
      timelineEntries: getTogether.timeline.length,
      rsvpRate: getTogether.invitees.length > 0 ? 
        Math.round((getTogether.invitees.filter(inv => inv.status !== 'pending').length / getTogether.invitees.length) * 100) : 0
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching event stats:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;