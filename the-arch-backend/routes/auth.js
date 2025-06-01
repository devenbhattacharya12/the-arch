const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Create user
    const user = new User({ name, email, password });
    await user.save();
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('arches');
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      arches: user.arches
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update push token for user
router.post('/push-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Push token is required' });
    }
    
    // Update user's push token
    await User.findByIdAndUpdate(req.userId, { pushToken: token });
    
    console.log(`📱 Updated push token for user ${req.userId}`);
    res.json({ message: 'Push token updated successfully' });
  } catch (error) {
    console.error('Error updating push token:', error);
    res.status(500).json({ message: error.message });
  }
});

// Remove push token (for logout)
router.delete('/push-token', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { pushToken: null });
    
    console.log(`📱 Removed push token for user ${req.userId}`);
    res.json({ message: 'Push token removed successfully' });
  } catch (error) {
    console.error('Error removing push token:', error);
    res.status(500).json({ message: error.message });
  }
});

// Test notification endpoint (development only)
router.post('/test-notification', auth, async (req, res) => {
  try {
    const pushNotificationService = require('../services/pushNotificationService');
    
    const result = await pushNotificationService.sendToUser(req.userId, {
      title: '🧪 Test Notification',
      body: 'This is a test notification from The Arch!',
      data: { type: 'test' }
    });
    
    if (result) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(400).json({ message: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;