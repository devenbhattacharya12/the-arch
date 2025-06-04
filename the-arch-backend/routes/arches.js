const express = require('express');
const Arch = require('../models/Arch');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { generateInviteCode } = require('../utils/helpers');

const router = express.Router();

// Create new arch
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const arch = new Arch({
      name,
      description,
      creator: req.userId,
      inviteCode: generateInviteCode(),
      members: [{
        user: req.userId,
        role: 'admin'
      }]
    });
    
    await arch.save();
    
    // Add arch to user's arches
    await User.findByIdAndUpdate(req.userId, {
      $push: { arches: arch._id }
    });
    
    await arch.populate('members.user creator');
    res.status(201).json(arch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Join arch by invite code
router.post('/join', auth, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    const arch = await Arch.findOne({ inviteCode, isActive: true });
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
    res.json(arch);
  } catch (error) {
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
        select: 'name email avatar'
      }
    });
    
    res.json(user.arches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;