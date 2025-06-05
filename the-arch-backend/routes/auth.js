const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendSimpleNotification } = require('../services/simpleNotifications');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }
    
    // Create user
    const user = new User({ 
      name: name.trim(), 
      email: email.toLowerCase().trim(), 
      password 
    });
    await user.save();
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
    
    console.log(`✅ New user registered: ${user.email}`);

    router.put('/notification-settings', auth, async (req, res) => {
  const { dailyQuestions, responses, posts, getTogethers, messages } = req.body;
  
  const user = await User.findById(req.userId);
  
  // Update only provided settings
  Object.assign(user.notificationSettings, {
    ...(typeof dailyQuestions === 'boolean' && { dailyQuestions }),
    ...(typeof responses === 'boolean' && { responses }),
    ...(typeof posts === 'boolean' && { posts }),
    ...(typeof getTogethers === 'boolean' && { getTogethers }),
    ...(typeof messages === 'boolean' && { messages })
  });
  
  await user.save();
  res.json({ message: 'Settings updated', settings: user.notificationSettings });
});
    
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        timezone: user.timezone,
        notificationSettings: user.notificationSettings
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Update last active
    user.lastActive = new Date();
    await user.save();
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
    
    console.log(`✅ User logged in: ${user.email}`);
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        timezone: user.timezone,
        notificationSettings: user.notificationSettings,
        lastActive: user.lastActive
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('arches', 'name description members inviteCode')
      .select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      timezone: user.timezone,
      notificationSettings: user.notificationSettings,
      preferences: user.preferences,
      arches: user.arches,
      lastActive: user.lastActive,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Get user error:', error);
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
    
    // Validate token format (Expo push tokens start with ExponentPushToken)
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('expo-push-token://')) {
      return res.status(400).json({ message: 'Invalid push token format' });
    }
    
    // Update user's push token
    const user = await User.findByIdAndUpdate(
      req.userId, 
      { pushToken: token },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log(`📱 Updated push token for user ${user.email}`);
    res.json({ 
      message: 'Push token updated successfully',
      hasToken: true
    });
  } catch (error) {
    console.error('Error updating push token:', error);
    res.status(500).json({ message: error.message });
  }
});

// Remove push token (for logout)
router.delete('/push-token', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.userId, 
      { pushToken: null },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log(`📱 Removed push token for user ${user.email}`);
    res.json({ 
      message: 'Push token removed successfully',
      hasToken: false
    });
  } catch (error) {
    console.error('Error removing push token:', error);
    res.status(500).json({ message: error.message });
  }
});

// Test notification endpoint (development only)
router.post('/test-notification', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!user.pushToken) {
      return res.status(400).json({ 
        message: 'No push token registered. Please set up push notifications first.' 
      });
    }
    
    const result = await sendSimpleNotification(
      req.userId,
      '🧪 Test Notification',
      'This is a test notification from The Arch! Your push notifications are working correctly.',
      { 
        type: 'test',
        timestamp: new Date().toISOString()
      }
    );
    
    if (result) {
      console.log(`🧪 Test notification sent to ${user.email}`);
      res.json({ 
        message: 'Test notification sent successfully',
        userHasToken: true
      });
    } else {
      res.status(400).json({ 
        message: 'Failed to send test notification. Check your push token setup.',
        userHasToken: !!user.pushToken
      });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ message: error.message });
  }
});

// Logout (remove push token and update last active)
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { 
        pushToken: null,
        lastActive: new Date()
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    console.log(`👋 User logged out: ${user.email}`);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      // Return success even if user doesn't exist (security best practice)
      return res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      });
    }
    
    // Generate reset token
    const resetToken = user.generateResetToken();
    await user.save();
    
    // TODO: Send email with reset token
    // For now, just log it (in production, send email)
    console.log(`🔑 Password reset token for ${user.email}: ${resetToken}`);
    
    res.json({ 
      message: 'If an account with that email exists, a password reset link has been sent.',
      // In development, return the token for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    
    // Update password and clear reset token
    user.password = newPassword;
    user.clearResetToken();
    await user.save();
    
    console.log(`🔑 Password reset successful for ${user.email}`);
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Verify email (placeholder for future implementation)
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }
    
    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ message: 'Invalid verification token' });
    }
    
    user.isVerified = true;
    user.verificationToken = null;
    await user.save();
    
    console.log(`✅ Email verified for ${user.email}`);
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get push notification status
router.get('/push-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      hasToken: !!user.pushToken,
      tokenPreview: user.pushToken ? user.pushToken.substring(0, 20) + '...' : null,
      notificationSettings: user.notificationSettings
    });
  } catch (error) {
    console.error('Push status error:', error);
    res.status(500).json({ message: error.message });
  }
});
// Test notification endpoint
router.post('/test-notification', auth, async (req, res) => {
  try {
    const { Expo } = require('expo-server-sdk');
    
    // Find the current user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!user.pushToken) {
      return res.status(400).json({ message: 'No push token found for user' });
    }
    
    console.log('📱 Testing push notification for:', user.email);
    console.log('📱 Push token:', user.pushToken);
    
    // Create Expo SDK client
    const expo = new Expo();
    
    // Check if the token is valid
    if (!Expo.isExpoPushToken(user.pushToken)) {
      return res.status(400).json({ message: 'Invalid Expo push token' });
    }
    
    // Create the message
    const message = {
      to: user.pushToken,
      sound: 'default',
      title: '🧪 Test Notification',
      body: req.body.message || 'This is a test notification from The Arch! Your push notifications are working correctly.',
      data: { type: 'test' }
    };
    
    console.log('📤 Sending notification:', message.title, '-', message.body);
    
    // Send the notification
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log('✅ Push notification sent:', ticketChunk);
      } catch (error) {
        console.error('❌ Push notification error:', error);
        return res.status(500).json({ 
          message: 'Failed to send notification', 
          error: error.message 
        });
      }
    }
    
    res.json({ 
      message: 'Test notification sent successfully',
      tickets: tickets
    });
    
  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;